// Self-check: exercises manage_skills_mcps against a fake ctx and a temp DSH_HOME.
// Run: node test/selfcheck.mjs   (after `tsc`)
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const home = mkdtempSync(join(tmpdir(), "dsh-enhanced-test-"));
process.env.DSH_HOME = home;
mkdirSync(join(home, "profiles", "testprof"), { recursive: true });
// Real profiles carry a package.json manifest; search wiring edits it.
writeFileSync(
  join(home, "profiles", "testprof", "package.json"),
  JSON.stringify({ name: "dsh-profile-testprof", private: true, dsh: { profile: { bundles: [] } }, dependencies: {} }),
);

const mod = await import("../dist/index.js");
const vendor = await import("../dist/free-search-vendor.js");

const tools = {};
let tool;
let rpc; // { channel, handler } captured from the browser-facing RPC channel
let settingsNs; // namespace registered for the Plugin Configuration card
let searchProvider; // captured from the vendored Free Search engine
const ctx = {
  tools: { register: (def) => ((tools[def.name] = def), () => {}) },
  web: {
    registerSearchProvider: (p) => ((searchProvider = p), () => {}),
    searchProviderId: null,
  },
  webServer: { register: () => () => {} },
  settings: {},
  systemPrompt: { section: () => () => {} },
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  skills: {
    snapshot: async () => ({ skills: [{ name: "demo-skill", description: "Demo", source: "user-dsh", provider: "local" }] }),
    // Disk-backed like the real filesystem provider: content is body-only.
    get: async (name) => {
      const p = join(home, "skills", name, "SKILL.md");
      const raw = existsSync(p) ? readFileSync(p, "utf8") : "";
      return {
        name,
        description: mod.parseSkillDoc(raw).description ?? "",
        content: raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim(),
      };
    },
  },
  connection: { rpc: { handle: (channel, handler) => ((rpc = { channel, handler }), () => {}) } },
  settings: { register: (ns) => ((settingsNs = ns), () => {}) },
  get: (key) => (key === "connection" ? ctx.connection : undefined),
  effect: (factory) => factory(),
  injectCbs: [],
  inject(deps, fn) {
    this.injectCbs.push(fn);
    fn(this);
  },
};
mod.apply(ctx, { mcpProfiles: ["testprof"] });
tool = tools["manage_skills_mcps"];

// Vendored Free Search engine registers through the harness web service.
assert.ok(searchProvider, "vendored search provider registered");
assert.equal(searchProvider.id, "enhanced-free", "provider id is namespaced");
assert.equal(typeof searchProvider.search, "function", "provider exposes search()");
// Bridge routes must be fully formed: one undefined path here once made the
// second duplicate-undefined registration throw and kill ALL route registrations
// silently (child-fiber error never reached stdout). Regression gate for that.
for (const route of vendor.makeBridgeRoutes({}, async () => ({}), async () => ({}))) {
  assert.equal(typeof route.path, "string", `bridge route has a path (${route.kind})`);
  assert.ok(route.path.startsWith("/api/dsh-enhanced-free-search/"), `bridge route namespaced: ${route.path}`);
  assert.equal(typeof route.handler, "function", `bridge route has handler: ${route.path}`);
}
assert.ok(tool, "tool registered");
assert.equal(settingsNs, "dsh-enhanced", "card namespace registered");
const run = (args) => tool.execute(args);

// skills
const added = await run({ action: "add_skill", skillName: "demo-skill", description: "Demo skill", skillBody: "# hi" });
assert.ok(added.success, `add_skill: ${JSON.stringify(added)}`);
const skillFile = join(home, "skills", "demo-skill", "SKILL.md");
assert.ok(existsSync(skillFile), "SKILL.md written");
const fm = readFileSync(skillFile, "utf8");
assert.ok(fm.startsWith("---\nname: demo-skill\ndescription: Demo skill\n---"), "frontmatter correct");
const dup = await run({ action: "add_skill", skillName: "demo-skill", description: "x" });
assert.ok(dup.error, "duplicate add_skill rejected");
const bad = await run({ action: "add_skill", skillName: "../escape", description: "x" });
assert.ok(bad.error, "path traversal rejected");
const listed = await run({ action: "list_skills" });
assert.equal(listed.skills[0].name, "demo-skill");
const removed = await run({ action: "remove_skill", skillName: "demo-skill" });
assert.ok(removed.success && !existsSync(skillFile), "remove_skill deletes bundle");

