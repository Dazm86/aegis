// Talks directly to any OpenAI-compatible chat completions endpoint using
// the built-in fetch (no "openai" npm package needed). Defaults to Groq's
// free-tier endpoint.

async function askRole({ roleName, roleDescription, constitution, mission, override }) {
    const apiKey = override?.apiKey || process.env.AI_API_KEY;
    const baseURL = override?.baseUrl || process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
    const model = override?.model || process.env.AI_MODEL || "llama-3.3-70b-versatile";

    if (!apiKey) {
        throw new Error("Missing AI_API_KEY environment variable.");
    }

    const systemPrompt = `You are acting as the "${roleName}" role inside the Aegis system.
Role description: ${roleDescription}

You must strictly follow this constitution:
${JSON.stringify(constitution, null, 2)}

Honesty mandate is critical: never state a guess as fact. If you are not sure, say so and use confidence "low" or "unknown".

IMPORTANT: The mission title/description may be written in Persian (Farsi) or any other language. This is completely normal for this project — do NOT lower your score or confidence just because the content is not in English. Read and understand it in its original language, then assess it exactly as you would in English. Only lower confidence for genuine ambiguity in the idea itself, never for the language it's written in.

Respond ONLY with a JSON object, no markdown, no extra text, in this exact shape:
{
  "response": "your assessment of the mission, in 1-3 sentences",
  "confidence": "high" | "medium" | "low" | "unknown",
  "score": <integer 0-100, how much you approve of this mission proceeding>
}`;

    const userPrompt = `Mission title: ${mission.title}
Mission description: ${mission.description}`;

    const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API request failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    let raw = data.choices[0].message.content.trim();

    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        parsed = {
            response: "Role failed to return valid structured output.",
            confidence: "unknown",
            score: 0
        };
    }

    return { ...parsed, usage: data.usage };
}

async function generateCode({ constitution, mission, currentHtml, publicSupabaseUrl, publicSupabaseAnonKey, override, isDashboard }) {
    const apiKey = override?.apiKey || process.env.AI_API_KEY;
    const baseURL = override?.baseUrl || process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
    const model = override?.model || process.env.AI_MODEL || "llama-3.3-70b-versatile";

    if (!apiKey) {
        throw new Error("Missing AI_API_KEY environment variable.");
    }

    const dbContext = publicSupabaseUrl && publicSupabaseAnonKey
        ? `
You have access to a public, read-restricted Supabase project if the mission needs live data or interactivity:
- Project URL: ${publicSupabaseUrl}
- Public anon key (safe to use in browser JS, protected by Row Level Security): ${publicSupabaseAnonKey}
- Load the client via: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  then: const sb = supabase.createClient("${publicSupabaseUrl}", "${publicSupabaseAnonKey}");
- Tables you are allowed to read: missions (id, title, description, status), content_queue (id, content_type, content, status).
- Tables you are allowed to insert into (only if the mission clearly requires it, and only as an authenticated/anonymous user): missions (title, description).
- Never write raw API keys other than the public anon key above. Never touch service_role keys.
`
        : "";

    const systemPrompt = `You are acting as the "Coder" role inside the Aegis system.
Your job: write a small, safe, self-contained HTML/CSS/JS change that implements the approved mission below.

You must strictly follow this constitution:
${JSON.stringify(constitution, null, 2)}

Here is the CURRENT content of the page you are editing (site-staging/index.html). Base your change on what's actually there — don't duplicate existing sections, and reference real element structure if you need to hook into it:
---CURRENT PAGE START---
${currentHtml || "(page is currently empty/minimal)"}
---CURRENT PAGE END---
${dbContext}
If the mission needs an image or illustration, you can embed one for free with no API key using:
<img src="https://image.pollinations.ai/prompt/URL-ENCODED-ENGLISH-DESCRIPTION?width=800&height=500" alt="..." loading="lazy" />
Replace URL-ENCODED-ENGLISH-DESCRIPTION with a short English description of the desired image, percent-encoded. Only use this if the mission genuinely calls for a visual.
${isDashboard ? `
⚠️ CRITICAL: This mission targets the OWNER'S CONTROL PANEL (a staging copy of it), not the public site.
This page contains the Owner's only tools to control the whole system (approve/reject code, freeze the system,
chat with the Deputy, manage API keys). Extreme caution is required:
- NEVER modify, remove, or interfere with existing <script> logic, function names, element IDs, or the Supabase client setup.
- NEVER touch or duplicate the authentication (initAuth), tab navigation (showTab), or freeze system logic.
- Only ADD new, clearly isolated, purely additive UI (e.g. a new small panel, a new read-only info widget) that cannot break existing functionality.
- If you cannot implement the mission with near-zero risk of breaking the control panel, set confidence to "low" and explain why in your response instead of guessing.
` : ''}
Rules:
- Only output a change that is small, low-risk, and directly implements the mission. Do not invent unrelated features.
- Your "code" field should contain ONLY the new snippet to insert (HTML/CSS/JS), not the whole page again.
- If the mission is too vague or risky to implement safely, say so honestly instead of guessing.
- Never claim the code is tested — it has not been. It goes into a human review queue before anything is deployed.

Respond ONLY with a JSON object, no markdown, no extra text, in this exact shape:
{
  "code": "the HTML/CSS/JS snippet implementing the change",
  "explanation": "1-3 sentences explaining what this code does and where it should go",
  "confidence": "high" | "medium" | "low" | "unknown"
}`;

    const userPrompt = `Mission title: ${mission.title}
Mission description: ${mission.description}`;

    const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.2
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API request failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    let raw = data.choices[0].message.content.trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        parsed = {
            code: "",
            explanation: "Coder failed to return valid structured output.",
            confidence: "unknown"
        };
    }

    return { ...parsed, usage: data.usage };
}

async function checkSafety({ mission, override }) {
    const apiKey = override?.apiKey || process.env.AI_API_KEY;
    const baseURL = override?.baseUrl || process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
    const model = override?.model || process.env.AI_MODEL || "llama-3.3-70b-versatile";

    if (!apiKey) {
        throw new Error("Missing AI_API_KEY environment variable.");
    }

    const systemPrompt = `You are performing an OWNER OVERRIDE safety check inside the Aegis system.
The Owner has manually decided to bypass the normal council scoring for this mission and force it through -
BUT ONLY if it is safe. Your ONLY job is to assess safety, not usefulness, style, or quality.

Answer "unsafe" (safe: false) if the mission, if implemented, could plausibly:
- delete, overwrite, or corrupt existing files or content
- break the site (invalid structure, broken layout, infinite loops, crashes)
- expose secrets, API keys, or credentials
- allow unauthorized database writes/deletes beyond the missions table
- introduce a security vulnerability (XSS, injection, unsafe external scripts)

Otherwise answer "safe" (safe: true), even if the idea is vague, low-value, or not well justified -
usefulness is NOT your concern here, only safety.

Respond ONLY with a JSON object, no markdown, no extra text:
{
  "safe": true | false,
  "reasoning": "1-2 sentences explaining the safety verdict"
}`;

    const userPrompt = `Mission title: ${mission.title}
Mission description: ${mission.description}`;

    const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API request failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    let raw = data.choices[0].message.content.trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        parsed = { safe: false, reasoning: "Safety checker failed to return valid structured output; defaulting to unsafe." };
    }

    return { ...parsed, usage: data.usage };
}

module.exports = { askRole, generateCode, checkSafety };
