import type { ApiClient } from "../api-client.js";

export async function handleSaveSessionReport(
  apiClient: ApiClient,
  args: { sessionId: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.saveSessionReport(args.sessionId, args.title, args.content);
  return `Report saved.\n- **Report ID:** ${result.reportId}\n- **Session ID:** ${result.sessionId}\n- **Created at:** ${result.createdAt}\n\nYou can view it in the dashboard.`;
}
