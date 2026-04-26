export async function handleSavePromptEvaluationReport(apiClient, args) {
    const result = await apiClient.savePromptEvaluationReport(args.sessionId, args.title, args.content);
    return [
        `Prompt evaluation report saved.`,
        `- **Report ID:** ${result.reportId}`,
        `- **Work session ID:** ${result.workSessionId}`,
        `- **Project:** ${result.projectName}`,
        `- **Created at:** ${result.createdAt}`,
    ].join("\n");
}
