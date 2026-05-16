import type { ApiClient } from "../api-client.js";

export async function handleSaveDailyDigestReport(
  apiClient: ApiClient,
  args: { date: string; title: string; content: string; audience?: "DEV" | "PM" }
): Promise<string> {
  const audience = args.audience ?? "DEV";
  const result = await apiClient.saveDailyDigestReport(args.date, args.title, args.content, audience);
  const heading = audience === "PM" ? "PM daily digest report saved." : "Daily digest report saved.";
  return `${heading}\n- **Report ID:** ${result.reportId}\n- **Date:** ${result.date}\n- **Audience:** ${result.audience}\n- **Created at:** ${result.createdAt}`;
}
