export async function handleSaveWeeklyDigestReport(apiClient, args) {
    const result = await apiClient.saveWeeklyDigestReport(args.week, args.title, args.content);
    return `Weekly digest report saved.\n- **Report ID:** ${result.reportId}\n- **Week:** ${result.week}\n- **Created at:** ${result.createdAt}`;
}
