import type { ApiClient } from "../api-client.js";

export async function handleSavePromptEvaluationReport(
  apiClient: ApiClient,
  args: { sessionId: string; title: string; content: string }
): Promise<string> {
  const result = await apiClient.savePromptEvaluationReport(args.sessionId, args.title, args.content);
  return [
    `Prompt evaluation report saved.`,
    `- **Report ID:** ${result.reportId}`,
    `- **Work session ID:** ${result.workSessionId}`,
    `- **Project:** ${result.projectName}`,
    `- **Created at:** ${result.createdAt}`,
  ].join("\n");
}
