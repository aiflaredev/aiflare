#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { loadConfig } from "./config.js";
import { ApiClient } from "./api-client.js";
import { handleGetSessionSummary } from "./tools/get-session-summary.js";
import { handleSaveSessionReport } from "./tools/save-session-report.js";
import { handleGetSavedSessionReport } from "./tools/get-saved-session-report.js";
import { handleGetDailyDigest } from "./tools/get-daily-digest.js";
import { handleSaveDailyDigestReport } from "./tools/save-daily-digest-report.js";
import { handleGetSessionCompare } from "./tools/get-session-compare.js";
import { handleSaveSessionCompareReport } from "./tools/save-session-compare-report.js";
import { handleGetWeeklyDigest } from "./tools/get-weekly-digest.js";
import { handleSaveWeeklyDigestReport } from "./tools/save-weekly-digest-report.js";
import { handleGetSessionPrompts } from "./tools/get-session-prompts.js";
import { handleSavePromptEvaluationReport } from "./tools/save-prompt-evaluation-report.js";
import { handleWhy } from "./tools/why.js";

const config = loadConfig();

/**
 * Resolves the session ID.
 * Priority: argument → CLAUDE_SESSION_ID environment variable → most recent .context-capture/.claude-prompts-* file
 */
function resolveSessionId(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;

  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
    const dir = join(gitRoot, ".context-capture");
    const prefix = ".claude-prompts-";
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) {
      return basename(files[0].name).slice(prefix.length);
    }
  } catch {
    // Ignore when .context-capture directory is missing or not a git repository
  }
  return undefined;
}

const server = new McpServer({
  name: "aiflare",
  version: "1.0.0",
});

