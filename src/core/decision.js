const APPROVAL_THRESHOLD = 75;

function makeDecision(councilResults) {
    if (councilResults.length === 0) {
        return {
            approved: false,
            averageScore: 0,
            threshold: APPROVAL_THRESHOLD,
            reasoning: "No council responses were available (all roles suspended or failed)."
        };
    }

    const total = councilResults.reduce((sum, r) => sum + r.score, 0);
    const averageScore = Number((total / councilResults.length).toFixed(2));
    const approved = averageScore >= APPROVAL_THRESHOLD;

    const reasoning = councilResults
        .map(r => `${r.roleId} (confidence: ${r.confidence}, score: ${r.score}): ${r.response}`)
        .join(" | ");

    return { approved, averageScore, threshold: APPROVAL_THRESHOLD, reasoning };
}

module.exports = { makeDecision, APPROVAL_THRESHOLD };
