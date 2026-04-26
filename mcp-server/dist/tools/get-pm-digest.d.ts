import type { ApiClient } from "../api-client.js";
export declare function handleGetPmDigest(apiClient: ApiClient, args: {
    week: string;
}): Promise<string>;
