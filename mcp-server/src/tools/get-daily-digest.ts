import type { ApiClient, DailyDigestData } from "../api-client.js";

export async function handleGetDailyDigest(
  apiClient: ApiClient,
  args: { date: string }
): Promise<string> {
  const data = await apiClient.getDailyDigest(args.date);
  return formatDailyDigest(data);
}

function formatDailyDigest(data: DailyDigestData): string {
  const lines: string[] = [];
  lines.push(`## Daily Digest: ${data.date}`);
  lines.push(`- **Total commits:** ${data.summary.totalCommits}`);
  lines.push(`- **Total sessions:** ${data.summary.totalSessions}`);
  lines.push(`- **Total changed files:** ${data.summary.totalChangedFiles}`);
  const tagEntries = Object.entries(data.summary.tagBreakdown);
  if (tagEntries.length > 0) {
    lines.push(`- **Tag breakdown:** ${tagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
  }
  lines.push("");
  if (data.sessions.length > 0) {
    lines.push("### Sessions");
    for (const session of data.sessions) {
      lines.push(`\n#### ${session.sessionName}`);
      lines.push(`- **Session ID:** ${session.sessionId}`);
      lines.push(`- **Commits:** ${session.commits}`);
      lines.push(`- **Changed files:** ${session.changedFiles.join(", ")}`);
      if (session.keyDecisions.length > 0) {
        lines.push(`- **Key decisions:**`);
        for (const decision of session.keyDecisions) { lines.push(`  - ${decision}`); }
      }
    }
  }
  if (data.mostChangedFiles.length > 0) {
    lines.push("\n### Most changed files");
    for (const file of data.mostChangedFiles) {
      lines.push(`- **${file.file}** — changed ${file.changeCount} times (${file.tags.join(", ")})`);
    }
  }
  return lines.join("\n");
}
