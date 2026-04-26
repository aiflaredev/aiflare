#!/usr/bin/env node
// Merges AIFlare's MCP server entry into an existing .mcp.json.
// Other mcpServers entries are preserved untouched. The aiflare entry is
// always overwritten so path/version upgrades propagate automatically.
//
// Usage: node merge-mcp.js <dst-mcp-json> <src-mcp-json>

const fs = require('fs');

const [, , dstPath, srcPath] = process.argv;
if (!dstPath || !srcPath) {
  console.error('Usage: node merge-mcp.js <dst> <src>');
  process.exit(1);
}

let dst, src;
try {
  dst = JSON.parse(fs.readFileSync(dstPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${dstPath}: ${err.message}`);
  process.exit(1);
}
try {
  src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${srcPath}: ${err.message}`);
  process.exit(1);
}

dst.mcpServers = dst.mcpServers || {};
const mergedNames = [];

for (const [name, config] of Object.entries(src.mcpServers || {})) {
  dst.mcpServers[name] = config;
  mergedNames.push(name);
}

fs.writeFileSync(dstPath, JSON.stringify(dst, null, 2) + '\n');
console.log(`Merged MCP servers: ${mergedNames.join(', ')}`);
