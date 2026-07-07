async function askRole({ roleName, roleDescription, constitution, mission }) {
    const apiKey = process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
    const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";

    if (!apiKey) {
        throw new Error("Missing AI_API_KEY environment variable.");
    }

    const systemPrompt = `You are acting as the "${roleName}" role inside the Aegis system.
Role description: ${roleDescription}

You must strictly follow this constitution:
${JSON.stringify(constitution, null, 2)}

Honesty mandate is critical: never state a guess as fact. If you are not sure, say so and use confidence "low" or "unknown".

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

module.exports = { askRole };
