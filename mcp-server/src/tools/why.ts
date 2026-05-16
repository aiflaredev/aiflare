import { execFileSync } from "child_process";
import type { ApiClient, CommitCaptureData } from "../api-client.js";

const COMMIT_HASH_RE = /^[0-9a-f]{40}$/;
const MAX_COMMITS = 5;
const CONVERSATION_CAP = 500;
const SINGLE_MESSAGE_HEAD_CAP = 500;
const DIFF_CONTEXT_RADIUS = 5; // ±5 lines around target line

export interface CommitMeta {
  hash: string;
  date: string;
  subject: string;
}

export interface TimelineItem {
  capture: CommitCaptureData;
  gitMeta: { date: string };
  diffSnippet: string;
  conversationText: string;
}

// ----------------------------------------------------------------------------
// Pure functions (unit tested in mcp-server/test/why.test.mjs)
// ----------------------------------------------------------------------------

/**
 * Parses a single line of `git log --format=%H|%ad|%s --date=short` output.
 * Returns null if the hash is not 40-char hex.
 */
export function parseGitLogLine(line: string): CommitMeta | null {
  // subject can contain '|', so split into exactly 3 parts
  const firstPipe = line.indexOf("|");
  if (firstPipe < 0) return null;
  const hash = line.slice(0, firstPipe);
  if (!COMMIT_HASH_RE.test(hash)) return null;
  const secondPipe = line.indexOf("|", firstPipe + 1);
  if (secondPipe < 0) return null;
  const date = line.slice(firstPipe + 1, secondPipe);
  const subject = line.slice(secondPipe + 1);
  return { hash, date, subject };
}

/**
 * Concatenates conversation messages with newlines, capping total length at 500 chars.
 * If a single message exceeds 500 chars, takes its head with "(truncated)" indicator.
 * Returns empty string if conversation is empty.
 */
export function capConversation(messages: string[]): string {
  if (messages.length === 0) return "";

  // Single message head-truncation case
  if (messages.length === 1 && messages[0].length > SINGLE_MESSAGE_HEAD_CAP) {
    return messages[0].slice(0, SINGLE_MESSAGE_HEAD_CAP) + " ... (truncated)";
  }

  const lines: string[] = [];
  let used = 0;
  let truncated = 0;
  for (const msg of messages) {
    if (used + msg.length > CONVERSATION_CAP && lines.length > 0) {
      truncated = messages.length - lines.length;
      break;
    }
    if (msg.length > SINGLE_MESSAGE_HEAD_CAP) {
      lines.push(msg.slice(0, SINGLE_MESSAGE_HEAD_CAP) + " ... (truncated)");
      used = CONVERSATION_CAP + 1; // force break after this
      truncated = messages.length - lines.length;
      break;
    }
    lines.push(msg);
    used += msg.length + 1; // +1 for joining newline
  }
  let out = lines.join("\n");
  if (truncated > 0) {
    out += `\n\n*(showing partial output; ${messages.length} messages total)*`;
  }
  return out;
}

/**
 * Extracts a diff hunk near `line` from `git show` output.
 * If `line` is undefined, returns the first hunk found.
 * Returns empty string if no relevant hunk exists.
 */
export function extractLineDiff(gitShowOutput: string, line: number | undefined): string {
  const rawLines = gitShowOutput.split("\n");
  const hunkHeader = /^@@\s+-(\d+),?(\d+)?\s+\+(\d+),?(\d+)?\s+@@/;

  // Collect hunks: { header, body, newStart, newCount }
  interface Hunk { header: string; body: string[]; newStart: number; newCount: number; }
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (const ln of rawLines) {
    const m = ln.match(hunkHeader);
    if (m) {
      if (cur) hunks.push(cur);
      const newStart = parseInt(m[3], 10);
      const newCount = m[4] ? parseInt(m[4], 10) : 1;
      cur = { header: ln, body: [], newStart, newCount };
    } else if (cur) {
      cur.body.push(ln);
    }
  }
  if (cur) hunks.push(cur);
  if (hunks.length === 0) return "";

  if (line === undefined) {
    return [hunks[0].header, ...hunks[0].body].join("\n").trimEnd();
  }

  // Pick the hunk whose new-side range overlaps [line - radius, line + radius]
  const lo = line - DIFF_CONTEXT_RADIUS;
  const hi = line + DIFF_CONTEXT_RADIUS;
  for (const h of hunks) {
    const hunkEnd = h.newStart + h.newCount - 1;
    if (h.newStart <= hi && hunkEnd >= lo) {
      return [h.header, ...h.body].join("\n").trimEnd();
    }
  }
  return "";
}

/**
 * Formats a Markdown response for the no-capture case (commits exist but none captured).
 * If `totalCount` is given and exceeds `commits.length`, indicates truncation.
 */
export function formatNoCaptureResponse(
  commits: CommitMeta[],
  withLine: boolean,
  totalCount?: number
): string {
  const subject = withLine ? "line" : "file";
  const total = totalCount ?? commits.length;
  const truncated = total > commits.length;

  const summary = truncated
    ? `Checked the ${commits.length} most recent of ${total} commits, but none are captured in AIFlare.`
    : `${total} commits touched this ${subject}, but none are captured in AIFlare.`;

  const lines = [
    `## Intent history for this ${subject}`,
    ``,
    summary,
    `(These commits were made before AIFlare was set up, or outside Claude Code.)`,
    ``,
    truncated ? `${commits.length} most recent commits:` : `Commits touching this ${subject}:`,
    ...commits.map((c) => `- ${c.hash.slice(0, 8)} (${c.date}) ${c.subject}`),
  ];
  return lines.join("\n");
}