// mcps
const addMcp = await run({ action: "add_mcp", mcpName: "demo", mcpConfig: { command: "npx", args: ["-y", "@modelcontextprotocol/server-x"] } });
assert.ok(addMcp.success, `add_mcp: ${JSON.stringify(addMcp)}`);
let mcps = await run({ action: "list_mcps" });
assert.equal(mcps.mcps[0].serverName, "demo");
assert.equal(mcps.mcps[0].disabled, false);
let status = await run({ action: "mcp_status" });
assert.equal(status.servers[0].state, "not loaded", "no tools, no fiber => not loaded");
ctx.tools.view = () => ({ visible: new Map([["mcp__demo__ping", {}]]) });
status = await run({ action: "mcp_status" });
assert.equal(status.servers[0].state, "running", "registered namespace tools => running");
delete ctx.tools.view;
await run({ action: "disable_mcp", mcpName: "demo" });
mcps = await run({ action: "list_mcps" });
assert.equal(mcps.mcps[0].disabled, true, "disable_mcp persists");
status = await run({ action: "mcp_status" });
assert.equal(status.servers[0].state, "disabled", "disabled flag drives live state");
const patchText = readFileSync(join(home, "profiles", "testprof", "cordis.patch.yml"), "utf8");
assert.ok(patchText.includes("insert:"), "managed rows use insert form");
assert.ok(patchText.includes("serverName: demo"), "row config present");
const dupMcp = await run({ action: "add_mcp", mcpName: "demo", mcpConfig: { command: "x" } });
assert.ok(dupMcp.error, "duplicate add_mcp rejected");
// per-add profile override
const badProf = await run({ action: "add_mcp", mcpName: "nope", mcpConfig: { command: "x" }, profiles: ["bogus"] });
assert.ok(badProf.error, "unknown profile rejected");
// name grammar at the trust boundary (mirrors the card's pre-staging check)
const badName = await run({ action: "add_mcp", mcpName: "bad name!", mcpConfig: { command: "x" } });
assert.ok(badName.error, "mcp name with spaces rejected");
const scopedAdd = await run({ action: "add_mcp", mcpName: "scoped", mcpConfig: { command: "x" }, profiles: ["testprof"] });
assert.ok(scopedAdd.success, `scoped add_mcp: ${JSON.stringify(scopedAdd)}`);
mcps = await run({ action: "list_mcps" });
assert.equal(mcps.mcps.length, 2, "scoped add landed alongside demo");
await run({ action: "remove_mcp", mcpName: "scoped" });
// per-op profile targeting on enable/disable/remove
const badOp = await run({ action: "disable_mcp", mcpName: "demo", profiles: ["bogus"] });
assert.ok(badOp.error, "op with unknown profile rejected");
const opScoped = await run({ action: "enable_mcp", mcpName: "demo", profiles: ["testprof"] });
assert.ok(opScoped.success, `scoped enable_mcp: ${JSON.stringify(opScoped)}`);
mcps = await run({ action: "list_mcps" });
assert.equal(mcps.mcps[0].disabled, false, "scoped enable applied");
await run({ action: "remove_mcp", mcpName: "demo" });
mcps = await run({ action: "list_mcps" });
assert.deepEqual(mcps.mcps, [], "remove_mcp clears row");

// browser RPC channel serves the SAME action core
assert.ok(rpc, "rpc channel registered");
assert.equal(rpc.channel, "/dsh-enhanced", "rpc channel name");
const viaRpc = await rpc.handler("manage", { action: "add_skill", skillName: "rpc-skill", description: "Via rpc", skillBody: "x" });
assert.ok(viaRpc.ok && viaRpc.value.success, `rpc add_skill: ${JSON.stringify(viaRpc)}`);
assert.ok(existsSync(join(home, "skills", "rpc-skill", "SKILL.md")), "rpc add wrote SKILL.md");
const viaRpcTool = await run({ action: "list_skills" });
assert.ok(viaRpcTool.skills.some((s) => s.name === "rpc-skill"), "tool sees rpc-written skill");
await run({ action: "remove_skill", skillName: "rpc-skill" });

// YAML block scalars ("description: >") must parse as prose, not the bare ">"
const folded = "---\nname: t\ndescription: >\n  line one\n  line two\n---\nbody";
assert.equal(String(mod.parseSkillDoc(folded).description).trimEnd(), "line one line two", "folded scalar parsed");
assert.deepEqual(mod.parseSkillDoc("no frontmatter"), {}, "missing frontmatter tolerated");

// A snapshot row carrying an unfinished indicator gets normalized from disk.
// The fake ctx above already returned once; repoint it at the broken shape.
ctx.skills.snapshot = async () => ({ skills: [{ name: "rpc-skill", description: ">", source: "user-dsh", provider: "local" }] });
await run({ action: "add_skill", skillName: "rpc-skill", description: "Real prose here", skillBody: "x" });
const normalized = await run({ action: "list_skills" });
const row = normalized.skills.find((s) => s.name === "rpc-skill");
assert.ok(row && row.description === "Real prose here", `">" normalized: ${row && row.description}`);
await run({ action: "remove_skill", skillName: "rpc-skill" });

// edit_skill rewrites description and body through the same file path
ctx.skills.snapshot = async () => ({ skills: [] });
await run({ action: "add_skill", skillName: "rpc-skill", description: "First desc", skillBody: "# v1" });
const edited = await run({ action: "edit_skill", skillName: "rpc-skill", description: "Edited desc", skillBody: "# v2 body" });
assert.ok(edited.success, `edit_skill: ${JSON.stringify(edited)}`);
const reread = await run({ action: "read_skill", skillName: "rpc-skill" });
assert.equal(reread.description, "Edited desc", "edit updated description");
assert.ok(String(reread.content).includes("v2 body"), "edit rewrote body");
assert.ok(!String(reread.content).includes("---"), "no nested frontmatter");
await run({ action: "remove_skill", skillName: "rpc-skill" });

// read_skill must answer from disk even when the registry does not know the
// skill (hot-reload lag, preset/plugin providers) — the GUI's Edit path.
ctx.skills.get = async () => undefined;
await run({ action: "add_skill", skillName: "rpc-skill", description: "Disk desc", skillBody: "# disk body" });
const diskRead = await run({ action: "read_skill", skillName: "rpc-skill" });
assert.ok(!diskRead.error, `disk-first read found it: ${JSON.stringify(diskRead)}`);
assert.equal(diskRead.description, "Disk desc", "disk-first read parsed frontmatter");
assert.ok(String(diskRead.content).includes("disk body"), "disk-first read stripped frontmatter");
await run({ action: "remove_skill", skillName: "rpc-skill" });

