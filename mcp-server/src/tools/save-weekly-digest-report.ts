// mcp-server/src/tools/save-weekly-digest-report.ts
import type { ApiClient } from "../api-client.js";

export async function handleSaveWeeklyDigestReport(
  apiClient: ApiClient,
  args: { week: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.saveWeeklyDigestReport(args.week, args.title, args.content);
  return `Weekly digest report saved.\n- **Report ID:** ${result.reportId}\n- **Week:** ${result.week}\n- **Created at:** ${result.createdAt}`;
}
