export async function handleSaveDailyDigestReport(apiClient, args) {
    const result = await apiClient.saveDailyDigestReport(args.date, args.title, args.content);
    return `Daily digest report saved.\n- **Report ID:** ${result.reportId}\n- **Date:** ${result.date}\n- **Created at:** ${result.createdAt}`;
}
