import type { Config } from "./config.js";
export interface SessionSummaryEntry {
    title: string;
    intent: string;
    alternatives: string | null;
    tag: string;
    commitHash: string;
    changedFiles: string[];
    createdAt: string;
}
export interface SessionSummaryData {
    sessionId: string;
    sessionName: string;
    startedAt: string;
    summary: {
        totalCommits: number;
        changedFiles: string[];
        tagBreakdown: Record<string, number>;
    };
    entries: SessionSummaryEntry[];
}
export interface SaveReportResult {
    reportId: string;
    sessionId: string;
    createdAt: string;
}
export interface DailyDigestData {
    date: string;
    summary: {
        totalCommits: number;
        totalSessions: number;
        totalChangedFiles: number;
        tagBreakdown: Record<string, number>;
    };
    sessions: {
        sessionId: string;
        sessionName: string;
        commits: number;
        changedFiles: string[];
        keyDecisions: string[];
    }[];
    mostChangedFiles: {
        file: string;
        changeCount: number;
        tags: string[];
    }[];
}
export interface SaveDailyDigestReportResult {
    reportId: string;
    date: string;
    createdAt: string;
}
export interface SessionCompareData {
    session1: {
        sessionId: string;
        sessionName: string;
        date: string;
        commits: number;
        tags: Record<string, number>;
        changedFiles: string[];
        keyDecisions: string[];
    };
    session2: {
        sessionId: string;
        sessionName: string;
        date: string;
        commits: number;
        tags: Record<string, number>;
        changedFiles: string[];
        keyDecisions: string[];
    };
    comparison: {
        overlappingFiles: string[];
        newFilesInSession2: string[];
        continuedWork: boolean;
        tagShift: string;
    };
}
export interface SaveSessionCompareReportResult {
    reportId: string;
    sessionId1: string;
    sessionId2: string;
    createdAt: string;
}
export interface WeeklyDigestData {
    week: string;
    startDate: string;
    endDate: string;
    teamStats: {
        totalCommits: number;
        totalSessions: number;
        totalChangedFiles: number;
        tagBreakdown: Record<string, number>;
        activeMemberCount: number;
    };
    memberDigests: {
        userId: string;
        userName: string;
        sessions: {
            sessionId: string;
            sessionName: string;
            date: string;
            commitCount: number;
            changedFiles: string[];
            keyDecisions: {
                title: string;
                intent: string;
                alternatives: string;
                tag: string;
                commitHash: string;
            }[];
        }[];
        stats: {
            commits: number;
            sessions: number;
            tags: Record<string, number>;
        };
        topChangedFiles: string[];
    }[];
    keyDecisions: {
        userId: string;
        userName: string;
        title: string;
        intent: string;
        alternatives: string;
        tag: string;
        commitHash: string;
        date: string;
        sessionName: string;
    }[];
    mostChangedFiles: {
        file: string;
        changeCount: number;
        tags: string[];
    }[];
}
export interface SaveWeeklyDigestReportResult {
    reportId: string;
    week: string;
    createdAt: string;
}
export interface SavePmDigestReportResult {
    reportId: string;
    week: string;
    createdAt: string;
}
export interface SessionPromptsData {
    workSessionId: string;
    content: string;
}
export interface SavePromptEvaluationReportResult {
    reportId: string;
    workSessionId: string;
    projectName: string;
    createdAt: string;
}
export declare class ApiClient {
    private readonly apiKey;
    private readonly endpoint;
    constructor(config: Config);
    getSessionSummary(sessionId: string): Promise<SessionSummaryData>;
    saveSessionReport(sessionId: string, title: string, content: string): Promise<SaveReportResult>;
    getDailyDigest(date: string): Promise<DailyDigestData>;
    saveDailyDigestReport(date: string, title: string, content: string): Promise<SaveDailyDigestReportResult>;
    compareSessions(sessionId1: string, sessionId2?: string): Promise<SessionCompareData>;
    saveSessionCompareReport(sessionId1: string, sessionId2: string, title: string, content: string): Promise<SaveSessionCompareReportResult>;
    getWeeklyDigest(week: string): Promise<WeeklyDigestData>;
    saveWeeklyDigestReport(week: string, title: string, content: string): Promise<SaveWeeklyDigestReportResult>;
    savePmDigestReport(week: string, title: string, content: string): Promise<SavePmDigestReportResult>;
    getSessionPrompts(claudeSessionId: string): Promise<SessionPromptsData>;
    savePromptEvaluationReport(claudeSessionId: string, title: string, content: string): Promise<SavePromptEvaluationReportResult>;
}
