import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
export function loadConfig() {
    let gitRoot;
    try {
        gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
    }
    catch {
        return null;
    }
    const configPath = join(gitRoot, "aiflare.yml");
    if (!existsSync(configPath)) {
        return null;
    }
    const content = readFileSync(configPath, "utf-8");
    let apiKey = "";
    let endpoint = "";
    for (const line of content.split("\n")) {
        const apiKeyMatch = line.match(/^\s*api_key\s*:\s*(.+)$/);
        if (apiKeyMatch) {
            apiKey = apiKeyMatch[1].trim().replace(/^["']|["']$/g, "");
        }
        const endpointMatch = line.match(/^\s*endpoint\s*:\s*(.+)$/);
        if (endpointMatch) {
            endpoint = endpointMatch[1].trim().replace(/^["']|["']$/g, "");
        }
    }
    if (!apiKey) {
        return null;
    }
    return { apiKey, endpoint: endpoint || "https://api.aiflare.dev" };
}
