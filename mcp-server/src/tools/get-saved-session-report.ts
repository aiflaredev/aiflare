import type { ApiClient, SessionReportLatestData } from "../api-client.js";

export async function handleGetSavedSessionReport(
  apiClient: ApiClient,
  args: { sessionId: string }
): Promise<string> {
  const data = await apiClient.getLatestSessionReport(args.sessionId);
  return formatSavedSessionReport(data);
}

function formatSavedSessionReport(data: SessionReportLatestData): string {
  const lines: string[] = [];
  lines.push(`## Injected Session Report: ${data.sessionName}`);
  lines.push(`- **Session ID:** ${data.sessionId}`);
  lines.push(`- **Report ID:** ${data.reportId}`);
  lines.push(`- **Saved at:** ${data.createdAt}`);
  // data.title is intentionally not rendered — by /summarize convention, the title is already the first heading of data.content.
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(data.content);
  return lines.join("\n");
}
