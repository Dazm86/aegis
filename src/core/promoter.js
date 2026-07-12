const fs = require("fs");
const path = require("path");

const PROMOTION_DELAY_HOURS = 24;
const SITE_STAGING_FILE = path.join(__dirname, "..", "..", "site-staging", "index.html");
const SITE_PROD_FILE = path.join(__dirname, "..", "..", "site", "index.html");

async function maybePromoteToProduction(supabase) {
    const { data: pendingPromotion, error } = await supabase
        .from("content_queue")
        .select("id, deployed_at")
        .eq("target", "site")
        .eq("deployed", true)
        .or("promoted.is.null,promoted.eq.false");

    if (error) {
        return { promoted: false, reason: `query failed: ${error.message}` };
    }

    if (!pendingPromotion || pendingPromotion.length === 0) {
        return { promoted: false, reason: "nothing new to promote" };
    }

    const timestamps = pendingPromotion
        .map(item => item.deployed_at ? new Date(item.deployed_at).getTime() : null)
        .filter(t => t !== null);

    if (timestamps.length === 0) {
        return { promoted: false, reason: "no deployed_at timestamps yet (older items, skipping to be safe)" };
    }

    const mostRecentDeployMs = Math.max(...timestamps);
    const hoursSinceNewest = (Date.now() - mostRecentDeployMs) / (1000 * 60 * 60);

    if (hoursSinceNewest < PROMOTION_DELAY_HOURS) {
        return {
            promoted: false,
            reason: `newest staged change is only ${hoursSinceNewest.toFixed(1)}h old, waiting for ${PROMOTION_DELAY_HOURS}h stability window`
        };
    }

    let stagingHtml;
    try {
        stagingHtml = fs.readFileSync(SITE_STAGING_FILE, "utf8");
    } catch (err) {
        return { promoted: false, reason: `could not read staging file: ${err.message}` };
    }

    fs.writeFileSync(SITE_PROD_FILE, stagingHtml, "utf8");

    const ids = pendingPromotion.map(item => item.id);
    await supabase.from("content_queue").update({ promoted: true }).in("id", ids);

    await supabase.from("audit_log").insert({
        event_type: "promoted_to_production",
        payload: { contentQueueIds: ids, count: ids.length }
    });

    return { promoted: true, count: ids.length };
}

module.exports = { maybePromoteToProduction };
