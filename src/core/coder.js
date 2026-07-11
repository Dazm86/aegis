const fs = require("fs");
const path = require("path");
const { generateCode } = require("../lib/openaiClient");
const { getActiveTextKey } = require("../lib/apiKeys");

const VALID_CONFIDENCE = ["high", "medium", "low", "unknown"];

const TARGET_FILES = {
    site: path.join(__dirname, "..", "..", "site-staging", "index.html"),
    dashboard: path.join(__dirname, "..", "..", "web-staging", "dashboard.html")
};

async function runCoder({ constitution, mission, supabase }) {
    const target = mission.target === "dashboard" ? "dashboard" : "site";
    const stagingFile = TARGET_FILES[target];

    let currentHtml = "";
    try {
        currentHtml = fs.readFileSync(stagingFile, "utf8");
    } catch {
        currentHtml = "";
    }

    const override = supabase ? await getActiveTextKey(supabase) : null;
    if (override) {
        console.log(`🔑 Using stronger override model for Coder: ${override.model || "(default model for that provider)"}`);
    }

    if (target === "dashboard") {
        console.log("⚠️  This mission targets the OWNER'S CONTROL PANEL (staging copy). Extra caution applies.");
    }

    const result = await generateCode({
        constitution,
        mission,
        currentHtml,
        publicSupabaseUrl: process.env.SUPABASE_URL,
        publicSupabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY,
        override,
        isDashboard: target === "dashboard"
    });

    const violations = [];

    if (!VALID_CONFIDENCE.includes(result.confidence)) {
        violations.push({
            roleId: "coder",
            category: "dishonesty (confident false claim, hidden uncertainty)",
            description: "Coder did not report a valid confidence level."
        });
    }

    if (!result.code || result.code.trim() === "") {
        violations.push({
            roleId: "coder",
            category: "dishonesty (confident false claim, hidden uncertainty)",
            description: "Coder returned empty code with no explanation of why."
        });
    }

    return { result, violations, target };
}

module.exports = { runCoder };
