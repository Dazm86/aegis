const fs = require("fs");
const path = require("path");

const STAGING_FILE = path.join(__dirname, "..", "..", "site-staging", "index.html");
const INSERT_MARKER = "<!-- AEGIS_INSERT_POINT -->";

async function runDeployer(supabase) {
    const { data: approvedItems, error } = await supabase
        .from("content_queue")
        .select("*")
        .eq("status", "approved")
        .eq("deployed", false);

    if (error) {
        console.error("⚠️  Deployer could not read content_queue:", error.message);
        return { deployedCount: 0 };
    }

    if (!approvedItems || approvedItems.length === 0) {
        return { deployedCount: 0 };
    }

    let html = fs.readFileSync(STAGING_FILE, "utf8");
    let deployedCount = 0;

    for (const item of approvedItems) {
        let parsed;
        try {
            parsed = JSON.parse(item.content);
        } catch {
            continue;
        }

        if (!parsed.code || parsed.code.trim() === "") continue;

        const block = `\n  <!-- mission #${parsed.missionId}: ${parsed.missionTitle || ""} -->\n  ${parsed.code}\n  ${INSERT_MARKER}`;
        html = html.replace(INSERT_MARKER, block);
        deployedCount++;

        await supabase
            .from("content_queue")
            .update({ deployed: true })
            .eq("id", item.id);
    }

    if (deployedCount > 0) {
        fs.writeFileSync(STAGING_FILE, html, "utf8");
        console.log(`🚀 Deployer applied ${deployedCount} change(s) to site-staging/index.html`);
    }

    return { deployedCount };
}

module.exports = { runDeployer };
