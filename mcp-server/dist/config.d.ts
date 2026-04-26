export interface Config {
    apiKey: string;
    endpoint: string;
}
export declare function loadConfig(): Config | null;