// names the real loader would silently ignore must be rejected here
for (const bad of ["double--dash", "trailing-", "-lead"]) {
  const r = await run({ action: "add_skill", skillName: bad, description: "x" });
  assert.ok(r.error, `invalid name rejected: ${bad}`);
}

// install_skill copies a folder bundle (SKILL.md + extras) into the catalog
const bundleSrc = join(home, "incoming", "my-tool");
mkdirSync(bundleSrc, { recursive: true });
writeFileSync(join(bundleSrc, "SKILL.md"), "---\nname: my-tool\ndescription: Installed from a folder\n---\n# tool\n", "utf8");
writeFileSync(join(bundleSrc, "run.sh"), "#!/bin/sh\n", "utf8");
const installed = await run({ action: "install_skill", sourcePath: bundleSrc });
assert.ok(installed.success, `install_skill: ${JSON.stringify(installed)}`);
assert.ok(existsSync(join(home, "skills", "my-tool", "SKILL.md")), "SKILL.md copied");
assert.ok(existsSync(join(home, "skills", "my-tool", "run.sh")), "extra bundle files copied");
const dupInst = await run({ action: "install_skill", sourcePath: bundleSrc });
assert.ok(dupInst.error && /overwrite/.test(dupInst.error), "duplicate install rejected without overwrite");
const ovw = await run({ action: "install_skill", sourcePath: bundleSrc, overwrite: true });
assert.ok(ovw.success, `overwrite install: ${JSON.stringify(ovw)}`);
const emptyDir = join(home, "empty-dir");
mkdirSync(emptyDir, { recursive: true });
const noManifest = await run({ action: "install_skill", sourcePath: emptyDir });
assert.ok(noManifest.error && /SKILL\.md/.test(noManifest.error), "folder without SKILL.md rejected");
await run({ action: "remove_skill", skillName: "my-tool" });

// install_skill on a FOLDER OF SKILLS: every nested bundle installs with the
// same per-skill gauntlet; broken ones fail without blocking the rest;
// dot-dirs are never scanned; reruns skip what already exists.
const pack = join(home, "incoming", "pack");
for (const [dir, front] of [
  ["alpha", "---\nname: alpha\ndescription: Pack skill one\n---\n# a\n"],
  ["nested/beta", "---\nname: beta\ndescription: Pack skill two\n---\n# b\n"],
  ["broken", "---\nname: broken\ndescription:\n---\n# x\n"],
  [".hidden/gamma", "---\nname: gamma\ndescription: Must be ignored\n---\n# g\n"],
]) {
  mkdirSync(join(pack, dir), { recursive: true });
  writeFileSync(join(pack, dir, "SKILL.md"), front, "utf8");
}
const bulk = await run({ action: "install_skill", sourcePath: pack });
assert.ok(bulk.success, `bulk install: ${JSON.stringify(bulk)}`);
assert.deepEqual(bulk.installed.sort(), ["alpha", "beta"], "both valid bundles installed");
assert.equal(bulk.failed.length, 1, "bundle without description reported failed");
assert.ok(!existsSync(join(home, "skills", "gamma")), "dot-dir bundle ignored");
const bulkRerun = await run({ action: "install_skill", sourcePath: pack });
assert.deepEqual(bulkRerun.skipped.sort(), ["alpha", "beta"], "rerun skips existing skills");
await run({ action: "remove_skill", skillName: "alpha" });
await run({ action: "remove_skill", skillName: "beta" });

// install_skill_files: same pipeline for bundles uploaded through the browser
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const upFiles = [
  { path: "uploaded-skill/SKILL.md", data: b64("---\nname: uploaded-skill\ndescription: Installed via the folder picker\n---\n# up\n") },
  { path: "uploaded-skill/scripts/hello.sh", data: b64("#!/bin/sh\n") },
];
const up = await run({ action: "install_skill_files", files: upFiles });
assert.ok(up.success, `install_skill_files: ${JSON.stringify(up)}`);
assert.ok(existsSync(join(home, "skills", "uploaded-skill", "scripts", "hello.sh")), "nested uploaded file written");
assert.ok(!existsSync(join(home, "skills", "uploaded-skill", "uploaded-skill")), "top folder name stripped");
const upDup = await run({ action: "install_skill_files", files: upFiles });
assert.ok(upDup.error && /overwrite/.test(upDup.error), "duplicate upload rejected");
const escape = await run({ action: "install_skill_files", overwrite: true, files: upFiles.concat([{ path: "uploaded-skill/../../evil.txt", data: b64("nope") }]) });
assert.ok(escape.error && /Unsafe/.test(escape.error), "path escape rejected");
assert.ok(!existsSync(join(home, "evil.txt")) && existsSync(join(home, "skills", "uploaded-skill", "SKILL.md")), "rejected upload wrote nothing");
const noManUp = await run({ action: "install_skill_files", files: [{ path: "y/readme.txt", data: b64("x") }] });
assert.ok(noManUp.error && /SKILL\.md/.test(noManUp.error), "upload without SKILL.md rejected");
// Browsers drop exec bits; shebang files must come back executable, others not.
const upScript = await run({
  action: "install_skill_files",
  overwrite: true,
  files: upFiles.concat([{ path: "uploaded-skill/scripts/tool.py", data: b64("#!/usr/bin/env python3\nprint('hi')\n") }]),
});
assert.ok(upScript.success, `scripted upload: ${JSON.stringify(upScript)}`);
const { statSync } = await import("node:fs");
assert.ok(statSync(join(home, "skills", "uploaded-skill", "scripts", "tool.py")).mode & 0o111, "shebang file installed executable");
assert.ok(!(statSync(join(home, "skills", "uploaded-skill", "SKILL.md")).mode & 0o111), "non-shebang file stays non-executable");
await run({ action: "remove_skill", skillName: "uploaded-skill" });
// Upload of a FOLDER OF SKILLS through the picker: same bulk semantics as
// the disk path — every nested bundle installs, junk outside bundles ignored.
const upPack = await run({
  action: "install_skill_files",
  files: [
    { path: "pack/one/SKILL.md", data: b64("---\nname: up-one\ndescription: Uploaded pack one\n---\n# 1\n") },
    { path: "pack/two/deep/SKILL.md", data: b64("---\nname: up-two\ndescription: Uploaded pack two\n---\n# 2\n") },
    { path: "pack/README.md", data: b64("not a skill\n") },
  ],
});
assert.ok(upPack.success, `bulk upload: ${JSON.stringify(upPack)}`);
assert.deepEqual(upPack.installed.sort(), ["up-one", "up-two"], "both uploaded bundles installed");
await run({ action: "remove_skill", skillName: "up-one" });
await run({ action: "remove_skill", skillName: "up-two" });

