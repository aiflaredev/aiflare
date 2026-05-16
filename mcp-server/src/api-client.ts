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

export interface SessionReportLatestData {
  reportId: string;
  sessionId: string;
  sessionName: string;
  title: string;
  content: string;
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
  audience: "DEV" | "PM";
  createdAt: string;
}

export interface SessionCompareData {
  session1: { sessionId: string; sessionName: string; date: string; commits: number; tags: Record<string, number>; changedFiles: string[]; keyDecisions: string[]; };
  session2: { sessionId: string; sessionName: string; date: string; commits: number; tags: Record<string, number>; changedFiles: string[]; keyDecisions: string[]; };
  comparison: { overlappingFiles: string[]; newFilesInSession2: string[]; continuedWork: boolean; tagShift: string; };
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
    stats: { commits: number; sessions: number; tags: Record<string, number> };
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
  audience: "DEV" | "PM";
  createdAt: string;
}

export interface SessionPromptsData {
  workSessionId: string;
  content: string;
}

export interface CommitCaptureData {
  entryId: string;
  projectId: string;
  title: string;
  intent: string;
  alternatives: string | null;
  diffSummary: string | null;
  changedFiles: string[];
  tag: string;
  branch: string | null;
  agentType: string;
  commitHash: string;
  conversation: string[];
}

export interface SavePromptEvaluationReportResult {
  reportId: string;
  workSessionId: string;
  projectName: string;
  createdAt: string;
}

export class ApiClient {
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(config: Config) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
  }

  async getSessionSummary(sessionId: string): Promise<SessionSummaryData> {
    const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(sessionId)}/summary`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        headers: {
          "X-API-Key": this.apiKey,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });

      const body = await res.json() as { success: boolean; response: SessionSummaryData | null; error: { message: string } | null };

      if (!body.success) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }

      if (!body.response) {
        throw new Error("Session not found");
      }

      return body.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async saveSessionReport(sessionId: string, title: string, content: string): Promise<SaveReportResult> {
    const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(sessionId)}/report`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ title, content }),
        signal: controller.signal,
      });

      const body = await res.json() as { success: boolean; response: SaveReportResult | null; error: { message: string } | null };

      if (!body.success) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }

      if (!body.response) {
        throw new Error("Failed to save report");
      }

      return body.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getLatestSessionReport(sessionId: string): Promise<SessionReportLatestData> {
    const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(sessionId)}/report/latest`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        headers: {
          "X-API-Key": this.apiKey,
          "Accept": "application/json",
          "Accept-Language": "en",
        },
        signal: controller.signal,
      });

      const body = await res.json() as { success: boolean; response: SessionReportLatestData | null; error: { message: string } | null };

      if (!body.success) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }

      if (!body.response) {
        throw new Error("No saved report found for this session");
      }

      return body.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getDailyDigest(date: string): Promise<DailyDigestData> {
    const params = new URLSearchParams({ date });
    const url = `${this.endpoint}/api/v1/insights/daily-digest?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: DailyDigestData | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("No data found for the specified date");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async saveDailyDigestReport(date: string, title: string, content: string, audience: "DEV" | "PM" = "DEV"): Promise<SaveDailyDigestReportResult> {
    const url = `${this.endpoint}/api/v1/insights/daily-digest-reports`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ date, title, content, audience }),
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SaveDailyDigestReportResult | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Failed to save report");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async compareSessions(sessionId1: string, sessionId2?: string): Promise<SessionCompareData> {
    const params = new URLSearchParams();
    params.set("sessionId1", sessionId1);
    if (sessionId2) params.set("sessionId2", sessionId2);
    const url = `${this.endpoint}/api/v1/insights/session-compare?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SessionCompareData | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Failed to retrieve session comparison data");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async saveSessionCompareReport(sessionId1: string, sessionId2: string, title: string, content: string): Promise<SaveSessionCompareReportResult> {
    const url = `${this.endpoint}/api/v1/insights/session-compare-reports`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ sessionId1, sessionId2, title, content }),
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SaveSessionCompareReportResult | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Failed to save report");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async getWeeklyDigest(week: string): Promise<WeeklyDigestData> {
    const params = new URLSearchParams({ week });
    const url = `${this.endpoint}/api/v1/insights/weekly-team-digest?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: WeeklyDigestData | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("No data found for the specified week");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async saveWeeklyDigestReport(
    week: string,
    title: string,
    content: string,
    audience: "DEV" | "PM" = "DEV"
  ): Promise<SaveWeeklyDigestReportResult> {
    const url = `${this.endpoint}/api/v1/insights/weekly-team-digest-reports`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ week, title, content, audience }),
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SaveWeeklyDigestReportResult | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Failed to save report");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async getSessionPrompts(claudeSessionId: string): Promise<SessionPromptsData> {
    const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(claudeSessionId)}/prompts`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SessionPromptsData | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("No prompts found for the specified session");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async savePromptEvaluationReport(claudeSessionId: string, title: string, content: string): Promise<SavePromptEvaluationReportResult> {
    const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(claudeSessionId)}/prompt-evaluation-reports`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ title, content }),
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: SavePromptEvaluationReportResult | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Failed to save report");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async getCaptureByCommit(commitHash: string): Promise<CommitCaptureData> {
    const url = `${this.endpoint}/api/v1/captures/by-commit/${encodeURIComponent(commitHash)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: CommitCaptureData | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      if (!body.response) throw new Error("Timeline entry not found");
      return body.response;
    } finally { clearTimeout(timeout); }
  }

  async getCapturesByCommits(commitHashes: string[]): Promise<CommitCaptureData[]> {
    const url = `${this.endpoint}/api/v1/captures/by-commits?hashes=${commitHashes.map(encodeURIComponent).join(",")}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: controller.signal,
      });
      const body = await res.json() as { success: boolean; response: { captures: CommitCaptureData[] } | null; error: { message: string } | null };
      if (!body.success) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      return body.response?.captures ?? [];
    } finally { clearTimeout(timeout); }
  }
}
