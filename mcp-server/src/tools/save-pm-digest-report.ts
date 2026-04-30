import type { ApiClient } from "../api-client.js";

export async function handleSavePmDigestReport(
  apiClient: ApiClient,
  args: { week: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.savePmDigestReport(args.week, args.title, args.content);
  return [
    "PM digest report has been saved.",
    `- **Report ID:** ${result.reportId}`,
    `- **Target Week:** ${result.week}`,
    `- **Created At:** ${result.createdAt}`,
  ].join("\n");
}