server.tool(
  "get_session_summary",
  "Retrieve a structured summary of a specific Claude Code session. Returns commit count, changed files, tag breakdown, and individual capture entries with intent and alternatives.",
  {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
  },
  async ({ sessionId }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
      return {
        content: [{ type: "text" as const, text: "Session ID is required. Specify sessionId or run inside a Claude Code session." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetSessionSummary(apiClient, { sessionId: resolved });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "save_session_report",
  "Save a session summary report to the AIFlare server. The report will be viewable on the web dashboard.",
  {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
  },
  async ({ sessionId, title, content }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
      return {
        content: [{ type: "text" as const, text: "Session ID is required. Specify sessionId or run inside a Claude Code session." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleSaveSessionReport(apiClient, { sessionId: resolved, title, content });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to save report. The report content is printed above for reference.\n\nError: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "get_saved_session_report",
  "Retrieve the latest saved Markdown report for a past Claude Code session. Use this to inject the previous session's intent/decisions/alternatives into the current session's context. The sessionId must be the session you want to recall (copy from the AIFlare web dashboard); it is NOT the current session.",
  {
    sessionId: z.string().describe("The past Claude session ID to recall. Required. Copy from the web dashboard."),
  },
  async ({ sessionId }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    if (!sessionId || sessionId.trim() === "") {
      return {
        content: [{ type: "text" as const, text: "sessionId is required. Call as /context-inject <sessionId>. Copy the session ID from the web dashboard." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetSavedSessionReport(apiClient, { sessionId });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Map SESSION_REPORT_NOT_FOUND to user-friendly /summarize guidance.
      if (message.includes("Session report not found")) {
        return {
          content: [{ type: "text" as const, text: "No saved report exists for this session. Run /summarize in that session first to create a report." }],
        };
      }
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${message}` }] };
    }
  }
);

server.tool(
  "get_daily_digest",
  "Retrieve a daily digest for a specific date. Returns total commits, sessions, changed files, tag breakdown, and the most frequently changed files.",
  {
    date: z.string().describe("Date in YYYY-MM-DD format (e.g., '2026-04-09')"),
    audience: z.enum(["DEV", "PM"]).optional().describe("Report audience. DEV (default): developer tone. PM: business tone. Affects header text only."),
  },
  async ({ date, audience }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetDailyDigest(apiClient, { date, audience });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "save_daily_digest_report",
  "Save a daily digest report to the AIFlare server. The report will be viewable on the web dashboard.",
  {
    date: z.string().describe("Date the report covers in YYYY-MM-DD format"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
    audience: z.enum(["DEV", "PM"]).optional().describe("Report audience. DEV (default): developer-facing. PM: business-facing."),
  },
  async ({ date, title, content, audience }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleSaveDailyDigestReport(apiClient, { date, title, content, audience });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to save report. The report content is printed above for reference.\n\nError: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "get_session_compare",
  "Compare two Claude Code sessions side by side. Returns per-session stats and a comparison of overlapping files, new files, continued work, and tag shifts. sessionId2 defaults to the session immediately before sessionId1 if omitted.",
  {
    sessionId1: z.string().optional().describe("First session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    sessionId2: z.string().optional().describe("Second session ID to compare against. If omitted, the server selects the previous session."),
  },
  async ({ sessionId1, sessionId2 }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolvedSessionId1 = resolveSessionId(sessionId1);
    if (!resolvedSessionId1) {
      return {
        content: [{ type: "text" as const, text: "Session ID is required. Specify sessionId1 or run inside a Claude Code session." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetSessionCompare(apiClient, { sessionId1: resolvedSessionId1, sessionId2 });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "save_session_compare_report",
  "Save a session comparison report to the AIFlare server. The report will be viewable on the web dashboard.",
  {
    sessionId1: z.string().describe("First session ID"),
    sessionId2: z.string().describe("Second session ID"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
  },
  async ({ sessionId1, sessionId2, title, content }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleSaveSessionCompareReport(apiClient, { sessionId1, sessionId2, title, content });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to save report. The report content is printed above for reference.\n\nError: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

function getCurrentWeek(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
  const dayOfWeek = jan1.getDay() || 7;
  const weekNum = Math.ceil((dayOfYear + dayOfWeek - 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

server.tool(
  "get_weekly_digest",
  "Retrieve a weekly digest. Returns stats, per-member work summaries, key decisions, and most changed files for the specified week. Use audience='PM' to get the same data formatted for a non-technical, business-facing report.",
  {
    week: z.string().describe("ISO 8601 week (e.g., '2026-W15'). If omitted, uses the current week.").optional(),
    audience: z.enum(["DEV", "PM"]).optional().describe("Report audience. DEV (default): developer tone. PM: business tone. Affects header text and formatting."),
  },
  async ({ week, audience }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolvedWeek = week || getCurrentWeek();
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetWeeklyDigest(apiClient, { week: resolvedWeek, audience });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "save_weekly_digest_report",
  "Save a weekly digest report to the AIFlare server. Use audience='PM' for PM-oriented reports, audience='DEV' (or omit) for developer-facing reports. The report will be viewable on the web dashboard with audience filtering.",
  {
    week: z.string().describe("ISO 8601 week the report covers (e.g., '2026-W15')"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
    audience: z.enum(["DEV", "PM"]).optional().describe("Report audience. DEV (default): developer-facing. PM: business-facing."),
  },
  async ({ week, title, content, audience }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleSaveWeeklyDigestReport(apiClient, { week, title, content, audience });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to save report. The report content is printed above for reference.\n\nError: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "get_session_prompts",
  "Retrieve the accumulated user prompts from a Claude Code session. Returns the full conversation content stored in work_session_prompts (JSON Lines), used as input for prompt quality evaluation.",
  {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
  },
  async ({ sessionId }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
      return {
        content: [{ type: "text" as const, text: "Session ID is required. Specify sessionId or run inside a Claude Code session." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleGetSessionPrompts(apiClient, { sessionId: resolved });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "save_prompt_evaluation_report",
  "Save a prompt quality evaluation report to the AIFlare server. The report will be viewable on the web dashboard.",
  {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
  },
  async ({ sessionId, title, content }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
      return {
        content: [{ type: "text" as const, text: "Session ID is required. Specify sessionId or run inside a Claude Code session." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleSavePromptEvaluationReport(apiClient, { sessionId: resolved, title, content });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Failed to save report. The report content is printed above for reference.\n\nError: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

server.tool(
  "why",
  "Explain why a line of code (or file) was written the way it is. Runs git log -L locally to find the commits that touched the line, then retrieves each commit's AI agent intent, alternatives, line-around diff, and conversation from AIFlare as a timeline. Use this when debugging agent-written code instead of guessing at the original design.",
  {
    file: z.string().describe("File path, relative to the git root or absolute"),
    line: z.number().int().positive().optional().describe("Line number to explain. If omitted, returns the timeline for the entire file (up to 5 most recent commits)."),
  },
  async ({ file, line }) => {
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
      };
    }
    const apiClient = new ApiClient(config);
    try {
      const text = await handleWhy(apiClient, { file, line });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP Server failed to start:", error);
  process.exit(1);
});
