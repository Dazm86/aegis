// Looks up a user-provided "text" purpose API key in Supabase.
// If found, council.js / coder.js will use it instead of the default Groq key.
// If not found, returns null and callers fall back to default env vars.

async function getActiveTextKey(supabase) {
    try {
        const { data, error } = await supabase
            .from("api_keys")
            .select("*")
            .eq("purpose", "text")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) return null;

        return {
            apiKey: data.api_key,
            baseUrl: data.base_url,
            model: data.model
        };
    } catch {
        return null;
    }
}

module.exports = { getActiveTextKey };
