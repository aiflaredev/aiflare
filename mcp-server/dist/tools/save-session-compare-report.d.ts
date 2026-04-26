import type { ApiClient } from "../api-client.js";
export declare function handleSaveSessionCompareReport(apiClient: ApiClient, args: {
    sessionId1: string;
    sessionId2: string;
    title: string;
    content: string;
}): Promise<string>;
