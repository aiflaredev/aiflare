import type { ApiClient, SessionSummaryData } from "../api-client.js";

export async function handleGetSessionSummary(
  apiClient: ApiClient,
  args: { sessionId: string }
): Promise<string> {
  const data = await apiClient.getSessionSummary(args.sessionId);
  return formatSessionSummary(data);
}

function formatSessionSummary(data: SessionSummaryData): string {
  const lines: string[] = [];

  lines.push(`## Session Summary: ${data.sessionName}`);
  lines.push(`- **Session ID:** ${data.sessionId}`);
  lines.push(`- **Started at:** ${data.startedAt}`);
  lines.push(`- **Total commits:** ${data.summary.totalCommits}`);
  lines.push(`- **Changed files:** ${data.summary.changedFiles.join(", ")}`);

  const tagEntries = Object.entries(data.summary.tagBreakdown);
  if (tagEntries.length > 0) {
    lines.push(`- **Tag breakdown:** ${tagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
  }

  lines.push("");

  for (const entry of data.entries) {
    lines.push(`### ${entry.title}`);
    lines.push(`- **Tag:** ${entry.tag}`);
    lines.push(`- **Commit:** ${entry.commitHash}`);
    lines.push(`- **Date:** ${entry.createdAt}`);
    lines.push(`- **Files:** ${entry.changedFiles.join(", ")}`);
    lines.push(`\n**Intent:**\n${entry.intent}`);
    if (entry.alternatives) {
      lines.push(`\n**Alternatives considered:**\n${entry.alternatives}`);
    }
    lines.push("---");
  }

  return lines.join("\n");
}
