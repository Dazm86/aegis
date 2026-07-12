async function getRecentHistory(supabase, limit = 12) {
    const { data: decisions, error } = await supabase
        .from("decisions")
        .select("mission_id, approved, average_score, threshold, reasoning")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error || !decisions || decisions.length === 0) {
        return "";
    }

    const missionIds = decisions.map(d => d.mission_id);
    const { data: missions } = await supabase
        .from("missions")
        .select("id, title")
        .in("id", missionIds);

    const titleById = {};
    (missions || []).forEach(m => { titleById[m.id] = m.title; });

    const lines = decisions.map(d => {
        const title = titleById[d.mission_id] || `#${d.mission_id}`;
        const verdict = d.approved ? "✅ تأیید شد" : "❌ رد شد";
        const reasonSnippet = (d.reasoning || "").toString().slice(0, 160);
        return `- "${title}" -> ${verdict} (امتیاز ${d.average_score}) ${reasonSnippet ? "| دلیل: " + reasonSnippet : ""}`;
    });

    return `تاریخچه‌ی ${lines.length} ماموریت اخیر (برای یادگیری از موفقیت‌ها/شکست‌های قبلی، نه برای تکرار کورکورانه):\n${lines.join("\n")}`;
}

module.exports = { getRecentHistory };
