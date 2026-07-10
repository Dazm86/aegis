const { checkSafety } = require("../lib/openaiClient");
const { getActiveTextKey } = require("../lib/apiKeys");

async function runSafetyCheck(mission, supabase) {
    const override = supabase ? await getActiveTextKey(supabase) : null;
    const result = await checkSafety({ mission, override });
    return result;
}

module.exports = { runSafetyCheck };
