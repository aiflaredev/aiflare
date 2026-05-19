import type { ApiClient } from "../api-client.js";

export async function handleSaveWeeklyDigestReport(
  apiClient: ApiClient,
  args: { week: string; title: string; content: string; audience?: "DEV" | "PM" }
): Promise<string> {
  const audience = args.audience ?? "DEV";
  const result = await apiClient.saveWeeklyDigestReport(args.week, args.title, args.content, audience);
  const heading = audience === "PM" ? "PM weekly digest report saved." : "Weekly digest report saved.";
  return `${heading}\n- **Report ID:** ${result.reportId}\n- **Week:** ${result.week}\n- **Audience:** ${result.audience}\n- **Created at:** ${result.createdAt}`;
}
