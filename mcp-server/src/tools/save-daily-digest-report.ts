import type { ApiClient } from "../api-client.js";

export async function handleSaveDailyDigestReport(
  apiClient: ApiClient,
  args: { date: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.saveDailyDigestReport(args.date, args.title, args.content);
  return `Daily digest report saved.\n- **Report ID:** ${result.reportId}\n- **Date:** ${result.date}\n- **Created at:** ${result.createdAt}`;
}
