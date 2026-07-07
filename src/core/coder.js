const { generateCode } = require("../lib/openaiClient");

const VALID_CONFIDENCE = ["high", "medium", "low", "unknown"];

async function runCoder({ constitution, mission }) {
    const result = await generateCode({ constitution, mission });

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