// edit_skill preserves frontmatter it does not own (invocation policy flags)
await run({ action: "add_skill", skillName: "rpc-skill", description: "First desc", skillBody: "# v1" });
const skFile = join(home, "skills", "rpc-skill", "SKILL.md");
writeFileSync(skFile, readFileSync(skFile, "utf8").replace("---\nname:", "---\ncustom-flag: keep-me\nuser-invocable: false\nname:"), "utf8");
const edited2 = await run({ action: "edit_skill", skillName: "rpc-skill", description: "Second desc", skillBody: "# v2" });
assert.ok(edited2.success, `edit_skill: ${JSON.stringify(edited2)}`);
const doc = mod.parseSkillDoc(readFileSync(skFile, "utf8"));
assert.equal(doc["custom-flag"], "keep-me", "custom frontmatter preserved");
assert.equal(doc["user-invocable"], false, "policy flag preserved");
assert.equal(doc.description, "Second desc", "description updated");
await run({ action: "remove_skill", skillName: "rpc-skill" });

// auto-compact override: guard rail, round-trip, coexistence with MCP rows
let cs = await run({ action: "compact_status" });
assert.equal(cs.overridden, false, "no override initially");
assert.equal(cs.ratio, 0.8, "harness default reported when absent");
const tooHigh = await run({ action: "set_compact", thresholdRatio: 0.9 });
assert.ok(tooHigh.error && /0\.75/.test(tooHigh.error), "above safe max rejected");
const tooLow = await run({ action: "set_compact", thresholdRatio: 0.4 });
assert.ok(tooLow.error && /0\.5/.test(tooLow.error), "below safe min rejected");
const notNum = await run({ action: "set_compact", thresholdRatio: "x" });
assert.ok(notNum.error, "non-numeric rejected");
const setOk = await run({ action: "set_compact", thresholdRatio: 0.66 });
assert.ok(setOk.success, `set_compact: ${JSON.stringify(setOk)}`);
cs = await run({ action: "compact_status" });
assert.equal(cs.overridden, true, "override now present");
assert.equal(cs.ratio, 0.66, "round-trip ratio");
const patch2 = readFileSync(join(home, "profiles", "testprof", "cordis.patch.yml"), "utf8");
assert.equal(patch2.split("# >>> dsh-enhanced:compact >>>").length - 1, 1, "exactly one compact block");
// An MCP row rewrite must not clobber the compact block (separate markers).
await run({ action: "add_mcp", mcpName: "demo", mcpConfig: { command: "npx" } });
cs = await run({ action: "compact_status" });
assert.equal(cs.ratio, 0.66, "MCP rewrite preserved compact override");
await run({ action: "remove_mcp", mcpName: "demo" });

// search module: config override of the web-search-free row, secret preservation,
// and the thin delegating dsh_search tool
let ls = await run({ action: "list_search" });
assert.equal(ls.provider, "bing", "default provider when absent");
assert.equal(ls.bingMarket, "zh-CN", "default bing market when absent");
assert.equal(ls.hasKey.exaApiKey, false, "no key initially");
const setSearch = await run({ action: "set_search", provider: "exa", region: "us", bingMarket: "en-US", exaApiKey: "EXA123" });
assert.ok(setSearch.success, `set_search: ${JSON.stringify(setSearch)}`);
ls = await run({ action: "list_search" });
assert.equal(ls.provider, "exa", "provider round-trip");
assert.equal(ls.region, "us", "region round-trip");
assert.equal(ls.hasKey.exaApiKey, true, "exa key recorded (value not echoed)");
assert.equal(ls.hasKey.tavilyApiKey, false, "other keys still absent");
const searchPatch = readFileSync(join(home, "profiles", "testprof", "cordis.patch.yml"), "utf8");
assert.equal(searchPatch.split("# >>> dsh-enhanced:search >>>").length - 1, 1, "exactly one search block");
assert.ok(searchPatch.includes("id: web-search-free"), "override reuses Free Search row id");
assert.ok(searchPatch.includes("EXA123"), "secret written to disk");
// blank key field preserves the existing value (no echo, no wipe)
const setSearch2 = await run({ action: "set_search", provider: "ddg", exaApiKey: "" });
assert.ok(setSearch2.success, `set_search preserve: ${JSON.stringify(setSearch2)}`);
ls = await run({ action: "list_search" });
assert.equal(ls.provider, "ddg", "provider updated");
assert.equal(ls.hasKey.exaApiKey, true, "blank key preserved existing value");
// normalization at the trust boundary: messy region/market/key input is coerced
const norm = await run({ action: "set_search", provider: "searxng", region: "  US ", bingMarket: "en-us", tavilyApiKey: " TV123 ", searxngInstances: "http://127.0.0.1:8888/, localhost:8888,  https://my.searx.example " });
assert.ok(norm.success, `set_search normalize: ${JSON.stringify(norm)}`);
ls = await run({ action: "list_search" });
assert.equal(ls.region, "us", "region trimmed + lowercased");
assert.equal(ls.bingMarket, "en-US", "bing market canonicalized to lang-COUNTRY");
assert.equal(ls.hasKey.tavilyApiKey, true, "key trimmed");
assert.equal(
	ls.searxngInstances,
	"http://127.0.0.1:8888, http://localhost:8888, https://my.searx.example",
	"instances parsed: scheme added, trailing slash stripped",
);
const sxPatch = readFileSync(join(home, "profiles", "testprof", "cordis.patch.yml"), "utf8");
assert.ok(sxPatch.includes("- http://127.0.0.1:8888"), "instances persisted as YAML array");
assert.ok(Array.isArray(ls.instanceStatus), "instance status list present");
assert.equal(ls.instanceStatus.length, ls.searxngInstances.split(", ").length, "each saved instance gets a status entry");
for (const st of ls.instanceStatus) {
	assert.ok(["ok", "misconfigured", "down"].includes(st.state), `status state valid (${st.url})`);
	assert.ok(typeof st.detail === "string" && st.detail.length > 0, "status carries human detail");
}
// the thin tool degrades gracefully without a provider
const srch = await tools["dsh_search"].execute({ query: "hello" });
assert.equal(srch.ok, false, "dsh_search errors when no provider registered");

