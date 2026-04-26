import type { ApiClient } from "../api-client.js";
export declare function handleGetFileHistory(apiClient: ApiClient, args: {
    filePath: string;
    limit?: number;
}): Promise<string>;
