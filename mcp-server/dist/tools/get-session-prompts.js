export async function handleGetSessionPrompts(apiClient, args) {
    const data = await apiClient.getSessionPrompts(args.sessionId);
    return formatSessionPrompts(data);
}
function formatSessionPrompts(data) {
    return [
        `## Session Prompt Content`,
        `- **Work session ID:** ${data.workSessionId}`,
        ``,
        `### Conversation (JSON Lines)`,
        data.content,
    ].join("\n");
}
