import type { ApiClient } from "../api-client.js";
export declare function handleGetRecentCaptures(apiClient: ApiClient, args: {
    days?: number;
    limit?: number;
}): Promise<string>;
