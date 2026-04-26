import type { ApiClient } from "../api-client.js";
export declare function handleGetSessionPrompts(apiClient: ApiClient, args: {
    sessionId: string;
}): Promise<string>;
