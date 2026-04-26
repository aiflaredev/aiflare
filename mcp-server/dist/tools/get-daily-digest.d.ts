import type { ApiClient } from "../api-client.js";
export declare function handleGetDailyDigest(apiClient: ApiClient, args: {
    date: string;
}): Promise<string>;
