import type { ApiClient } from "../api-client.js";
export declare function handleGetSessionCompare(apiClient: ApiClient, args: {
    sessionId1: string;
    sessionId2?: string;
}): Promise<string>;
