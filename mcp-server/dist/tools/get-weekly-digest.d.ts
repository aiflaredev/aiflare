import type { ApiClient } from "../api-client.js";
export declare function handleGetWeeklyDigest(apiClient: ApiClient, args: {
    week: string;
}): Promise<string>;
