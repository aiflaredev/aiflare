import type { ApiClient } from "../api-client.js";
export declare function handleSavePmDigestReport(apiClient: ApiClient, args: {
    week: string;
    title: string;
    content: string;
}): Promise<string>;
