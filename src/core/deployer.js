const fs = require("fs");
const path = require("path");

const INSERT_MARKER = "<!-- AEGIS_INSERT_POINT -->";

const TARGET_FILES = {
    site: path.join(__dirname, "..", "..", "site-staging", "index.html"),
    dashboard: path.join(__dirname, "..", "..", "web-staging", "dashboard.html")
};

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

    let deployedCount = 0;
    const htmlByTarget = {};

    for (const item of approvedItems) {
        let parsed;
        try {
            parsed = JSON.parse(item.content);
        } catch {
            continue;
        }

        if (!parsed.code || parsed.code.trim() === "") continue;

        const target = item.target === "dashboard" ? "dashboard" : "site";
        const filePath = TARGET_FILES[target];

        if (!(target in htmlByTarget)) {
            try {
                htmlByTarget[target] = fs.readFileSync(filePath, "utf8");
            } catch (err) {
                console.error(`⚠️  Could not read staging file for target "${target}": ${err.message}`);
                continue;
            }
        }

        if (!htmlByTarget[target].includes(INSERT_MARKER)) {
            console.error(`⚠️  No insert marker found in staging file for target "${target}". Skipping item #${item.id}.`);
            continue;
        }

        const block = `\n  <!-- mission #${parsed.missionId}: ${parsed.missionTitle || ""} -->\n  ${parsed.code}\n  ${INSERT_MARKER}`;
        htmlByTarget[target] = htmlByTarget[target].replace(INSERT_MARKER, block);
        deployedCount++;

        await supabase
            .from("content_queue")
            .update({ deployed: true })
            .eq("id", item.id);
    }

    for (const target of Object.keys(htmlByTarget)) {
        fs.writeFileSync(TARGET_FILES[target], htmlByTarget[target], "utf8");
        console.log(`🚀 Deployer applied change(s) to ${target === "dashboard" ? "web-staging/dashboard.html" : "site-staging/index.html"}`);
    }

    return { deployedCount };
}

module.exports = { runDeployer };