// ── T1 hardening: engine cooldown memory ──────────────────────────────────────
const cd = await import("../dist/cooldown.js");
assert.equal(cd.classifyFailure("firecrawl is out of credits: quota exceeded")?.kind, "quota", "quota wording classified");
assert.equal(cd.classifyFailure("Exa API error (HTTP 429)")?.kind, "ratelimit", "HTTP 429 classified");
assert.equal(cd.classifyFailure("DuckDuckGo is rate-limited right now (anti-bot challenge)")?.kind, "ratelimit", "DDG anti-bot classified");
assert.equal(cd.classifyFailure("connection error: socket hang up"), null, "generic network errors never cool down");
assert.equal(cd.classifyFailure("Perplexity search requires PERPLEXITY_API_KEY"), null, "missing key never cools down");
const cst = cd.emptyState();
assert.equal(cd.recordCooldown(cst, "tavily", "tavily is out of credits", 1_000), true, "quota failure records an entry");
assert.ok(Date.parse(cst.engines.tavily.until) > 1_000, "until is a future ISO timestamp");
assert.equal(cd.activeCooldowns(cst, 2_000).has("tavily"), true, "engine active inside window");
assert.equal(cd.activeCooldowns(cst, Date.parse(cst.engines.tavily.until) + 1).size, 0, "expired entries invisible");
assert.equal(cd.clearCooldown(cst, "tavily"), true, "clear removes entry");
// persistence round-trip under the temp DSH_HOME
cd.recordCooldown(cst, "exa", "exa quota exhausted", Date.now());
cd.saveCooldownState(cst);
assert.equal(cd.loadCooldownState().engines.exa.until, cst.engines.exa.until, "state survives restart-shaped reload");
cd.removeCooldownState();
assert.equal(Object.keys(cd.loadCooldownState().engines).length, 0, "remove clears state");
// chain building: exclusions/cooldowns filter, time ordering preserved
const bc = vendor.buildChain;
let ch = bc("bing", {}, undefined, new Map());
assert.equal(ch.chain[0], "bing", "preferred leads the free tier");
ch = bc("bing", { excludedEngines: ["bing"] }, undefined, new Map());
assert.equal(ch.preferredSkippedReason, "excluded", "excluded preferred reports reason");
assert.equal(ch.chain.includes("bing"), false, "excluded preferred leaves the chain");
ch = bc("bing", {}, undefined, new Map([["bing", { until: new Date(Date.now() + 60_000).toISOString(), reason: "q" }]]));
assert.equal(ch.preferredSkippedReason, "cooldown", "cooling preferred reports reason");
assert.equal(ch.chain.includes("bing"), false, "cooling preferred leaves the chain");
ch = bc("perplexity", {}, { days: 7 }, new Map());
assert.equal(ch.preferredSkippedReason, "time-filter", "time-incapable preferred skipped");
assert.equal(ch.chain.includes("perplexity"), false, "skipped preferred not attempted");
ch = bc("bing", {}, { days: 7 }, new Map());
assert.ok(ch.chain.indexOf("tavily") < ch.chain.indexOf("perplexity"), "time-capable engines sort ahead");
ch = bc("bing", { excludedEngines: ["ddg"] }, { days: 7 }, new Map());
assert.equal(ch.chain.includes("ddg"), false, "excluded engine absent under timeRange too");
// set_search invalidates stored cooldown verdicts (config/keys changed)
mkdirSync(join(home, "dsh-enhanced"), { recursive: true });
writeFileSync(
	join(home, "dsh-enhanced", "cooldown-state.json"),
	JSON.stringify({ engines: { bing: { until: new Date(Date.now() + 3_600_000).toISOString(), reason: "stale" } } }),
);
const inv = await run({ action: "set_search", provider: "bing" });
assert.ok(inv.success, `invalidating set_search: ${JSON.stringify(inv)}`);
assert.equal(Object.keys(cd.loadCooldownState().engines).length, 0, "set_search wiped stale cooldowns");

