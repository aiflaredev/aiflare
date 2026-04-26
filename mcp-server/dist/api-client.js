export class ApiClient {
    apiKey;
    endpoint;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.endpoint = config.endpoint;
    }
    async getSessionSummary(sessionId) {
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
            const body = await res.json();
            if (!body.success) {
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            }
            if (!body.response) {
                throw new Error("해당 세션을 찾을 수 없습니다");
            }
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async saveSessionReport(sessionId, title, content) {
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
            const body = await res.json();
            if (!body.success) {
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            }
            if (!body.response) {
                throw new Error("보고서 저장에 실패했습니다");
            }
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async getDailyDigest(date) {
        const params = new URLSearchParams({ date });
        const url = `${this.endpoint}/api/v1/insights/daily-digest?${params}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("해당 날짜의 데이터를 찾을 수 없습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async saveDailyDigestReport(date, title, content) {
        const url = `${this.endpoint}/api/v1/insights/daily-digest-reports`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ date, title, content }),
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("보고서 저장에 실패했습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async compareSessions(sessionId1, sessionId2) {
        const params = new URLSearchParams();
        params.set("sessionId1", sessionId1);
        if (sessionId2)
            params.set("sessionId2", sessionId2);
        const url = `${this.endpoint}/api/v1/insights/session-compare?${params}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("세션 비교 데이터를 가져올 수 없습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async saveSessionCompareReport(sessionId1, sessionId2, title, content) {
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
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("보고서 저장에 실패했습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async getWeeklyDigest(week) {
        const params = new URLSearchParams({ week });
        const url = `${this.endpoint}/api/v1/insights/weekly-team-digest?${params}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("해당 주의 데이터를 찾을 수 없습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async saveWeeklyDigestReport(week, title, content) {
        const url = `${this.endpoint}/api/v1/insights/weekly-team-digest-reports`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ week, title, content }),
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("보고서 저장에 실패했습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async savePmDigestReport(week, title, content) {
        const url = `${this.endpoint}/api/v1/insights/pm-digest-reports`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ week, title, content }),
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("보고서 저장에 실패했습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async getSessionPrompts(claudeSessionId) {
        const url = `${this.endpoint}/api/v1/sessions/${encodeURIComponent(claudeSessionId)}/prompts`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(url, {
                headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
                signal: controller.signal,
            });
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("해당 세션의 프롬프트를 찾을 수 없습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async savePromptEvaluationReport(claudeSessionId, title, content) {
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
            const body = await res.json();
            if (!body.success)
                throw new Error(body.error?.message ?? `HTTP ${res.status}`);
            if (!body.response)
                throw new Error("보고서 저장에 실패했습니다");
            return body.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
