import type { ApiClient } from "../api-client.js";
export declare function handleSaveSessionReport(apiClient: ApiClient, args: {
    sessionId: string;
    title: string;
    content: string;
}): Promise<string>;
