import type { ApiClient } from "../api-client.js";
export declare function handleSaveDailyDigestReport(apiClient: ApiClient, args: {
    date: string;
    title: string;
    content: string;
}): Promise<string>;