/**
 * Formats the full multi-commit Markdown timeline response.
 * `totalCommits` is the full git log count; `consideredCount` (optional) is how many were
 * actually evaluated against AIFlare. When `consideredCount < totalCommits`, the summary
 * makes the truncation explicit so users don't misread the limit as the full history.
 */
export function formatTimelineResponse(
  items: TimelineItem[],
  meta: { totalCommits: number; consideredCount?: number; withLine: boolean }
): string {
  const subject = meta.withLine ? "line" : "file";
  const consideredCount = meta.consideredCount ?? meta.totalCommits;
  const truncated = consideredCount < meta.totalCommits;

  let summary: string;
  if (truncated) {
    summary = `Showing the ${consideredCount} most recent of ${meta.totalCommits} commits.\n${items.length} of them have AIFlare captures.`;
  } else if (items.length === meta.totalCommits) {
    summary = `Intent captured for all ${meta.totalCommits} commits.`;
  } else {
    summary = `${meta.totalCommits} commits touched this ${subject}; ${items.length} of them have AIFlare captures.`;
  }

  const lines: string[] = [`## Intent history for this ${subject}`, ``, summary, ``, `---`, ``];

  items.forEach((it, idx) => {
    const label =
      items.length === 1 ? "only"
      : idx === 0 ? "latest"
      : idx === items.length - 1 ? "oldest"
      : "earlier";
    const shortHash = it.capture.commitHash.slice(0, 8);

    lines.push(`### ${idx + 1}. ${label} — ${shortHash} (${it.gitMeta.date})`);
    lines.push(``);
    lines.push(`**Title**: ${it.capture.title}`);
    lines.push(`**Tag**: ${it.capture.tag}`);
    lines.push(``);
    lines.push(`#### Intent`);
    lines.push(it.capture.intent);

    if (it.capture.alternatives && it.capture.alternatives.trim() !== "") {
      lines.push(``, `#### Alternatives considered`, it.capture.alternatives);
    }
    if (it.diffSnippet && it.diffSnippet.trim() !== "") {
      const diffLabel = meta.withLine ? "Diff around this line" : "Key changes";
      lines.push(``, `#### ${diffLabel}`, "```diff", it.diffSnippet, "```");
    }
    if (it.conversationText && it.conversationText.trim() !== "") {
      lines.push(``, `#### Conversation behind this commit`, it.conversationText);
    }
    lines.push(``, `---`, ``);
  });

  return lines.join("\n").trimEnd();
}

// ----------------------------------------------------------------------------
// Git executors (not unit tested — covered by E2E smoke test)
// ----------------------------------------------------------------------------

interface ResolveResult {
  ok: boolean;
  commits?: CommitMeta[];
  totalCount?: number;
  gitRoot?: string;
  message?: string;
}

/**
 * Resolves a file (+ optional line) to commit metadata via local git.
 * Returns the most-recent MAX_COMMITS plus the full count so callers can show
 * "N most recent of M commits" when the history is longer than the cap.
 */
function resolveCommitHistory(file: string, line?: number): ResolveResult {
  let gitRoot: string;
  try {
    gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" }).trim();
  } catch {
    return { ok: false, message: "Not in a git repository." };
  }
  try {
    const args = line !== undefined
      ? ["log", "-L", `${line},${line}:${file}`, "--format=%H|%ad|%s", "--date=short"]
      : ["log", "--format=%H|%ad|%s", "--date=short", "--", file];
    const out = execFileSync("git", args, { encoding: "utf-8", cwd: gitRoot });
    const all = out.split("\n")
      .map(parseGitLogLine)
      .filter((c): c is CommitMeta => c !== null);
    const commits = all.slice(0, MAX_COMMITS);
    if (commits.length === 0) {
      const subject = line !== undefined ? `${file}:${line}` : file;
      return { ok: false, message: `No commit history found for ${subject}.` };
    }
    return { ok: true, commits, totalCount: all.length, gitRoot };
  } catch {
    const subject = line !== undefined ? `${file} (line ${line})` : file;
    return { ok: false, message: `git query failed — check the file path (${subject}).` };
  }
}

/** Runs `git show <hash> -- <file>` and returns the relevant diff hunk. */
function getLineDiff(gitRoot: string, hash: string, file: string, line: number | undefined): string {
  try {
    const out = execFileSync(
      "git",
      ["show", hash, "--", file],
      { encoding: "utf-8", cwd: gitRoot }
    );
    return extractLineDiff(out, line);
  } catch {
    return "";
  }
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

export async function handleWhy(
  apiClient: ApiClient,
  args: { file: string; line?: number }
): Promise<string> {
  const resolved = resolveCommitHistory(args.file, args.line);
  if (!resolved.ok) return resolved.message!;

  const commits = resolved.commits!;
  const totalCount = resolved.totalCount!;
  const gitRoot = resolved.gitRoot!;
  const withLine = args.line !== undefined;

  let captures: CommitCaptureData[];
  try {
    captures = await apiClient.getCapturesByCommits(commits.map((c) => c.hash));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return `Error querying AIFlare: ${message}`;
  }

  if (captures.length === 0) {
    return formatNoCaptureResponse(commits, withLine, totalCount);
  }

  // Defensive: re-sort captures into the input order (in case backend reorders)
  const byHash = new Map(captures.map((c) => [c.commitHash, c]));
  const items: TimelineItem[] = [];
  for (const commit of commits) {
    const cap = byHash.get(commit.hash);
    if (!cap) continue;
    items.push({
      capture: cap,
      gitMeta: { date: commit.date },
      diffSnippet: getLineDiff(gitRoot, commit.hash, args.file, args.line),
      conversationText: capConversation(cap.conversation),
    });
  }

  return formatTimelineResponse(items, {
    totalCommits: totalCount,
    consideredCount: commits.length,
    withLine,
  });
}
