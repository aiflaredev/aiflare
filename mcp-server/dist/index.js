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
import { handleGetDailyDigest } from "./tools/get-daily-digest.js";
import { handleSaveDailyDigestReport } from "./tools/save-daily-digest-report.js";
import { handleGetSessionCompare } from "./tools/get-session-compare.js";
import { handleSaveSessionCompareReport } from "./tools/save-session-compare-report.js";
import { handleGetWeeklyDigest } from "./tools/get-weekly-digest.js";
import { handleSaveWeeklyDigestReport } from "./tools/save-weekly-digest-report.js";
import { handleGetSessionPrompts } from "./tools/get-session-prompts.js";
import { handleSavePromptEvaluationReport } from "./tools/save-prompt-evaluation-report.js";
import { handleGetPmDigest } from "./tools/get-pm-digest.js";
import { handleSavePmDigestReport } from "./tools/save-pm-digest-report.js";
const config = loadConfig();
/**
 * 세션 ID를 결정한다.
 * 우선순위: 인자 → CLAUDE_SESSION_ID 환경변수 → .context-capture/.claude-prompts-* 파일 중 최신
 */
function resolveSessionId(explicit) {
    if (explicit)
        return explicit;
    if (process.env.CLAUDE_SESSION_ID)
        return process.env.CLAUDE_SESSION_ID;
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
    }
    catch {
        // .context-capture 디렉터리가 없거나 git 저장소가 아닌 경우 무시
    }
    return undefined;
}
const server = new McpServer({
    name: "aiflare",
    version: "1.0.0",
});
server.tool("get_session_summary", "Retrieve a structured summary of a specific Claude Code session. Returns commit count, changed files, tag breakdown, and individual capture entries with intent and alternatives.", {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
}, async ({ sessionId }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
        return {
            content: [{ type: "text", text: "세션 ID가 필요합니다. sessionId를 지정하거나 Claude Code 세션 내에서 실행해주세요." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetSessionSummary(apiClient, { sessionId: resolved });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_session_report", "Save a session summary report to the AIFlare server. The report will be viewable on the web dashboard.", {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ sessionId, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
        return {
            content: [{ type: "text", text: "세션 ID가 필요합니다. sessionId를 지정하거나 Claude Code 세션 내에서 실행해주세요." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSaveSessionReport(apiClient, { sessionId: resolved, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("get_daily_digest", "Retrieve a daily digest for a specific date. Returns total commits, sessions, changed files, tag breakdown, and the most frequently changed files.", {
    date: z.string().describe("Date in YYYY-MM-DD format (e.g., '2026-04-09')"),
}, async ({ date }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetDailyDigest(apiClient, { date });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_daily_digest_report", "Save a daily digest report to the AIFlare server. The report will be viewable on the web dashboard.", {
    date: z.string().describe("Date the report covers in YYYY-MM-DD format"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ date, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSaveDailyDigestReport(apiClient, { date, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("get_session_compare", "Compare two Claude Code sessions side by side. Returns per-session stats and a comparison of overlapping files, new files, continued work, and tag shifts. sessionId2 defaults to the session immediately before sessionId1 if omitted.", {
    sessionId1: z.string().optional().describe("First session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    sessionId2: z.string().optional().describe("Second session ID to compare against. If omitted, the server selects the previous session."),
}, async ({ sessionId1, sessionId2 }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolvedSessionId1 = resolveSessionId(sessionId1);
    if (!resolvedSessionId1) {
        return {
            content: [{ type: "text", text: "세션 ID가 필요합니다. sessionId1을 지정하거나 Claude Code 세션 내에서 실행해주세요." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetSessionCompare(apiClient, { sessionId1: resolvedSessionId1, sessionId2 });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_session_compare_report", "Save a session comparison report to the AIFlare server. The report will be viewable on the web dashboard.", {
    sessionId1: z.string().describe("First session ID"),
    sessionId2: z.string().describe("Second session ID"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ sessionId1, sessionId2, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSaveSessionCompareReport(apiClient, { sessionId1, sessionId2, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
function getCurrentWeek() {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
    const dayOfWeek = jan1.getDay() || 7;
    const weekNum = Math.ceil((dayOfYear + dayOfWeek - 1) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
server.tool("get_weekly_digest", "Retrieve a weekly digest. Returns stats, per-member work summaries, key decisions (with intent and rejected alternatives), and most changed files for the specified week.", {
    week: z.string().describe("ISO 8601 week (e.g., '2026-W15'). If omitted, uses the current week.").optional(),
}, async ({ week }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolvedWeek = week || getCurrentWeek();
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetWeeklyDigest(apiClient, { week: resolvedWeek });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_weekly_digest_report", "Save a weekly digest report to the AIFlare server. The report will be viewable on the web dashboard.", {
    week: z.string().describe("ISO 8601 week the report covers (e.g., '2026-W15')"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ week, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSaveWeeklyDigestReport(apiClient, { week, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("get_pm_digest", "Retrieve the same weekly digest data as get_weekly_digest, but presented as raw input for a PM-oriented report. Same backend endpoint; the difference is the downstream skill rewrites the data in non-technical, business-facing vocabulary.", {
    week: z.string().describe("ISO 8601 week (e.g., '2026-W15'). If omitted, uses the current week.").optional(),
}, async ({ week }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolvedWeek = week || getCurrentWeek();
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetPmDigest(apiClient, { week: resolvedWeek });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_pm_digest_report", "Save a PM-oriented weekly digest report to the AIFlare server. The report will be viewable on the web dashboard, in a section separate from team weekly digests.", {
    week: z.string().describe("ISO 8601 week the report covers (e.g., '2026-W15')"),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ week, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSavePmDigestReport(apiClient, { week, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("get_session_prompts", "Retrieve the accumulated user prompts from a Claude Code session. Returns the full conversation content stored in work_session_prompts (JSON Lines), used as input for prompt quality evaluation.", {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
}, async ({ sessionId }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
        return {
            content: [{ type: "text", text: "세션 ID가 필요합니다. sessionId를 지정하거나 Claude Code 세션 내에서 실행해주세요." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleGetSessionPrompts(apiClient, { sessionId: resolved });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `Error querying AIFlare: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
server.tool("save_prompt_evaluation_report", "Save a prompt quality evaluation report to the AIFlare server. The report will be viewable on the web dashboard.", {
    sessionId: z.string().optional().describe("Claude session ID. If omitted, uses the current session from CLAUDE_SESSION_ID environment variable."),
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content in Markdown format"),
}, async ({ sessionId, title, content }) => {
    if (!config) {
        return {
            content: [{ type: "text", text: "AIFlare is not configured. Place aiflare.yml in your project root." }],
        };
    }
    const resolved = resolveSessionId(sessionId);
    if (!resolved) {
        return {
            content: [{ type: "text", text: "세션 ID가 필요합니다. sessionId를 지정하거나 Claude Code 세션 내에서 실행해주세요." }],
        };
    }
    const apiClient = new ApiClient(config);
    try {
        const text = await handleSavePromptEvaluationReport(apiClient, { sessionId: resolved, title, content });
        return { content: [{ type: "text", text }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `보고서 저장에 실패했습니다. 보고서 내용은 위에 출력되어 있으니 참고해주세요.\n\n오류: ${e instanceof Error ? e.message : String(e)}` }] };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error("MCP Server failed to start:", error);
    process.exit(1);
});
