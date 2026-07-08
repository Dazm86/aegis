require("dotenv").config();

const { getSupabaseClient } = require("./lib/supabaseClient");
const { hasBudgetRemaining, recordSpend } = require("./core/budget");
const { runCouncil } = require("./core/council");
const { makeDecision } = require("./core/decision");
const { recordViolations } = require("./core/enforcer");
const { runCoder } = require("./core/coder");
const { runDeployer } = require("./core/deployer");
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
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!mission) {
        console.log("💤 No pending missions this cycle.");
    } else {
        console.log(`📌 Processing mission #${mission.id}: ${mission.title}`);
        await processMission(supabase, mission);
    }

    console.log("🚀 Checking for approved changes to deploy to staging...");
    const { deployedCount } = await runDeployer(supabase);
    if (deployedCount > 0) {
        console.log(`✅ Deployed ${deployedCount} change(s) to site-staging.`);
    } else {
        console.log("💤 Nothing new to deploy.");
    }
}

async function processMission(supabase, mission) {
    await supabase.from("missions").update({ status: "running" }).eq("id", mission.id);

    const { results, violations } = await runCouncil(mission);

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
        const stillWithinBudget = await hasBudgetRemaining(supabase);
        if (!stillWithinBudget) {
            console.log("🚫 Budget cap reached before Coder could run. Skipping code generation.");
            return;
        }

        console.log("🛠️  Running Coder role...");
        const { result: codeResult, violations: coderViolations } = await runCoder({ constitution, mission });

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
                status: "pending_review"
            });
            console.log("📥 Code change added to content_queue (status: pending_review).");
        } else {
            console.log("⚠️  Coder did not produce code (see violations/logs). Nothing added to queue.");
        }
    }
}

main().catch(async (err) => {
    console.error("💥 Heartbeat crashed:", err.message);
    process.exitCode = 1;
});
