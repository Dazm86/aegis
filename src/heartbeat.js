require("dotenv").config();

const { getSupabaseClient } = require("./lib/supabaseClient");
const { hasBudgetRemaining, recordSpend } = require("./core/budget");
const { runCouncil } = require("./core/council");
const { makeDecision } = require("./core/decision");
const { recordViolations } = require("./core/enforcer");
const { runCoder } = require("./core/coder");
const { runDeployer } = require("./core/deployer");
const { runSafetyCheck } = require("./core/safetyCheck");
const { maybeGenerateIdea } = require("./core/ideaGenerator");
const { maybePromoteToProduction } = require("./core/promoter");
const fs = require("fs");
const path = require("path");

const constitution = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "config", "constitution.json"), "utf8")
);

async function main() {
    console.log("=================================");
    console.log("🧬 Aegis Heartbeat Starting...");
    console.log("=================================");

const supabase = getSupabaseClient();

    const { data: freezeState } = await supabase
        .from("system_state")
        .select("value")
        .eq("key", "frozen")
        .maybeSingle();

    if (freezeState && freezeState.value === true) {
        console.log("🧊 System is frozen by owner. Skipping this run entirely.");
        return;
    }

    const withinBudget = await hasBudgetRemaining(supabase);
    if (!withinBudget) {
        console.log("🚫 Monthly budget cap reached. Skipping this run.");
        await supabase.from("audit_log").insert({
            event_type: "budget_cap_reached",
            payload: { note: "Heartbeat skipped, budget exhausted." }
        });
        return;
    }

    const { data: mission } = await supabase
        .from("missions")
        .select("*")
        .in("status", ["pending", "owner_override"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

if (!mission) {
        console.log("💤 No pending missions this cycle.");
        try {
            const ideaResult = await maybeGenerateIdea(supabase);
            if (ideaResult.generated) {
                console.log(`🧠 Self-generated a new idea: "${ideaResult.title}" (mission #${ideaResult.missionId})`);
            } else {
                console.log(`🧠 Skipped idea generation: ${ideaResult.reason}`);
            }
        } catch (err) {
            console.error(`⚠️  Idea generation failed: ${err.message}`);
        }
    } else {
        console.log(`📌 Processing mission #${mission.id}: ${mission.title}`);
        try {
            if (mission.status === "owner_override") {
                await processOwnerOverride(supabase, mission);
            } else {
                await processMission(supabase, mission);
            }
        } catch (err) {
            console.error(`⚠️  Mission #${mission.id} failed: ${err.message}`);
            const { data: current } = await supabase
                .from("missions")
                .select("status")
                .eq("id", mission.id)
                .maybeSingle();
            if (current && current.status === "running") {
                await supabase.from("missions").update({ status: "pending" }).eq("id", mission.id);
            }
            await supabase.from("audit_log").insert({
                event_type: "mission_processing_error",
                payload: { missionId: mission.id, error: err.message }
            });
        }
    }

    console.log("🚀 Checking for approved changes to deploy to staging...");
    const { deployedCount } = await runDeployer(supabase);
    if (deployedCount > 0) {
        console.log(`✅ Deployed ${deployedCount} change(s) to site-staging.`);
    } else {
        console.log("💤 Nothing new to deploy.");
    }

    console.log("🏗️  Checking if stable staging changes are ready for production...");
    try {
        const promotionResult = await maybePromoteToProduction(supabase);
        if (promotionResult.promoted) {
            console.log(`🚀 Promoted ${promotionResult.count} change(s) from staging to production!`);
        } else {
            console.log(`🕓 Not promoting yet: ${promotionResult.reason}`);
        }
    } catch (err) {
        console.error(`⚠️  Promotion check failed: ${err.message}`);
    }
}

async function processMission(supabase, mission) {
    await supabase.from("missions").update({ status: "running" }).eq("id", mission.id);

    const { results, violations } = await runCouncil(mission, supabase);

    for (const r of results) {
        await supabase.from("council_decisions").insert({
            mission_id: mission.id,
            role_id: r.roleId,
            response: r.response,
            confidence: r.confidence,
            score: r.score
        });

        if (r.usage) {
            await recordSpend(supabase, r.usage);
        }
    }

    if (violations.length > 0) {
        await recordViolations(supabase, violations);
    }

    const decision = makeDecision(results);

    await supabase.from("decisions").insert({
        mission_id: mission.id,
        approved: decision.approved,
        average_score: decision.averageScore,
        threshold: decision.threshold,
        reasoning: decision.reasoning
    });

    await supabase
        .from("missions")
        .update({ status: decision.approved ? "approved" : "rejected" })
        .eq("id", mission.id);

    console.log("=================================");
    console.log(decision.approved ? "✅ Mission Approved" : "❌ Mission Rejected");
    console.log("Average score:", decision.averageScore, "/ threshold:", decision.threshold);
    console.log("=================================");

    if (decision.approved) {
        await runCoderAndQueue(supabase, mission);
    }
}

async function processOwnerOverride(supabase, mission) {
    await supabase.from("missions").update({ status: "running" }).eq("id", mission.id);

    console.log("🛡️  Owner override active - running SAFETY-ONLY check (bypassing normal scoring)...");

    const safety = await runSafetyCheck(mission, supabase);

    if (safety.usage) {
        await recordSpend(supabase, safety.usage);
    }

    await supabase.from("decisions").insert({
        mission_id: mission.id,
        approved: safety.safe,
        average_score: safety.safe ? 100 : 0,
        threshold: 0,
        reasoning: `[دستور مدیر - فقط بررسی ایمنی] ${safety.reasoning}`
    });

    await supabase
        .from("missions")
        .update({ status: safety.safe ? "approved" : "rejected" })
        .eq("id", mission.id);

    console.log("=================================");
    console.log(safety.safe ? "✅ Owner override APPROVED (safe)" : "❌ Owner override REJECTED (unsafe)");
    console.log("Reasoning:", safety.reasoning);
    console.log("=================================");

    if (safety.safe) {
        await runCoderAndQueue(supabase, mission);
    }
}

async function runCoderAndQueue(supabase, mission) {
    const stillWithinBudget = await hasBudgetRemaining(supabase);
    if (!stillWithinBudget) {
        console.log("🚫 Budget cap reached before Coder could run. Skipping code generation.");
        return;
    }

    console.log("🛠️  Running Coder role...");
    const { result: codeResult, violations: coderViolations } = await runCoder({ constitution, mission, supabase });

    if (codeResult.usage) {
        await recordSpend(supabase, codeResult.usage);
    }

    if (coderViolations.length > 0) {
        await recordViolations(supabase, coderViolations);
    }

    if (codeResult.code && codeResult.code.trim() !== "") {
        await supabase.from("content_queue").insert({
            content_type: "site_update",
            content: JSON.stringify({
                missionId: mission.id,
                missionTitle: mission.title,
                explanation: codeResult.explanation,
                confidence: codeResult.confidence,
                code: codeResult.code
            }),
            status: "pending_review",
            target: mission.target === "dashboard" ? "dashboard" : "site"
        });

        console.log("📥 Code change added to content_queue (status: pending_review).");
    } else {
        console.log("⚠️  Coder did not produce code (see violations/logs). Nothing added to queue.");
    }
}

main().catch(async (err) => {
    console.error("💥 Heartbeat crashed:", err.message);
    process.exitCode = 1;
});
