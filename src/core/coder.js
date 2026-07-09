const fs = require("fs");
const path = require("path");
const { generateCode } = require("../lib/openaiClient");
const { getActiveTextKey } = require("../lib/apiKeys");

const VALID_CONFIDENCE = ["high", "medium", "low", "unknown"];
const STAGING_FILE = path.join(__dirname, "..", "..", "site-staging", "index.html");

async function runCoder({ constitution, mission, supabase }) {
    let currentHtml = "";
    try {
        currentHtml = fs.readFileSync(STAGING_FILE, "utf8");
    } catch {
        currentHtml = "";
    }

    const override = supabase ? await getActiveTextKey(supabase) : null;
    if (override) {
        console.log(`🔑 Using stronger override model for Coder: ${override.model || "(default model for that provider)"}`);
    }

    const result = await generateCode({
        constitution,
        mission,
        currentHtml,
        publicSupabaseUrl: process.env.SUPABASE_URL,
        publicSupabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY,
        override
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

    return { result, violations };
}

module.exports = { runCoder };
