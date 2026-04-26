export async function handleGetWeeklyDigest(apiClient, args) {
    const data = await apiClient.getWeeklyDigest(args.week);
    return formatWeeklyDigest(data);
}
function formatWeeklyDigest(data) {
    const lines = [];
    lines.push(`# Weekly Digest: ${data.week} (${data.startDate} ~ ${data.endDate})`);
    lines.push("");
    lines.push("## Team Summary");
    lines.push(`- Commits: ${data.teamStats.totalCommits} | Sessions: ${data.teamStats.totalSessions} | Active members: ${data.teamStats.activeMemberCount}`);
    lines.push(`- Changed files: ${data.teamStats.totalChangedFiles}`);
    const tagEntries = Object.entries(data.teamStats.tagBreakdown);
    if (tagEntries.length > 0) {
        lines.push(`- Tags: ${tagEntries.map(([tag, count]) => `${tag} ${count}`).join(", ")}`);
    }
    lines.push("");
    if (data.keyDecisions.length > 0) {
        lines.push("## Key Decisions This Week");
        data.keyDecisions.forEach((decision, i) => {
            lines.push(`### ${i + 1}. [${decision.tag}] ${decision.title} — ${decision.userName}`);
            lines.push(`- **Intent**: ${decision.intent}`);
            lines.push(`- **Rejected alternatives**: ${decision.alternatives}`);
            lines.push(`- Session: ${decision.sessionName} | Commit: ${decision.commitHash.substring(0, 7)}`);
            lines.push("");
        });
    }
    if (data.memberDigests.length > 0) {
        lines.push("## Per-Member Work Log");
        for (const member of data.memberDigests) {
            lines.push(`### ${member.userName} (${member.stats.sessions} sessions, ${member.stats.commits} commits)`);
            for (const session of member.sessions) {
                const files = session.changedFiles.slice(0, 5).join(", ");
                lines.push(`- **${session.sessionName}** (${session.date.substring(0, 10)}): ${session.commitCount} commits, files: ${files}`);
            }
            if (member.topChangedFiles.length > 0) {
                lines.push(`- Top changed files: ${member.topChangedFiles.join(", ")}`);
            }
            lines.push("");
        }
    }
    if (data.mostChangedFiles.length > 0) {
        lines.push("## Most Changed Files (Top 10)");
        lines.push("| File | Change count | Related tags |");
        lines.push("|------|--------------|--------------|");
        for (const file of data.mostChangedFiles) {
            lines.push(`| ${file.file} | ${file.changeCount} | ${file.tags.join(", ")} |`);
        }
    }
    return lines.join("\n");
}
