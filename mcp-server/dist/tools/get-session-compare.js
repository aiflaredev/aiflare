export async function handleGetSessionCompare(apiClient, args) {
    const data = await apiClient.compareSessions(args.sessionId1, args.sessionId2);
    return formatSessionCompare(data);
}
function formatSessionCompare(data) {
    const lines = [];
    lines.push("## Session Compare Result");
    lines.push("");
    lines.push(`### Session 1: ${data.session1.sessionName}`);
    lines.push(`- **Session ID:** ${data.session1.sessionId}`);
    lines.push(`- **Date:** ${data.session1.date}`);
    lines.push(`- **Commits:** ${data.session1.commits}`);
    lines.push(`- **Tags:** ${Object.entries(data.session1.tags).map(([t, c]) => `${t}(${c})`).join(", ")}`);
    lines.push(`- **Changed files:** ${data.session1.changedFiles.join(", ")}`);
    if (data.session1.keyDecisions.length > 0) {
        lines.push(`- **Key decisions:**`);
        for (const d of data.session1.keyDecisions) {
            lines.push(`  - ${d}`);
        }
    }
    lines.push("");
    lines.push(`### Session 2: ${data.session2.sessionName}`);
    lines.push(`- **Session ID:** ${data.session2.sessionId}`);
    lines.push(`- **Date:** ${data.session2.date}`);
    lines.push(`- **Commits:** ${data.session2.commits}`);
    lines.push(`- **Tags:** ${Object.entries(data.session2.tags).map(([t, c]) => `${t}(${c})`).join(", ")}`);
    lines.push(`- **Changed files:** ${data.session2.changedFiles.join(", ")}`);
    if (data.session2.keyDecisions.length > 0) {
        lines.push(`- **Key decisions:**`);
        for (const d of data.session2.keyDecisions) {
            lines.push(`  - ${d}`);
        }
    }
    lines.push("");
    lines.push("### Comparison Analysis");
    lines.push(`- **Overlapping changed files:** ${data.comparison.overlappingFiles.length > 0 ? data.comparison.overlappingFiles.join(", ") : "none"}`);
    lines.push(`- **New files in Session 2:** ${data.comparison.newFilesInSession2.length > 0 ? data.comparison.newFilesInSession2.join(", ") : "none"}`);
    lines.push(`- **Continued work:** ${data.comparison.continuedWork ? "yes" : "no"}`);
    lines.push(`- **Tag shift:** ${data.comparison.tagShift}`);
    return lines.join("\n");
}
