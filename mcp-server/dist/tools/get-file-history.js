export async function handleGetFileHistory(apiClient, args) {
    const captures = await apiClient.getFileHistory(args.filePath, args.limit ?? 10);
    if (captures.length === 0) {
        return `No capture history found for file: ${args.filePath}`;
    }
    return formatCaptures(captures, `Capture history for ${args.filePath}`);
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
