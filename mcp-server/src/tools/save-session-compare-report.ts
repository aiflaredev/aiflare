import type { ApiClient } from "../api-client.js";

export async function handleSaveSessionCompareReport(
  apiClient: ApiClient,
  args: { sessionId1: string; sessionId2: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.saveSessionCompareReport(args.sessionId1, args.sessionId2, args.title, args.content);
  return `Session compare report saved.\n- **Report ID:** ${result.reportId}\n- **Session 1:** ${result.sessionId1}\n- **Session 2:** ${result.sessionId2}\n- **Created at:** ${result.createdAt}`;
}
