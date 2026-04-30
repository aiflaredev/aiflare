import type { ApiClient, SessionPromptsData } from "../api-client.js";

export async function handleGetSessionPrompts(
  apiClient: ApiClient,
  args: { sessionId: string }
): Promise<string> {
  const data = await apiClient.getSessionPrompts(args.sessionId);
  return formatSessionPrompts(data);
}

function formatSessionPrompts(data: SessionPromptsData): string {
  return [
    `## Session Prompt Content`,
    `- **Work session ID:** ${data.workSessionId}`,
    ``,
    `### Conversation (JSON Lines)`,
    data.content,
  ].join("\n");
}
