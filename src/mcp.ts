/**
 * MCP manager module: servers are `@deepseek-ai/dsh-mcp-client` rows inside
 * the managed block of each configured profile's `cordis.patch.yml`.
 * ponytail: text surgery on a marker-delimited block instead of
 * parse-modify-dump so user comments in the patch survive. Upgrade path: a
 * dedicated included composition file.
 */
import { writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { MCP_BEGIN, MCP_END, assertName, patchPath, readPatch, splitBlock, splitInner, type Env, type Handler, type McpRow } from "./shared.js";

export const MCP_ACTIONS = ["list_mcps", "mcp_status", "add_mcp", "remove_mcp", "enable_mcp", "disable_mcp"] as const;

function parseRows(text: string): McpRow[] {
  const inner = splitInner(text, MCP_BEGIN, MCP_END);
  if (!inner.trim()) return [];
  // The whole patch file is a patch-entry list; new rows ride an `insert:` entry.
  const parsed = yaml.load(inner);
  if (!Array.isArray(parsed)) return [];
  if (parsed.length === 1 && parsed[0] && typeof parsed[0] === "object" && Array.isArray((parsed[0] as any).insert)) {
    return parsed[0].insert as McpRow[];
  }
  return parsed as McpRow[];
}

async function writeRows(profile: string, rows: McpRow[]): Promise<void> {
  const text = await readPatch(profile);
  const block = rows.length
    ? `${MCP_BEGIN}\n${yaml.dump([{ insert: rows }], { lineWidth: 0, noRefs: true })}${MCP_END}`
    : "";
  const { head, tail } = splitBlock(text, MCP_BEGIN, MCP_END);
  let next = head + tail;
  if (block) next = next.trimEnd() + "\n" + block + "\n";
  else next = next.replace(/\n+$/, "\n");
  await writeFile(patchPath(profile), next, "utf8");
}

function findRow(rows: McpRow[], mcpName: string): McpRow | undefined {
  return rows.find((r) => r.config?.serverName === mcpName);
}

function toInfo(profile: string, row: McpRow) {
  const c = row.config || {};
  const info: any = {
    profile,
    serverName: c.serverName,
    transport: c.transport ?? "stdio",
    disabled: row.disabled === true,
  };
  if (c.command !== undefined) info.command = c.command;
  if (c.args !== undefined) info.args = c.args;
  if (c.url !== undefined) info.url = c.url;
  return info;
}

export const handleMcp: Handler = async function (action, args, env: Env) {
  const { ctx, profiles } = env;
  const { mcpName, mcpConfig } = args;
  switch (action) {
    case "list_mcps": {
      const mcps = [];
      for (const profile of profiles) {
        for (const row of parseRows(await readPatch(profile))) {
          if (row.name === "@deepseek-ai/dsh-mcp-client") mcps.push(toInfo(profile, row));
        }
      }
      return { mcps };
    }
    case "mcp_status": {
      // Live state, best effort from inside THIS process:
      // - tools registered under mcp__<server>__ => running
      // - loader fiber present, no tools yet => connecting (or backoff)
      // - row disabled => off; anything else — including other profiles'
      //   rows, which live in other processes — => not loaded.
      const toolNames = new Set<string>();
      try {
        for (const n of ctx.tools.view().visible.keys()) toolNames.add(String(n));
      } catch {}
      const fibers = new Set<string>();
      try {
        for (const entry of env.loaderRef?.entries?.() ?? []) {
          if (entry && entry.fiber !== undefined) fibers.add(String(entry.id ?? entry.name));
        }
      } catch {}
      const servers = [];
      for (const profile of profiles) {
        for (const row of parseRows(await readPatch(profile))) {
          if (row.name !== "@deepseek-ai/dsh-mcp-client") continue;
          const c = row.config || {};
          const serverName = String(c.serverName ?? "");
          let state = "not loaded";
          if (row.disabled === true) state = "disabled";
          else {
            const prefix = `mcp__${serverName}__`;
            for (const n of toolNames) {
              if (n.startsWith(prefix)) {
                state = "running";
                break;
              }
            }
            if (state === "not loaded" && fibers.has(String(row.id ?? `mcp-${serverName}`))) state = "connecting";
          }
          servers.push({ profile, serverName, transport: c.transport ?? "stdio", disabled: row.disabled === true, state });
        }
      }
      return { servers };
    }
    case "add_mcp": {
      const name = assertName(mcpName, /^[A-Za-z0-9_-]{1,32}$/, "MCP serverName");
      const cfg = { ...(mcpConfig || {}) };
      const row: McpRow = {
        id: `mcp-${name}`,
        name: "@deepseek-ai/dsh-mcp-client",
        config: { transport: "stdio", ...cfg, serverName: name },
      };
      if (!row.config.command && !row.config.url) {
        return { error: "mcpConfig must include command (stdio) or url (streamable-http)" };
      }
      // Per-add profile override; reject unknown names so typos surface.
      const targets = env.targets();
      for (const profile of targets) {
        const rows = parseRows(await readPatch(profile));
        if (findRow(rows, name)) return { error: `MCP server "${name}" already exists` };
        rows.push(row);
        await writeRows(profile, rows);
      }
      return { success: true, message: `Added MCP "${name}" to profiles: ${targets.join(", ")}. Restart each profile to connect.` };
    }
    case "remove_mcp":
    case "enable_mcp":
    case "disable_mcp": {
      const name = assertName(mcpName, /^[A-Za-z0-9_-]{1,32}$/, "MCP serverName");
      const targets = env.targets();
      let touched = 0;
      for (const profile of targets) {
        const rows = parseRows(await readPatch(profile));
        const row = findRow(rows, name);
        if (!row) continue;
        if (action === "remove_mcp") rows.splice(rows.indexOf(row), 1);
        else if (action === "disable_mcp") row.disabled = true;
        else delete row.disabled;
        await writeRows(profile, rows);
        touched++;
      }
      if (!touched) return { error: `MCP server "${name}" not found in profiles: ${targets.join(", ")}` };
      const verb = action === "remove_mcp" ? "Removed" : action === "disable_mcp" ? "Disabled" : "Enabled";
      return { success: true, message: `${verb} MCP "${name}" in ${touched} profile(s). Restart to apply.` };
    }
    default:
      return null;
  }
};