// ── T2 hardening: secret redaction at error boundaries ────────────────────────
const { scrubSecrets } = await import("../dist/shared.js");
assert.equal(scrubSecrets("gateway said sk-live-abc123DEF456ghi789 down"), "gateway said [redacted] down", "OpenAI-shaped key masked");
assert.equal(scrubSecrets("token ghp_A1b2C3d4E5f6G7h8I9j0K1l2 ok"), "token [redacted] ok", "GitHub token masked");
assert.equal(scrubSecrets("AIzaSyA1234567890abcdefghijklmnopqrstuv"), "[redacted]", "Google key masked");
assert.equal(scrubSecrets("hdr eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OH0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c end"), "hdr [redacted] end", "JWT masked");
assert.equal(scrubSecrets('Authorization: Bearer abcdef1234567890'), "Authorization: [redacted]", "bearer header masked");
assert.equal(scrubSecrets('api_key="supersecretvalue12345"'), "[redacted]", "labeled key masked");
assert.equal(scrubSecrets("Bing returned HTTP 403 for this query"), "Bing returned HTTP 403 for this query", "ordinary prose untouched");

// ── T3 hardening: key-bearing patch file is owner-only ────────────────────────
const kset = await run({ action: "set_search", provider: "exa", exaApiKey: "sk-test-abcdef123456" });
assert.ok(kset.success, `set_search with key: ${JSON.stringify(kset)}`);
if (process.platform !== "win32") {
	const { statSync } = await import("node:fs");
	assert.equal(
		statSync(join(home, "profiles", "testprof", "cordis.patch.yml")).mode & 0o777,
		0o600,
		"patch written 0600 when keys are stored",
	);
}

// ── T4 hardening: keyed-engine endpoint overrides ─────────────────────────────
const epSet = await run({ action: "set_search", provider: "exa", exaApiKey: "", exaBaseUrl: "https://gw.example.com/v3/search" });
assert.ok(epSet.success, `endpoint set_search: ${JSON.stringify(epSet)}`);
assert.equal((await run({ action: "list_search" })).exaBaseUrl, "https://gw.example.com/v3/search", "endpoint override persisted");
const badEp = await run({ action: "set_search", provider: "exa", exaBaseUrl: "ftp://nope.example.com" });
assert.ok(badEp.error && /exaBaseUrl/.test(badEp.error), `non-http scheme rejected: ${JSON.stringify(badEp)}`);
await run({ action: "set_search", provider: "exa", exaApiKey: "", exaBaseUrl: "" });
assert.equal((await run({ action: "list_search" })).exaBaseUrl ?? "", "", "blank clears the override");
assert.ok((await run({ action: "list_search" })).hasKey.exaApiKey === true, "blank endpoint did not disturb stored key");

// ── T5 hardening: per-engine exclude toggles ──────────────────────────────────
const exSet = await run({ action: "set_search", provider: "bing", exaApiKey: "", excludedEngines: "ddg, perplexity" });
assert.ok(exSet.success, `exclude set_search: ${JSON.stringify(exSet)}`);
assert.deepEqual(
	(await run({ action: "list_search" })).excludedEngines.slice().sort(),
	["ddg", "perplexity"],
	"CSV exclusions persisted",
);
const badEx = await run({ action: "set_search", provider: "bing", excludedEngines: ["nope"] });
assert.ok(badEx.error && /unknown engines/.test(badEx.error), `typo rejected: ${JSON.stringify(badEx)}`);
const allEx = await run({ action: "set_search", provider: "bing", excludedEngines: vendor.ALL_ENGINES });
assert.ok(allEx.error && /every engine/.test(allEx.error), "excluding every engine rejected");
await run({ action: "set_search", provider: "bing", exaApiKey: "", excludedEngines: [] });
assert.deepEqual((await run({ action: "list_search" })).excludedEngines, [], "empty array clears exclusions");

// ── T6 hardening: structured fallback status (_fallback / status:"degraded") ──
let provider2 = null;
const ctx2 = {
	logger: { warn: () => {}, info: () => {} },
	web: { registerSearchProvider: (p) => { provider2 = p; }, searchProviderId: "preset" },
	tools: { register: () => () => {} },
	systemPrompt: { section: () => () => {} },
	webServer: { register: () => () => {} },
	settings: { register: () => () => {} },
	get: () => undefined,
	effect: (factory) => factory(),
	inject(deps, fn) { fn(this); },
};
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
	if (/api\.tavily\.com/.test(String(url))) {
		return new Response(
			JSON.stringify({ results: [{ url: "https://example.com/a", title: "A", content: "stub result" }] }),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}
	throw new Error("offline-stub");
};
try {
	vendor.apply(ctx2, { provider: "exa", tavilyApiKey: "stub-key", cache: false });
	// preferred exa has no key -> fails -> chain lands on tavily (stubbed)
	const fb = await provider2.search({ query: "q", engine: "exa" });
	assert.ok(fb._fallback && fb._fallback.from === "exa" && fb._fallback.to === "tavily" && fb._fallback.reason === "failed", `fallback twin: ${JSON.stringify(fb._fallback)}`);
	assert.ok(/unavailable or failed/.test(fb.content ?? ""), "human Note still present alongside _fallback");
	const direct = await provider2.search({ query: "q", engine: "tavily" });
	assert.equal(direct._fallback, undefined, "no fallback twin on a direct hit");
	assert.ok((direct.sources ?? []).length > 0, "stubbed tavily returned sources");
} finally {
	globalThis.fetch = origFetch;
}

