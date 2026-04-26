export async function handleSavePmDigestReport(apiClient, args) {
    const result = await apiClient.savePmDigestReport(args.week, args.title, args.content);
    return [
        "PM digest report has been saved.",
        `- **Report ID:** ${result.reportId}`,
        `- **Target Week:** ${result.week}`,
        `- **Created At:** ${result.createdAt}`,
    ].join("\n");
}
