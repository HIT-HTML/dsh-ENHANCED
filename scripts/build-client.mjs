// Build the single served client bundle out of plain module files.
//
// DSH serves exactly ONE file per package (exports["./client"] →
// /plugins/<id>/client.js), so modularity here is compile-time: every file
// below is concatenated INSIDE the ModuleLoader factory body and shares one
// lexical scope. Order IS integration order:
//
//   client/core.js                    opens the factory, shared css/helpers,
//                                     the section contract arrays, Manager shell
//   client/sections/<feature>.js      one card section per feature
//   client/themes/*.js                vendored themes, pushed into THEMES
//   client/main.js                    plugin apply(), theme boot, closes factory
//
// Adding a feature = add a file + one line here.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
	"client/core.js",
	"client/sections/skills.js",
	"client/sections/mcp.js",
	"client/sections/plugins.js",
	"client/sections/sessions.js",
	"client/sections/compact.js",
	"client/sections/search.js",
	"client/themes/cyberpunk2077.js",
	"client/themes/matrix.js",
	"client/sections/theme.js",
	"client/main.js",
];

let out = "";
for (const f of FILES) {
	out += `\n// ════════════════════ ${f} ════════════════════\n\n` + readFileSync(join(root, f), "utf8") + "\n";
}
// Atomic replace: dev instances watch client.js and re-hash it for their
// rev; writing in place let a watcher hash a torn mid-write copy.
const outfile = join(root, "client.js");
const tmp = `${outfile}.tmp`;
writeFileSync(tmp, out.replace(/^\n+/, ""));
renameSync(tmp, outfile);

// Fail the build, not the page: syntax errors must never ship.
execFileSync(process.execPath, ["--check", join(root, "client.js")], { stdio: "inherit" });
console.log(`client.js built from ${FILES.length} modules`);
