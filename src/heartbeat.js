require("dotenv").config();

const { getSupabaseClient } = require("./lib/supabaseClient");
const { hasBudgetRemaining, recordSpend } = require("./core/budget");
const { runCouncil } = require("./core/council");
const { makeDecision } = require("./core/decision");
const { recordViolations } = require("./core/enforcer");

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
        console.log("💤 No pending missions. Nothing to do this cycle.");
        return;
    }

    console.log(`📌 Processing mission #${mission.id}: ${mission.title}`);

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

    // NOTE: Coder/Deployer steps (actually writing + shipping code) come in the next
    // iteration once this decision loop has been tested end-to-end.
}

main().catch(async (err) => {
    console.error("💥 Heartbeat crashed:", err.message);
    process.exitCode = 1;
});
