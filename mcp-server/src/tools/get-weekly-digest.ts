import type { ApiClient, WeeklyDigestData } from "../api-client.js";

export async function handleGetWeeklyDigest(
  apiClient: ApiClient,
  args: { week: string; audience?: "DEV" | "PM" }
): Promise<string> {
  const data = await apiClient.getWeeklyDigest(args.week);
  const audience = args.audience ?? "DEV";
  return audience === "PM" ? formatPm(data) : formatDev(data);
}

function formatDev(data: WeeklyDigestData): string {
  const lines: string[] = [];
  lines.push(`# Weekly Digest: ${data.week} (${data.startDate} ~ ${data.endDate})`);
  lines.push("");
  lines.push("## Team Summary");
  lines.push(`- Commits: ${data.teamStats.totalCommits} | Sessions: ${data.teamStats.totalSessions} | Active members: ${data.teamStats.activeMemberCount}`);
  lines.push(`- Changed files: ${data.teamStats.totalChangedFiles}`);
  const tagEntries = Object.entries(data.teamStats.tagBreakdown);
  if (tagEntries.length > 0) {
    lines.push(`- Tags: ${tagEntries.map(([tag, count]) => `${tag} ${count}`).join(", ")}`);
  }
  lines.push("");
  if (data.keyDecisions.length > 0) {
    lines.push("## Key Decisions This Week");
    data.keyDecisions.forEach((decision, i) => {
      lines.push(`### ${i + 1}. [${decision.tag}] ${decision.title} — ${decision.userName}`);
      lines.push(`- **Intent**: ${decision.intent}`);
      lines.push(`- **Rejected alternatives**: ${decision.alternatives}`);
      lines.push(`- Session: ${decision.sessionName} | Commit: ${decision.commitHash.substring(0, 7)}`);
      lines.push("");
    });
  }
  if (data.memberDigests.length > 0) {
    lines.push("## Per-Member Work Log");
    for (const member of data.memberDigests) {
      lines.push(`### ${member.userName} (${member.stats.sessions} sessions, ${member.stats.commits} commits)`);
      for (const session of member.sessions) {
        const files = session.changedFiles.slice(0, 5).join(", ");
        lines.push(`- **${session.sessionName}** (${session.date.substring(0, 10)}): ${session.commitCount} commits, files: ${files}`);
      }
      if (member.topChangedFiles.length > 0) {
        lines.push(`- Top changed files: ${member.topChangedFiles.join(", ")}`);
      }
      lines.push("");
    }
  }
  if (data.mostChangedFiles.length > 0) {
    lines.push("## Most Changed Files (Top 10)");
    lines.push("| File | Change count | Related tags |");
    lines.push("|------|--------------|--------------|");
    for (const file of data.mostChangedFiles) {
      lines.push(`| ${file.file} | ${file.changeCount} | ${file.tags.join(", ")} |`);
    }
  }
  return lines.join("\n");
}

function formatPm(data: WeeklyDigestData): string {
  const lines: string[] = [];

  lines.push(`## PM Digest Data: ${data.week} (${data.startDate} ~ ${data.endDate})`);
  lines.push("");

  // Team stats
  lines.push("### Team Stats (raw)");
  lines.push(`- **Active members:** ${data.teamStats.activeMemberCount}`);
  lines.push(`- **Total commits:** ${data.teamStats.totalCommits}`);
  lines.push(`- **Total sessions:** ${data.teamStats.totalSessions}`);
  lines.push(`- **Total changed files:** ${data.teamStats.totalChangedFiles}`);

  const tagEntries = Object.entries(data.teamStats.tagBreakdown);
  if (tagEntries.length > 0) {
    lines.push(`- **Tag breakdown:** ${tagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
  }
  lines.push("");

  // Key decisions
  if (data.keyDecisions.length > 0) {
    lines.push("### Key Decisions (raw)");
    for (const d of data.keyDecisions) {
      lines.push(`- **${d.title}** — ${d.userName} (${d.date})`);
      lines.push(`  - **Intent:** ${d.intent}`);
      if (d.alternatives) {
        lines.push(`  - **Rejected alternatives:** ${d.alternatives}`);
      }
      lines.push(`  - **Tag:** ${d.tag} | **Commit:** ${d.commitHash}`);
    }
    lines.push("");
  }

  // Per-member work log
  if (data.memberDigests.length > 0) {
    lines.push("### Per-Member Work Log (raw)");
    for (const m of data.memberDigests) {
      lines.push(`#### ${m.userName}`);
      lines.push(`- **Commits:** ${m.stats.commits} | **Sessions:** ${m.stats.sessions}`);
      const memberTagEntries = Object.entries(m.stats.tags);
      if (memberTagEntries.length > 0) {
        lines.push(`- **Tag breakdown:** ${memberTagEntries.map(([tag, count]) => `${tag}(${count})`).join(", ")}`);
      }
      if (m.topChangedFiles.length > 0) {
        lines.push(`- **Top changed files:** ${m.topChangedFiles.join(", ")}`);
      }
      for (const s of m.sessions) {
        lines.push(`##### ${s.sessionName} (${s.date})`);
        lines.push(`- **Commits:** ${s.commitCount}`);
        if (s.changedFiles.length > 0) {
          lines.push(`- **Changed files:** ${s.changedFiles.join(", ")}`);
        }
        if (s.keyDecisions.length > 0) {
          lines.push(`- **Key decisions:**`);
          for (const k of s.keyDecisions) {
            lines.push(`  - ${k.title}: ${k.intent}`);
          }
        }
      }
    }
    lines.push("");
  }

  // Most changed files
  if (data.mostChangedFiles.length > 0) {
    lines.push("### Most Changed Files (raw)");
    for (const f of data.mostChangedFiles) {
      lines.push(`- **${f.file}** — changed ${f.changeCount} times (${f.tags.join(", ")})`);
    }
  }

  return lines.join("\n");
}