// ── managed-block surgery (splitBlock / splitInner): the code that rewrites
// real user cordis.patch.yml files. Pin the contracts every feature module
// and every user config depends on. ──────────────────────────────────────────
const { splitBlock, splitInner, MCP_BEGIN: B, MCP_END: E } = await import("../dist/shared.js");

// no block => identity; inner reads as absent
let sample = "- id: keep\n  name: user-row\n";
assert.deepEqual(splitBlock(sample, B, E), { head: sample, tail: "" }, "no block: splitBlock is identity");
assert.equal(splitInner(sample, B, E), "", "no block: inner absent");

// block mid-file => head+tail restores everything outside it byte-for-byte
sample = "before\n\n" + B + "\nrow: 1\n" + E + "\nafter\n";
let cut = splitBlock(sample, B, E);
assert.equal(cut.head + cut.tail, "before\n\nafter\n", "head+tail keeps non-block text");
const innerTxt = splitInner(sample, B, E);
assert.ok(innerTxt.startsWith(B) && innerTxt.endsWith(E), "inner spans marker to marker");
assert.ok(innerTxt.includes("row: 1"), "inner carries the body");

// torn block (begin without end): dropped on write AND read as absent
sample = "keep\n" + B + "\nbroken: true\n";
cut = splitBlock(sample, B, E);
assert.equal(cut.head + cut.tail, "keep\n", "torn block dropped from head+tail");
assert.equal(splitInner(sample, B, E), "", "torn block reads as absent (no ghost rows)");

// CRLF after the end marker consumed once; lone \r too
assert.equal(splitBlock("a\n" + B + "\nx\n" + E + "\r\nb\n", B, E).tail, "b\n", "CRLF consumed");
assert.equal(splitBlock("a\n" + B + "\nx\n" + E + "\rb\n", B, E).tail, "b\n", "lone CR consumed");

// an end-marker-shaped line BEFORE begin never truncates early
sample = E + "\nmid\n" + B + "\nx\n" + E + "\ntail";
cut = splitBlock(sample, B, E);
assert.equal(cut.head, E + "\nmid\n", "earlier end-marker line stays in head");
assert.equal(splitInner(sample, B, E), B + "\nx\n" + E, "inner starts at OUR begin");

// only the FIRST block is managed; a later duplicate survives untouched in tail
sample = B + "\none\n" + E + "\n" + B + "\ntwo\n" + E + "\n";
cut = splitBlock(sample, B, E);
assert.ok(!cut.head.includes(B), "first block lifted");
assert.ok(cut.tail.includes("two"), "second block left in tail");

// rewrite cycle mirrors writeRows exactly: repeated add/remove must not grow
// whitespace, duplicate blocks, or lose user content above the block
const writeLikeFeature = (text, rowsYaml) => {
	const { head, tail } = splitBlock(text, B, E);
	let next = head + tail;
	if (rowsYaml) next = next.trimEnd() + "\n" + B + "\n" + rowsYaml + E + "\n";
	else next = next.replace(/\n+$/, "\n");
	return next;
};
let file = "# user comment survives\nuser row: keep\n";
for (let i = 0; i < 3; i++) file = writeLikeFeature(file, `managed: ${i}\n`);
assert.equal(file.split(B).length - 1, 1, "cycle keeps exactly one block");
assert.ok(file.startsWith("# user comment survives\nuser row: keep"), "user content preserved");
assert.ok(!file.includes("\n\n\n"), "no blank-line growth across cycles");
file = writeLikeFeature(file, "");
assert.ok(!file.includes(B), "empty rewrite removes the block");
assert.equal(file.trimEnd(), "# user comment survives\nuser row: keep", "file clean after removal");

// ── plugin manager: manifest read, own-block-only toggles, guards ────────────
const { PLUGINS_BEGIN: PB, PLUGINS_END: PE } = await import("../dist/shared.js");
const yamlMod = await import("js-yaml");
const profDir = join(home, "profiles", "testprof");
const profPatch = join(profDir, "cordis.patch.yml");
writeFileSync(join(profDir, "package.json"), JSON.stringify({
  name: "dsh-profile-testprof", private: true,
  dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/modlens", "my-plugin"] } },
  dependencies: {},
}));

// live detection: real Entries carry the package at .options.name and the row
// id at .id (bare .name is undefined — that bug made every pill read "off").
// Other modules' inject cbs expect their own scope shape — ignore their refire.
const fireInject = (scope) => ctx.injectCbs.forEach((fn) => { try { fn(scope); } catch {} });
fireInject({ loader: { entries: () => [{ options: { name: "my-plugin" } }, { id: "unrelated-row" }] } });
let listedPlg = await run({ action: "list_plugins" });
assert.ok(listedPlg.plugins.find((x) => x.id === "my-plugin")?.live, "options.name entry counts as live");
assert.ok(!listedPlg.plugins.find((x) => x.id === "@deepseek-ai/modlens")?.live, "absent entry not live");
fireInject({}); // back to no-loader for the rest of this section
listedPlg = await run({ action: "list_plugins" });
assert.equal(listedPlg.plugins.length, 3, "manifest bundles listed");
assert.ok(listedPlg.plugins.every((x) => x.profile === "testprof" && x.bundled && !x.disabled), "rows healthy by default");

// non-official toggle: lands in OUR block only, file stays a valid YAML array
let tog = await run({ action: "set_plugin_enabled", pluginId: "my-plugin", enabled: false });
assert.ok(tog.success, `disable my-plugin: ${JSON.stringify(tog)}`);
let plgPatch = readFileSync(profPatch, "utf8");
assert.ok(plgPatch.includes(PB) && /my-plugin/.test(plgPatch.split(PB)[1].split(PE)[0]), "row inside our markers");
assert.ok(Array.isArray(yamlMod.load(plgPatch)), "patched file remains a valid YAML array");
listedPlg = await run({ action: "list_plugins" });
const myRow = listedPlg.plugins.find((x) => x.id === "my-plugin");
assert.ok(myRow.disabled && myRow.disabledByUs, "list reflects our disable");

