export async function handleSaveSessionReport(apiClient, args) {
    const result = await apiClient.saveSessionReport(args.sessionId, args.title, args.content);
    return `Report saved.\n- **Report ID:** ${result.reportId}\n- **Session ID:** ${result.sessionId}\n- **Created at:** ${result.createdAt}\n\nYou can view it in the dashboard.`;
}
