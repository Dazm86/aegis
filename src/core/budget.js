// Groq's free tier has no per-token cost, so this is 0 for now.
// If you later switch to a paid provider, set real per-token prices here
// so the budget cap in .env actually means something.
const PRICE_PER_INPUT_TOKEN = 0;
const PRICE_PER_OUTPUT_TOKEN = 0;

function currentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function estimateCostUsd(usage) {
    if (!usage) return 0;
    const inputCost = (usage.prompt_tokens || 0) * PRICE_PER_INPUT_TOKEN;
    const outputCost = (usage.completion_tokens || 0) * PRICE_PER_OUTPUT_TOKEN;
    return inputCost + outputCost;
}

async function getOrCreateBudget(supabase) {
    const period = currentPeriod();
    const limit = Number(process.env.MONTHLY_BUDGET_USD || 5);

    const { data: existing } = await supabase
        .from("budget_tracker")
        .select("*")
        .eq("period", period)
        .maybeSingle();

    if (existing) return existing;

    const { data: created, error } = await supabase
        .from("budget_tracker")
        .insert({ period, limit_usd: limit, spent_usd: 0 })
        .select()
        .single();

    if (error) throw error;
    return created;
}

async function hasBudgetRemaining(supabase) {
    const budget = await getOrCreateBudget(supabase);
    return budget.spent_usd < budget.limit_usd;
}

async function recordSpend(supabase, usage) {
    const cost = estimateCostUsd(usage);
    if (cost === 0) return;

    const budget = await getOrCreateBudget(supabase);

    await supabase
        .from("budget_tracker")
        .update({
            spent_usd: Number(budget.spent_usd) + cost,
            updated_at: new Date().toISOString()
        })
        .eq("id", budget.id);
}

module.exports = { hasBudgetRemaining, recordSpend, getOrCreateBudget, estimateCostUsd };
