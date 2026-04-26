export async function handleGetRecentCaptures(apiClient, args) {
    const days = args.days ?? 7;
    const captures = await apiClient.getRecentCaptures(days, args.limit ?? 20);
    if (captures.length === 0) {
        return `No captures found in the last ${days} days.`;
    }
    return formatCaptures(captures, `Recent captures (last ${days} days)`);
}
function formatCaptures(captures, header) {
    const lines = [`## ${header}\n`];
    for (const c of captures) {
        lines.push(`### ${c.title}`);
        lines.push(`- **Tag:** ${c.tag}`);
        lines.push(`- **Commit:** ${c.commitHash}${c.branch ? ` (${c.branch})` : ""}`);
        lines.push(`- **Date:** ${c.createdAt}`);
        lines.push(`- **Files:** ${c.changedFiles.join(", ")}`);
        lines.push(`\n**Intent:**\n${c.intent}`);
        if (c.alternatives) {
            lines.push(`\n**Alternatives considered:**\n${c.alternatives}`);
        }
        lines.push("---");
    }
    return lines.join("\n");
}
