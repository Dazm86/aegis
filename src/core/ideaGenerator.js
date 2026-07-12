const fs = require("fs");
const path = require("path");
const { generateIdea } = require("../lib/openaiClient");
const { getActiveTextKey } = require("../lib/apiKeys");
const { getRecentHistory } = require("../lib/history");
const { recordSpend } = require("./budget");

const MIN_HOURS_BETWEEN_IDEAS = 12;
const SITE_STAGING_FILE = path.join(__dirname, "..", "..", "site-staging", "index.html");

async function maybeGenerateIdea(supabase) {
    // Don't propose a new idea if there's already something pending in the queue.
    const { data: pendingMissions } = await supabase
        .from("missions")
        .select("id")
        .in("status", ["pending", "owner_override", "running"])
        .limit(1);

    if (pendingMissions && pendingMissions.length > 0) {
        return { generated: false, reason: "queue not empty" };
    }

    // Rate limit: only once every MIN_HOURS_BETWEEN_IDEAS hours, even if idle.
    const { data: stateRow } = await supabase
        .from("system_state")
        .select("value")
        .eq("key", "last_idea_generated_at")
        .maybeSingle();

    const lastGeneratedAt = stateRow?.value ? new Date(stateRow.value) : null;
    if (lastGeneratedAt) {
        const hoursSince = (Date.now() - lastGeneratedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < MIN_HOURS_BETWEEN_IDEAS) {
            return { generated: false, reason: `only ${hoursSince.toFixed(1)}h since last self-generated idea` };
        }
    }

    const constitution = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "..", "config", "constitution.json"), "utf8")
    );

    let currentHtml = "";
    try {
        currentHtml = fs.readFileSync(SITE_STAGING_FILE, "utf8");
    } catch {
        currentHtml = "";
    }

    const override = await getActiveTextKey(supabase);
    const history = await getRecentHistory(supabase);

    const idea = await generateIdea({ constitution, history, currentHtml, override });

    if (idea.usage) {
        await recordSpend(supabase, idea.usage);
    }

    if (!idea.title || !idea.description) {
        await supabase.from("audit_log").insert({
            event_type: "idea_generation_failed",
            payload: { reasoning: idea.reasoning || "no title/description returned" }
        });
        return { generated: false, reason: "AI did not return a usable idea" };
    }

    const { data: inserted, error } = await supabase
        .from("missions")
        .insert({
            title: idea.title,
            description: idea.description,
            target: "site",
            source: "ai_generated"
        })
        .select()
        .single();

    if (error) {
        return { generated: false, reason: `insert failed: ${error.message}` };
    }

    await supabase
        .from("system_state")
        .upsert({ key: "last_idea_generated_at", value: new Date().toISOString() });

    await supabase.from("audit_log").insert({
        event_type: "idea_generated",
        payload: { missionId: inserted.id, title: idea.title, reasoning: idea.reasoning, confidence: idea.confidence }
    });

    return { generated: true, missionId: inserted.id, title: idea.title };
}

module.exports = { maybeGenerateIdea };
