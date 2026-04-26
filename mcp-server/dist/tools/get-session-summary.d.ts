import type { ApiClient } from "../api-client.js";
export declare function handleGetSessionSummary(apiClient: ApiClient, args: {
    sessionId: string;
}): Promise<string>;
