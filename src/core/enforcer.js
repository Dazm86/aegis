const VALID_CONFIDENCE = ["high", "medium", "low", "unknown"];

/**
 * Checks a single council response against the honesty mandate.
 * Returns an array of violation descriptions (empty if none).
 */
function checkResponse(roleId, result) {
    const violations = [];

    if (!VALID_CONFIDENCE.includes(result.confidence)) {
        violations.push({
            roleId,
            category: "dishonesty (confident false claim, hidden uncertainty)",
            description: `Role "${roleId}" did not report a valid confidence level.`
        });
    }

    if (typeof result.score !== "number" || result.score < 0 || result.score > 100) {
        violations.push({
            roleId,
            category: "acting outside assigned role scope",
            description: `Role "${roleId}" returned an invalid score.`
        });
    }

    if (!result.response || result.response.trim() === "") {
        violations.push({
            roleId,
            category: "dishonesty (confident false claim, hidden uncertainty)",
            description: `Role "${roleId}" returned an empty response.`
        });
    }

    return violations;
}

async function recordViolations(supabase, violations) {
    if (violations.length === 0) return;

    await supabase.from("violations").insert(
        violations.map(v => ({
            role_id: v.roleId,
            category: v.category,
            description: v.description,
            severity: "warning"
        }))
    );

    // Check if any role crossed the suspension threshold and disable it.
    // (warningsBeforeSuspension is read from the constitution by the caller if needed;
    // kept simple here at 3 warnings.)
    for (const v of violations) {
        const { count } = await supabase
            .from("violations")
            .select("*", { count: "exact", head: true })
            .eq("role_id", v.roleId);

        if (count && count >= 3) {
            console.log(`🚨 Role "${v.roleId}" reached 3 violations — flagged for suspension review.`);
        }
    }
}

module.exports = { checkResponse, recordViolations };