tog = await run({ action: "set_plugin_enabled", pluginId: "my-plugin", enabled: true });
assert.ok(tog.success, "re-enable succeeds");
plgPatch = readFileSync(profPatch, "utf8");
assert.ok(!plgPatch.includes(PB), "empty rows drop the block entirely");

// guards: hard-refused ids never toggle (incl. dsh-enhanced itself), official
// need confirm, unknown rejected
for (const id of ["dsh-base", "@deepseek-ai/dsh-base", "dsh-web-app", "dsh-enhanced", "@deepseek-ai/dsh-enhanced"]) {
  const r = await run({ action: "set_plugin_enabled", pluginId: id, enabled: false, confirm: true });
  assert.ok(r.error && r.error.includes("refusing"), `hard refusal for ${id}`);
}
const noConfirm = await run({ action: "set_plugin_enabled", pluginId: "@deepseek-ai/modlens", enabled: false });
assert.ok(noConfirm.error && noConfirm.error.includes("confirm"), "official disable demands confirm");
const unk = await run({ action: "set_plugin_enabled", pluginId: "nope", enabled: false });
assert.ok(unk.error && unk.error.includes("not known"), "unknown id rejected");

// user rows outside our block survive a toggle that also keeps prior disables
// '@' cannot start a plain YAML scalar — real patch files quote scoped ids.
writeFileSync(profPatch, '- id: user/thing\n  name: kept\n' + PB + '\n- id: "@deepseek-ai/modlens"\n  disabled: true\n' + PE + "\n");
await run({ action: "set_plugin_enabled", pluginId: "my-plugin", enabled: false, confirm: false });
plgPatch = readFileSync(profPatch, "utf8");
assert.ok(plgPatch.includes("user/thing"), "user rows preserved verbatim");
const parsed = yamlMod.load(plgPatch);
assert.ok(parsed.some((r) => r.id === "@deepseek-ai/modlens" && r.disabled === true), "prior managed disable kept");
assert.ok(parsed.some((r) => r.id === "my-plugin" && r.disabled === true), "new disable appended");

// ── session housekeeping: scan, dry-run/token execute, refusals ──────────────
const sesRoot = join(home, "sessions");
const mkSes = (ws, id, bytes, ageMs) => {
	const d = join(sesRoot, ws, `session-${id}`);
	mkdirSync(d, { recursive: true });
	const f = join(d, "session.jsonl.zstd");
	writeFileSync(f, Buffer.alloc(bytes));
	const t = new Date(Date.now() - ageMs);
	utimesSync(f, t, t); // scan takes the newest of file/dir mtimes
	utimesSync(d, t, t);
};
mkSes("ws-a", "old1", 1000, 40 * 86_400_000);
mkSes("ws-a", "recent", 500, 60_000); // touched 1 min ago => idle-guard
mkSes("ws-b", "old2", 2000, 10 * 86_400_000);

const listedSes = await run({ action: "list_sessions" });
assert.equal(listedSes.sessions.length, 3, "all session dirs scanned");
assert.equal(listedSes.totalBytes, 3500, "totalBytes sums artifacts");

// idle-guard and unknown-key refusals
const guardRes = await run({ action: "delete_sessions", sessionIds: ["ws-a/recent"] });
assert.ok(guardRes.error && guardRes.error.includes("idle"), "recent session refused");
const unkSes = await run({ action: "delete_sessions", sessionIds: ["nope/ghost"] });
assert.ok(unkSes.error.includes("not a known session directory"), "unknown key refused");

// dry run -> wrong token rejected -> correct token moves dirs to trash
const dry = await run({ action: "delete_sessions", sessionIds: ["ws-a/old1"] });
assert.ok(dry.confirmToken && dry.totalBytes === 1000, "dry run returns plan + token");
assert.ok(existsSync(join(sesRoot, "ws-a", "session-old1")), "dry run moved nothing");
const badTok = await run({ action: "delete_sessions", sessionIds: ["ws-a/old1"], confirm: true, confirmToken: "deadbeef0000" });
assert.ok(badTok.error && badTok.error.includes("mismatch"), "wrong token rejected");
const exec = await run({ action: "delete_sessions", sessionIds: ["ws-a/old1"], confirm: true, confirmToken: dry.confirmToken });
assert.ok(exec.success && exec.freedBytes === 1000, `execute: ${JSON.stringify(exec)}`);
assert.ok(!existsSync(join(sesRoot, "ws-a", "session-old1")), "source dir gone");
const trashEntries = readdirSync(join(home, "dsh-enhanced", "trash"));
assert.equal(trashEntries.length, 1, "one trashed dir");
assert.ok(readdirSync(join(home, "dsh-enhanced", "trash", trashEntries[0])).includes("session.jsonl.zstd"), "trash keeps contents");

// live-in-this-process refusal via the in-memory store, when exposed
ctx.sessions = { store: new Map([["session-old2", {}]]) };
const liveRes = await run({ action: "delete_sessions", sessionIds: ["ws-b/old2"] });
assert.ok(liveRes.error && liveRes.error.includes("open in this process"), "live session refused");
assert.ok(listedSes.sessions.every((s) => !s.liveHere), "earlier scan predates store exposure");

rmSync(home, { recursive: true, force: true });
console.log("selfcheck OK");
