import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, message } = await req.json();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // --- بخش جدید: اجرای فوری امن گیت‌هاب ---
    if (action === "trigger_heartbeat") {
      const ghToken = Deno.env.get("GITHUB_PAT");
      if (!ghToken) {
        return new Response(
          JSON.stringify({ error: "GitHub token not configured" }),
          { status: 500, headers: corsHeaders }
        );
      }

      const ghRes = await fetch(
        "https://api.github.com/repos/Dazm86/aegis/actions/workflows/heartbeat.yml/dispatches",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ghToken}`,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "Aegis-Edge-Function"
          },
          body: JSON.stringify({ ref: "main" }),
        }
      );

      if (ghRes.status === 204) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: corsHeaders,
        });
      } else {
        const err = await ghRes.text();
        return new Response(JSON.stringify({ error: err }), {
          status: ghRes.status,
          headers: corsHeaders,
        });
      }
    }

    // --- بخش چت معاون شورا ---
    if (action === "chat_deputy") {
      const aiKey = Deno.env.get("AI_API_KEY");
      const aiUrl = Deno.env.get("AI_BASE_URL") || "https://api.groq.com/openai/v1";
      const aiModel = Deno.env.get("AI_MODEL") || "llama-3.3-70b-versatile";

      if (!aiKey) {
        return new Response(
          JSON.stringify({ error: "AI service not configured" }),
          { status: 500, headers: corsHeaders }
        );
      }

      const systemPrompt = `You are the Deputy (معاون) in the Aegis system. The Owner is speaking to you directly about ideas for missions. Your job: understand their idea, extract the core mission, and suggest a clear title + description. Be concise, ask clarifying questions if needed, and always respond in Farsi when the Owner writes in Farsi. Respond in JSON:
      {
        "understanding": "what you understood from their idea",
        "suggestedTitle": "concise mission title",
        "suggestedDescription": "1-2 sentence clear description",
        "needsClarification": false,
        "clarifyingQuestion": "optional - if needsClarification is true"
      }`;

      const res = await fetch(`${aiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return new Response(
          JSON.stringify({ error: "AI service error: " + err }),
          { status: res.status, headers: corsHeaders }
        );
      }

      const data = await res.json();
      let raw = data.choices[0].message.content.trim();
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {
          understanding: "Failed to parse response",
          suggestedTitle: "Parse error",
          suggestedDescription: "Please try again",
          needsClarification: true,
          clarifyingQuestion: "Could you rephrase your idea?",
        };
      }
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

