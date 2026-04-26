export async function handleGetPmDigest(apiClient, args) {
    const data = await apiClient.getWeeklyDigest(args.week);
    return formatPmDigest(data);
}
function formatPmDigest(data) {
    const lines = [];
    lines.push(`## PM 다이제스트 데이터: ${data.week} (${data.startDate} ~ ${data.endDate})`);
    lines.push("");
    // 팀 통계
    lines.push("### 팀 통계 (raw)");
    lines.push(`- **활성 멤버 수:** ${data.teamStats.activeMemberCount}`);
    lines.push(`- **총 커밋 수:** ${data.teamStats.totalCommits}`);
    lines.push(`- **총 세션 수:** ${data.teamStats.totalSessions}`);
    lines.push(`- **총 변경 파일 수:** ${data.teamStats.totalChangedFiles}`);
    const tagEntries = Object.entries(data.teamStats.tagBreakdown);
    if (tagEntries.length > 0) {
        lines.push(`- **태그 분류:** ${tagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
    }
    lines.push("");
    // 핵심 의사결정
    if (data.keyDecisions.length > 0) {
        lines.push("### 핵심 의사결정 (raw)");
        for (const d of data.keyDecisions) {
            lines.push(`- **${d.title}** — ${d.userName} (${d.date})`);
            lines.push(`  - **의도:** ${d.intent}`);
            if (d.alternatives) {
                lines.push(`  - **기각한 대안:** ${d.alternatives}`);
            }
            lines.push(`  - **태그:** ${d.tag} | **커밋:** ${d.commitHash}`);
        }
        lines.push("");
    }
    // 팀원별 작업 내역
    if (data.memberDigests.length > 0) {
        lines.push("### 팀원별 작업 내역 (raw)");
        for (const m of data.memberDigests) {
            lines.push(`#### ${m.userName}`);
            lines.push(`- **커밋 수:** ${m.stats.commits} | **세션 수:** ${m.stats.sessions}`);
            const memberTagEntries = Object.entries(m.stats.tags);
            if (memberTagEntries.length > 0) {
                lines.push(`- **태그 분류:** ${memberTagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
            }
            if (m.topChangedFiles.length > 0) {
                lines.push(`- **주요 변경 파일:** ${m.topChangedFiles.join(", ")}`);
            }
            for (const s of m.sessions) {
                lines.push(`##### ${s.sessionName} (${s.date})`);
                lines.push(`- **커밋 수:** ${s.commitCount}`);
                if (s.changedFiles.length > 0) {
                    lines.push(`- **변경 파일:** ${s.changedFiles.join(", ")}`);
                }
                if (s.keyDecisions.length > 0) {
                    lines.push(`- **주요 의사결정:**`);
                    for (const k of s.keyDecisions) {
                        lines.push(`  - ${k.title}: ${k.intent}`);
                    }
                }
            }
        }
        lines.push("");
    }
    // 가장 많이 변경된 파일
    if (data.mostChangedFiles.length > 0) {
        lines.push("### 가장 많이 변경된 파일 (raw)");
        for (const f of data.mostChangedFiles) {
            lines.push(`- **${f.file}** — ${f.changeCount}회 변경 (${f.tags.join(", ")})`);
        }
    }
    return lines.join("\n");
}
