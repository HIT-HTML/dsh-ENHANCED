/**
 * Skill manager module: the managed catalog is plain
 * `<DSH_HOME>/skills/<name>/SKILL.md` bundles — the built-in filesystem
 * provider watches that root and hot-reloads, so writing files IS the API.
 */
import { readFile, mkdir, mkdtemp, readdir, rm, cp, chmod, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, sep } from "node:path";
import yaml from "js-yaml";
import { SKILLS_DIR, assertName, type Env, type Handler } from "./shared.js";

// Canonical skill-name grammar from @deepseek-ai/dsh-skill; anything looser
// gets written to disk and then silently ignored by the real loader.
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SKILL_ACTIONS = ["list_skills", "read_skill", "add_skill", "edit_skill", "remove_skill", "install_skill", "install_skill_files"] as const;

function scalar(value: unknown): string {
  return yaml.dump(value, { lineWidth: 0 }).trimEnd();
}

/**
 * Frontmatter of a SKILL.md, parsed as real YAML — block scalars included
 * (`description: >` with indented continuation lines), which a line-based
 * regex reads as the bare indicator ">".
 */
export function parseSkillDoc(raw: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    return doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Frontmatter-stripped body — the format read_skill must return, since
 *  edit_skill re-wraps whatever it is given in fresh frontmatter. */
function stripFrontmatter(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  return (m ? raw.slice(m[0].length) : raw).trim();
}

async function listManagedSkillDirs(): Promise<string[]> {
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function writeSkill(
  name: string,
  description: string,
  body: string,
  whenToUse?: string,
  extraFrontmatter?: Record<string, unknown>,
): Promise<string> {
  const dir = join(SKILLS_DIR, name);
  await mkdir(dir, { recursive: true });
  let front = `---\nname: ${scalar(name)}\ndescription: ${scalar(description)}\n`;
  if (whenToUse) front += `whenToUse: ${scalar(whenToUse)}\n`;
  // Preserve policy/metadata keys the loader consumes (user-invocable,
  // disable-model-invocation, metadata, …); dropping them would silently
  // change how agents see the skill.
  for (const [k, v] of Object.entries(extraFrontmatter ?? {})) {
    front += yaml.dump({ [k]: v }, { lineWidth: 0 });
  }
  front += `---\n`;
  const file = join(dir, "SKILL.md");
  await writeFile(file, `${front}\n${body.trim()}\n`, "utf8");
  return file;
}

/** Folders under root (not root itself) holding a SKILL.md, depth-capped,
 *  dot-dirs skipped — the "folder of skills" scan for install_skill. */
async function findSkillBundles(root: string, depth = 6): Promise<string[]> {
  if (depth < 0) return [];
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = join(root, e.name);
    const hasManifest = await stat(join(dir, "SKILL.md")).then(() => true, () => false);
    out.push(...(hasManifest ? [dir] : await findSkillBundles(dir, depth - 1)));
  }
  return out;
}

type InstallResult = { status: "ok"; name: string } | { status: "exists"; name: string } | { status: "error"; message: string };

/** Validate + copy one SKILL.md bundle into the managed catalog.
 *  Same rules for single and bulk installs; never copies onto itself. */
async function installBundle(srcReal: string, nameHint: string | undefined, overwrite: boolean): Promise<InstallResult> {
  try {
    const raw = await readFile(join(srcReal, "SKILL.md"), "utf8");
    const doc = parseSkillDoc(raw);
    const name = assertName(nameHint || doc.name, SKILL_NAME_RE, "skill");
    if (!String(doc.description ?? "").trim()) {
      return { status: "error", message: `SKILL.md in ${srcReal} needs a non-empty frontmatter description` };
    }
    const dest = join(SKILLS_DIR, name);
    if (!overwrite && (await stat(dest).catch(() => null))) {
      return { status: "exists", name };
    }
    // Trust boundary: never copy a folder into itself or onto the
    // catalog root.
    if (srcReal === dest || dest.startsWith(srcReal + sep) || srcReal === (await realpath(SKILLS_DIR))) {
      return { status: "error", message: "Refusing to install a folder into itself" };
    }
    await cp(srcReal, dest, { recursive: true, force: overwrite });
    return { status: "ok", name };
  } catch (error) {
    return { status: "error", message: String((error as Error).message ?? error) };
  }
}

/** Install several bundles with per-skill results, so one bad bundle never
 *  blocks the rest. Shared by disk-path and browser-upload installs. */
async function installMany(bundles: string[], displayRoot: string | null, overwrite: boolean) {
  const installed: string[] = [];
  const skipped: string[] = [];
  const failed: { path: string; message: string }[] = [];
  for (const bundle of bundles.sort()) {
    const r = await installBundle(bundle, undefined, overwrite);
    if (r.status === "ok") installed.push(r.name);
    else if (r.status === "exists") skipped.push(r.name);
    else failed.push({ path: displayRoot ? bundle.slice(displayRoot.length + 1) : bundle, message: r.message });
  }
  return {
    success: true as const,
    installed,
    skipped,
    failed,
    note: `${installed.length} installed, ${skipped.length} skipped, ${failed.length} failed. Skill catalog hot-reloads; may take a moment.`,
  };
}

export const handleSkills: Handler = async function (action, args, env: Env) {
  const { ctx } = env;
  const { skillName, description, whenToUse, skillBody } = args;
  switch (action) {
    case "list_skills": {
      const snapshot = await ctx.skills.snapshot({});
      const dirs = new Set(await listManagedSkillDirs());
      // The registry snapshot can lag behind disk (hot-reload); surface
      // managed bundles that are not in it yet.
      const seen = new Set(snapshot.skills.map((s: any) => s.name));
      for (const dir of dirs) {
        if (seen.has(dir)) continue;
        const raw = await readFile(join(SKILLS_DIR, dir, "SKILL.md"), "utf8").catch(() => "");
        snapshot.skills.push({
          name: dir,
          description: String(parseSkillDoc(raw).description || ""),
          source: "user-dsh",
          provider: "local",
        });
      }
      // A line-based parser upstream can hand back an unfinished block
      // scalar ("description: >") or nothing for a managed skill; re-read
      // those files so the card never shows a bare ">".
      for (const s of snapshot.skills) {
        const desc = String(s.description ?? "").trim();
        if (!dirs.has(s.name) || (desc !== "" && !/^[>|][+-\d]*$/.test(desc))) continue;
        const raw = await readFile(join(SKILLS_DIR, s.name, "SKILL.md"), "utf8").catch(() => "");
        if (!raw) continue;
        const parsed = parseSkillDoc(raw);
        if (parsed.description) s.description = String(parsed.description);
      }
      return {
        skills: snapshot.skills.map((s: any) => {
          const info: any = {
            name: s.name,
            description: s.description,
            source: s.source,
            provider: s.provider,
          };
          if (dirs.has(s.name)) info.managedFile = join(SKILLS_DIR, s.name, "SKILL.md");
          return info;
        }),
      };
    }
    case "read_skill": {
      const name = assertName(skillName, SKILL_NAME_RE, "skill");
      // Managed bundles read straight from disk: the registry can lag
      // hot-reload, and skills contributed by presets/plugins may not
      // resolve through ctx.skills at all — yet list_skills shows them.
      const file = join(SKILLS_DIR, name, "SKILL.md");
      const raw = await readFile(file, "utf8").catch(() => null);
      if (raw != null) {
        return { name, description: String(parseSkillDoc(raw).description ?? ""), content: stripFrontmatter(raw) };
      }
      const skill = await ctx.skills.get(name);
      if (!skill) return { error: `Skill "${name}" not found` };
      return { name: skill.name, description: skill.description, content: skill.content };
    }
    case "add_skill":
    case "edit_skill": {
      const name = assertName(skillName, SKILL_NAME_RE, "skill");
      if (!description && action === "add_skill") return { error: "description is required for add_skill" };
      const existing = await ctx.skills.get(name).catch(() => undefined);
      if (action === "add_skill" && existing && (await listManagedSkillDirs()).includes(name)) {
        return { error: `Skill "${name}" already exists; use edit_skill` };
      }
      // An edit must keep frontmatter the loader consumes beyond the
      // fields this action owns — invocation policy flags decide whether
      // agents see the skill at all.
      const extra: Record<string, unknown> = {};
      if (action === "edit_skill") {
        const raw = await readFile(join(SKILLS_DIR, name, "SKILL.md"), "utf8").catch(() => "");
        for (const [k, v] of Object.entries(parseSkillDoc(raw))) {
          if (k !== "name" && k !== "description" && k !== "whenToUse") extra[k] = v;
        }
      }
      const file = await writeSkill(name, description ?? existing?.description ?? name, skillBody ?? existing?.content ?? "", whenToUse, extra);
      return { success: true, file, note: "Skill catalog hot-reloads; may take a moment." };
    }
    case "remove_skill": {
      const name = assertName(skillName, SKILL_NAME_RE, "skill");
      await rm(join(SKILLS_DIR, name), { recursive: true, force: true });
      return { success: true, message: `Removed ${join(SKILLS_DIR, name)} (if it existed)` };
    }
    case "install_skill": {
      // The unit of installation is a folder bundle: SKILL.md plus any
      // number of scripts/assets/subfolders. Validate against the
      // loader's own rules BEFORE copying, so an installed skill can
      // never be silently ignored by the catalog.
      //
      // If sourcePath itself has no SKILL.md but contains bundles below
      // it (a folder OF skills), every bundle found is installed with
      // the same per-skill gauntlet — existing ones are skipped unless
      // overwrite:true. Dot-dirs are never scanned; walk depth is capped.
      const src = typeof args.sourcePath === "string" ? args.sourcePath.trim() : "";
      if (!src) return { error: "sourcePath is required (folder containing SKILL.md)" };
      const srcReal = await realpath(src).catch(() => {
        throw new Error(`sourcePath does not exist: ${src}`);
      });
      const overwrite = args.overwrite === true;
      const skillsRoot = await stat(join(srcReal, "SKILL.md")).catch(() => null);
      const bundles = skillsRoot ? [srcReal] : await findSkillBundles(srcReal);
      if (!skillsRoot && bundles.length === 0) {
        return { error: `No SKILL.md found in ${srcReal} (or any subfolder, depth ≤ 6, ignoring dot-dirs)` };
      }
      if (bundles.length > 1 || (!skillsRoot && bundles.length === 1)) {
        // Multi-bundle (or nested-single) mode: per-skill results instead
        // of all-or-nothing, so one bad bundle doesn't block the rest.
        return await installMany(bundles, null, overwrite);
      }
      const r = await installBundle(srcReal, skillName, overwrite);
      if (r.status === "exists") return { error: `Skill "${r.name}" already exists; pass overwrite:true to replace it` };
      if (r.status !== "ok") return { error: r.message };
      return { success: true, name: r.name, file: join(SKILLS_DIR, r.name, "SKILL.md"), note: "Skill catalog hot-reloads; may take a moment." };
    }
    case "install_skill_files": {
      // Same pipeline as install_skill, but the bundle arrives THROUGH
      // the browser (folder picker): browsers hide absolute paths, so
      // the client uploads file contents. They are staged verbatim into
      // a temp tree, then run through the very same scan-and-install
      // rules — one skill or a folder of them, byte for byte identical
      // semantics to handing install_skill a disk path.
      const files = Array.isArray(args.files) ? args.files : [];
      const hasManifest = files.some((f: any) => /(^|\/)SKILL\.md$/.test(String(f?.path ?? "")));
      if (!hasManifest) return { error: "files must include a SKILL.md" };
      const stage = await mkdtemp(join(tmpdir(), "dshx-upload-"));
      try {
        let total = 0;
        for (const f of files) {
          const rel = String(f?.path ?? "").replace(/\\/g, "/").split("/").filter(Boolean).join("/");
          if (!rel || rel.split("/").some((s) => s === ".." || s === ".")) {
            return { error: `Unsafe file path in bundle: ${String(f?.path)}` };
          }
          const data = Buffer.from(String(f?.data ?? ""), "base64");
          total += data.length;
          // ponytail: flat 5 MB cap on uploaded bundles; chunk/stream if a real skill ever needs more.
          if (total > 5 * 1024 * 1024) return { error: "Bundle exceeds the 5 MB upload cap" };
          const abs = join(stage, ...rel.split("/"));
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, data);
          // Browsers drop permission bits on uploads; a shebang means the
          // file is meant to be executed, so restore what cp() would have kept.
          if (data[0] === 0x23 && data[1] === 0x21) await chmod(abs, 0o755);
        }
        const bundles = (await stat(join(stage, "SKILL.md")).catch(() => null))
          ? [stage]
          : await findSkillBundles(stage);
        if (bundles.length === 0) return { error: "files must include a SKILL.md" };
        const overwrite = args.overwrite === true;
        if (bundles.length === 1) {
          const r = await installBundle(bundles[0], skillName, overwrite);
          if (r.status === "exists") return { error: `Skill "${r.name}" already exists; pass overwrite:true to replace it` };
          if (r.status !== "ok") return { error: r.message };
          return { success: true, name: r.name, file: join(SKILLS_DIR, r.name, "SKILL.md"), note: "Skill catalog hot-reloads; may take a moment." };
        }
        return await installMany(bundles, stage, overwrite);
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    }
    default:
      return null;
  }
};
