// ════════════════════ client/core.js ════════════════════

// dsh-enhanced browser half — CORE module (composition root of the card).
//
// A "Skills & MCPs"-style card inside Settings → Plugins → Plugin
// Configuration. Plain JS in DSH's window.__ModuleLoader__ format; the served
// client.js is CONCATENATED from client/** by scripts/build-client.mjs, so all
// files share one factory scope.
//
// Architecture: core owns only the shell — staged-draft state, footer
// Save/Discard, and four plain arrays that feature sections plug into:
//
//   DRAFT_SHAPES   () => ({...})    this section's slice of the staged draft
//   DIRTY_CHECKS   (draft) => bool  when Save/Discard light up
//   SAVE_STEPS     async (call, remaining) — replayed in order on Save;
//                  steps consume `remaining` (a clone of the draft) and clear
//                  their keys from it once applied, so a mid-batch failure
//                  keeps exactly the unapplied part staged
//   SECTIONS       React components, rendered in registration (= build) order
//
// All data flows through the package-private RPC channel "/dsh-enhanced" that
// the host half serves; Save replays each staged change as the exact action
// the model tool uses, so the GUI cannot drift from the agent path.
//
// Card chrome mirrors modsearch's settings card (collapsible shell, chevron,
// ghost/primary footer pair, --dsw-alias-* tokens, lazy load on expand).
// Deliberately simpler: English-only labels (ponytail: copy modsearch's en/zh
// TEXT tables if a bilingual card is ever needed).
window.__ModuleLoader__.load({
	id: "dsh-enhanced",
	factory: (require) => {
		const React = require("react");
		const e = React.createElement;

		// Same input primitive the built-in cards use; falls back to a plain
		// styled input where the module is absent rather than dying in apply().
		let Input = null;
		try {
			Input = require("@deepseek-ai/dsh-client-ui-primitives").Input;
		} catch {
			Input = null;
		}
		const inputEl = (props) =>
			e(Input || "input", Input ? props : Object.assign({ style: css.input }, props));

		const BORDER = "var(--dsw-alias-border-l2, rgba(127,127,127,0.35))";
		const TERTIARY = "var(--dsw-alias-label-tertiary, rgba(127,127,127,0.8))";
		const SECONDARY = "var(--dsw-alias-label-secondary, inherit)";
		const RED = "#e05252";
		const GREEN = "#3fa66a";
		const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

		// One scoped stylesheet gives the card what inline styles cannot:
		// hover, focus-visible and disabled states, plus its single entrance
		// motion. Class names are dshx-* so nothing leaks into the host app.
		const CSS_TEXT = `
			/* Containment guard: whatever happens inside, this card can never
			   grow a horizontal scrollbar — anything wider is clipped. */
			.dshx-body { animation: dshx-in .18s ease-out; max-width: 100%; overflow-x: clip; }
			@keyframes dshx-in { from { opacity: 0; transform: translateY(-4px); } }
			.dshx-btn { transition: background-color .15s, border-color .15s; }
			.dshx-btn:hover:not(:disabled) { background-color: var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.08)); }
			.dshx-btn:disabled { opacity: .45; cursor: default !important; }
			.dshx-danger:hover:not(:disabled) { background-color: color-mix(in srgb, ${RED} 12%, transparent); border-color: ${RED} !important; }
			.dshx-primary:hover:not(:disabled) { filter: brightness(1.12); }
			.dshx-input:focus-visible { outline: none; border-color: var(--dsw-alias-label-primary, currentColor); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-label-primary, currentColor) 15%, transparent); }
			.dshx-btn:focus-visible, .dshx-check:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, currentColor); outline-offset: 1px; }
			.dshx-tbody tr[data-dim="1"] > td { opacity: .45; }
			.dshx-tbody tr:hover > td { background-color: color-mix(in srgb, currentColor 4%, transparent); }
			.dshx-tbody tr:last-child > td { border-bottom: none; }
			textarea.dshx-input { resize: vertical; min-height: 34px; font-family: inherit; }
		`;

		const css = {
			wrap: { maxWidth: "780px", display: "flex", flexDirection: "column", gap: "20px", color: SECONDARY, fontSize: "13px" },
			h: { margin: "0", fontSize: "14px", fontWeight: 600 },
			chip: { fontSize: "11px", lineHeight: 1, padding: "3px 8px", borderRadius: "999px", border: `1px solid ${BORDER}`, color: TERTIARY },
			note: { margin: "-12px 0 0", color: TERTIARY, fontSize: "12px" },
			err: { margin: "0", color: RED, fontSize: "12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
			tableWrap: { overflowX: "auto" },
			// Fixed layout: the table always equals its container's width, so
			// no column content can ever push a horizontal scrollbar. Column
			// proportions come from th widths; unwrapped cells clamp instead.
			table: { borderCollapse: "collapse", width: "100%", tableLayout: "fixed" },
			th: { padding: "6px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "left", fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: TERTIARY, whiteSpace: "nowrap" },
			td: { padding: "9px 8px", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top", textAlign: "left" },
			// Hyphenated names wrap at hyphens naturally; nowrap would turn a
			// long server name into a hard floor under fixed-layout columns.
			tdName: { fontWeight: 600 },
			// Wraps by design; anywhere lets long staged paths break rather
			// than floor their column's width.
			tdDesc: { lineHeight: 1.5, overflowWrap: "anywhere" },
			tdActions: { whiteSpace: "nowrap", textAlign: "right" },
			// Wrap long commands/URLs instead of widening the table: an
			// unbreakable cell sets the table's min-content width, which is
			// what forced the horizontal scrollbar before.
			tdMono: { fontFamily: MONO, fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" },
			input: { width: "100%", boxSizing: "border-box", padding: "6px 10px", background: "transparent", color: "inherit", border: `1px solid ${BORDER}`, borderRadius: "8px", font: "inherit", fontSize: "13px", transition: "border-color .15s, box-shadow .15s" },
			pre: { margin: 0, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", background: "var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.05))", fontFamily: MONO, fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "320px", overflowY: "auto" },
			row: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" },
			field: { display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 150px", minWidth: "130px" },
			label: { fontSize: "12px", color: TERTIARY },
			btn: { appearance: "none", font: "inherit", fontSize: "13px", lineHeight: 1.4, cursor: "pointer", border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "5px 12px", background: "none", color: SECONDARY },
			btnDanger: { appearance: "none", font: "inherit", fontSize: "13px", lineHeight: 1.4, cursor: "pointer", border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "5px 12px", background: "none", color: RED },
			btnSm: { padding: "3px 10px", fontSize: "12px" },
			checkRow: { display: "inline-flex", alignItems: "center", gap: "6px", paddingBottom: "6px", fontSize: "12px", color: TERTIARY, cursor: "pointer", flex: "none" },
			dim: { opacity: 0.45 },
			muted: { color: TERTIARY },
			pillText: { display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
			dot: (tone, hollow) => ({ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: hollow ? "transparent" : tone, border: hollow ? `1.5px solid ${tone}` : "none" }),
			empty: { margin: "14px 0", color: TERTIARY, textAlign: "center" },
			footer: { borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "14px 0 4px" },
			statusSpan: { marginRight: "auto", fontSize: "12px", color: TERTIARY },
			saveMin: { minWidth: "80px", textAlign: "center" },
		};
		// Primary (filled) button, matching the card footer pair modsearch
		// renders; built per use since it carries no per-instance state.
		const primaryStyle = (off) => ({
			appearance: "none", font: "inherit", fontSize: "13px", lineHeight: 1.4,
			cursor: off ? "default" : "pointer", border: "1px solid transparent",
			borderRadius: "8px", padding: "6px 16px",
			background: "var(--dsw-alias-label-primary, currentColor)",
			color: "var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.05))",
			opacity: off ? 0.4 : 1,
		});

		function field(labelText, control, required) {
			return e("label", { key: labelText, style: css.field },
				e("span", { style: css.label }, labelText, required ? e("span", { style: { color: RED } }, " *") : null),
				control);
		}

		// Rotating chevron from modsearch's header row.
		function chevron(open) {
			return e(
				"svg",
				{
					width: 16,
					height: 16,
					viewBox: "0 0 16 16",
					style: { color: TERTIARY, flex: "none", transition: "transform .16s", transform: open ? "rotate(180deg)" : "none" },
				},
				e("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }),
			);
		}

		// Row-action buttons wrap onto a second line instead of overflowing
		// (and being clipped by .dshx-body) when their fixed-layout column is
		// narrower than two buttons. Wide gap: actions sit next to destructive
		// ones, so a mis-click is expensive.
		const rowActions = (...btns) =>
			e("div", { style: { display: "flex", gap: "14px", justifyContent: "flex-end", flexWrap: "wrap" } }, btns);

		// Collapsible section head: the card shell's chevron affordance one
		// level down. The count stays readable while folded, so a collapsed
		// section still summarizes its contents.
		const sectionHead = (title, count, isOpen, toggle) =>
			e("button", {
				type: "button",
				className: "dshx-btn",
				"aria-expanded": isOpen,
				onClick: toggle,
				style: {
					appearance: "none", background: "none", border: 0, font: "inherit", color: "inherit",
					cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0, padding: "2px 0",
					display: "flex", alignItems: "center", gap: "8px",
				},
			},
				e("span", { style: css.h }, title),
				count ? e("span", { style: css.chip }, count) : null,
				chevron(isOpen));

		// Live-filter box for section head rows: purely a VIEW filter, it
		// never enters the staged draft. While active the section count
		// renders as shown/total.
		const searchBox = (value, onInput, label) =>
			inputEl({
				value,
				placeholder: label || "Search…",
				"aria-label": label || "Search",
				onChange: (ev) => onInput(ev.target.value),
				style: Object.assign({}, css.input, { width: "170px", flex: "none", padding: "4px 10px", fontSize: "12px" }),
			});

		// ── Section contract (see header comment) ─────────────────────────
		const DRAFT_SHAPES = [];
		const DIRTY_CHECKS = [];
		const SAVE_STEPS = [];
		const SECTIONS = [];

		// Theme registry: base entry + whatever themes/*.js push. The stored
		// choice is plain localStorage — a pure visual preference needs no
		// restart or host round-trip.
		const THEME_KEY = "dshx.theme";
		const THEMES = [{ id: "default", name: "Default" }];
		function readStoredTheme() {
			try {
				// No stored choice (fresh install) → the plugin's own default,
				// ENHANCED. An explicit "default" pick still reads back as such.
				// The matrix theme was renamed to ENHANCED; honor old stored picks.
				const v = localStorage.getItem(THEME_KEY);
				if (!v) return "enhanced";
				return v === "matrix" ? "enhanced" : v;
			} catch {
				return "enhanced";
			}
		}

		// The package-private channel every GUI surface shares: the card's
		// staged draft AND the sidebar instance icons speak this envelope.
		async function rpcCall(ctx, payload) {
			const conn = ctx.get("connection");
			if (!conn || !conn.rpc) throw new Error("connection service unavailable");
			const res = await conn.rpc.call("/dsh-enhanced", "manage", payload);
			if (!res || res.ok !== true) throw new Error((res && res.error && res.error.message) || "request failed");
			const value = res.value || {};
			// Action-core rejections ride INSIDE the envelope as {error}; a
			// rejected op must throw, not masquerade as "Saved."
			if (value && typeof value === "object" && value.error) throw new Error(value.error);
			return value;
		}

		function Manager(ctx) {
			const call = async (payload) => rpcCall(ctx, payload);

			return function ManagerComponent() {
				const [open, setOpen] = React.useState(false);
				const [summary, setSummary] = React.useState(null);
				const [loaded, setLoaded] = React.useState(false);
				const [error, setError] = React.useState(null);
				const [note, setNote] = React.useState("");
				const [busy, setBusy] = React.useState(false);
				const [draft, setDraft] = React.useState(() => EMPTY_DRAFT());
				const [states, setStates] = React.useState({});
				// Bumped after a successful save AND on Discard: sections watch
				// it to drop their local transient state (editors, forms).
				const [epoch, setEpoch] = React.useState(0);

				const skills = (summary && summary.skills) || [];
				const mcps = (summary && summary.mcps) || [];
				const dirty = DIRTY_CHECKS.some((fn) => fn(draft));

				/** Stage one change; every mutator funnels through here. */
				const patch = (next) => {
					setDraft(next);
					setError(null);
					setNote("");
				};

				// Lazy load, like modsearch: nothing is fetched until the user
				// expands the card. Sections fetch their own extra data.
				const reload = React.useCallback(async () => {
					try {
						const [s, m, st] = await Promise.all([
							call({ action: "list_skills" }),
							call({ action: "list_mcps" }),
							call({ action: "mcp_status" }).catch(() => ({ servers: [] })),
						]);
						setSummary({ skills: s.skills || [], mcps: m.mcps || [] });
						setStates(Object.fromEntries((st.servers || []).map((x) => [`${x.profile}/${x.serverName}`, x.state])));
						setError(null);
						setLoaded(true);
					} catch (err) {
						setError(String((err && err.message) || err));
					}
				}, []);

				React.useEffect(() => {
					if (open && !loaded) reload();
				}, [open, loaded, reload]);

				// Replay the batch through the same actions the tool uses. Steps
				// consume `remaining` (a JSON clone of the draft), dropping each
				// key only once its call answered, so a failure mid-batch keeps
				// exactly the unapplied part staged.
				const save = async () => {
					setBusy(true);
					setError(null);
					// ponytail: JSON round-trip clone — every draft value is
					// plain JSON (strings/numbers/arrays), incl. base64 uploads.
					const remaining = JSON.parse(JSON.stringify(draft));
					try {
						for (const step of SAVE_STEPS) await step(call, remaining);
						await reload();
						setDraft(EMPTY_DRAFT());
						setEpoch((n) => n + 1);
						setNote("Saved.");
					} catch (err) {
						setDraft(remaining);
						setError(String((err && err.message) || err));
					} finally {
						setBusy(false);
					}
				};

				const discard = () => {
					setDraft(EMPTY_DRAFT());
					setEpoch((n) => n + 1);
					setError(null);
					setNote("");
				};

				const off = busy || !dirty;

				const body = e("div", { className: "dshx-body", style: css.wrap },
					error ? e("p", { role: "alert", style: css.err }, error) : null,
					SECTIONS.map((Section, i) =>
						e(Section, {
							key: i,
							open,
							loaded,
							busy,
							draft,
							patch,
							call,
							skills,
							mcps,
							states,
							epoch,
							reload,
							error,
							setError,
						})),

					// Footer pair from modsearch's card: status note on the left,
					// Discard ghost + Save primary on the right, dead until the
					// draft differs from what was loaded.
					e("div", { style: css.footer },
						// Idle status doubles as the staged-model hint, so the
						// Save/Discard pair never appears unexplained.
						e("span", { role: "status", style: css.statusSpan }, busy ? "saving..." : note || (!off ? "Changes apply on Save." : "")),
						e("button", { type: "button", className: "dshx-btn", disabled: off, onClick: discard, style: Object.assign({}, css.btn, { padding: "6px 16px" }) }, "Discard"),
						e("button", { type: "button", className: "dshx-primary", disabled: off, onClick: save, style: Object.assign({}, primaryStyle(off), css.saveMin) }, "Save"),
					),
				);

				// Collapsible shell, value for value from modsearch's card: l2
				// border, layer backgrounds, 12px radius, header button with
				// aria-expanded, body inset 16px.
				return e(
					"div",
					{
						style: {
							border: `1px solid ${BORDER}`,
							background: open ? "var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))" : "var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.05))",
							borderRadius: "12px",
							transition: "border-color .16s, background .16s",
						},
					},
					e("style", null, CSS_TEXT),
					e(
						"button",
						{
							type: "button",
							"aria-expanded": open,
							onClick: () => setOpen(!open),
							style: {
								appearance: "none", width: "100%", font: "inherit", color: "inherit", textAlign: "left",
								cursor: "pointer", background: "none", border: 0, borderRadius: "12px",
								display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px",
							},
						},
						e("div", { style: { flex: 1, minWidth: 0 } },
							e("div", { style: { fontSize: "14px", fontWeight: 600 } }, "ENHANCED"),
							e("div", { style: { color: TERTIARY, fontSize: "13px", lineHeight: 1.5 } },
								"Skills · MCP servers · auto-compact · themes · restart/shutdown live in the sidebar foot"),
						),
						chevron(open),
					),
					open ? e("div", { style: { margin: "0 16px", paddingBottom: "8px" } }, body) : null,
				);
			};
		}

		// Assembled AFTER all sections registered (main.js calls it), but
		// defined here so main.js stays tiny.
		function EMPTY_DRAFT() {
			return Object.assign({}, ...DRAFT_SHAPES.map((shape) => shape()));
		}


// ════════════════════ client/sections/skills.js ════════════════════

// Skill manager section: managed catalog table, editor, folder installs.
// Draft slice: rmSkills[], edits{}, installs[], installPath, overwrite.
DRAFT_SHAPES.push(() => ({ rmSkills: [], edits: {}, installs: [], installPath: "", overwrite: false }));
DIRTY_CHECKS.push((d) => !!(d.rmSkills.length || Object.keys(d.edits).length || d.installs.length || d.installPath.trim()));

// Save step (steps consume `remaining`, so identity bookkeeping survives):
// removals, edits, then installs — a typed path rides ahead of picker picks.
SAVE_STEPS.push(async (call, rem) => {
	for (const name of rem.rmSkills) {
		await call({ action: "remove_skill", skillName: name });
		rem.rmSkills = rem.rmSkills.filter((n) => n !== name);
	}
	for (const entry of Object.entries(rem.edits)) {
		await call({ action: "edit_skill", skillName: entry[0], description: entry[1].description || undefined, skillBody: entry[1].body });
		delete rem.edits[entry[0]];
	}
	const typedPath = String(rem.installPath || "").trim();
	const installs = typedPath ? [{ path: typedPath }].concat(rem.installs) : rem.installs;
	for (const it of installs) {
		await call(Object.assign(
			it.files
				? { action: "install_skill_files", skillName: it.name, files: it.files }
				: { action: "install_skill", sourcePath: it.path },
			it.overwrite || rem.overwrite ? { overwrite: true } : {},
		));
		if (typedPath && it.path === typedPath) rem.installPath = "";
		else rem.installs = rem.installs.filter((x) => x !== it);
	}
});

function SkillsSection(p) {
	const [openSec, setOpenSec] = React.useState(true);
	const [editing, setEditing] = React.useState(null);
	const [editDesc, setEditDesc] = React.useState("");
	const [editBody, setEditBody] = React.useState("");
	const [bodies, setBodies] = React.useState({});
	const [descOpen, setDescOpen] = React.useState({});
	const pickRef = React.useRef(null);
	// Live view filter — never staged, never saved.
	const [query, setQuery] = React.useState("");

	// Drop transient editor state after a save or Discard (epoch bump).
	React.useEffect(() => {
		setEditing(null);
		setEditDesc("");
		setEditBody("");
		setBodies({});
	}, [p.epoch]);

	const { draft } = p;

	const toggleSkillRemove = (name) =>
		p.patch(
			Object.assign({}, draft, {
				rmSkills: draft.rmSkills.indexOf(name) >= 0
					? draft.rmSkills.filter((n) => n !== name)
					: draft.rmSkills.concat([name]),
			}),
		);

	// Edit/hide one skill's description and markdown body. Content is
	// fetched once (read_skill answers for every catalog skill) and cached;
	// keystrokes stage into the draft like every other op, and the footer
	// Save commits them via edit_skill. External (non-managed) skills stay
	// read-only: writing one would shadow a foreign catalog entry with a
	// managed file.
	const openEditor = async (s) => {
		if (editing === s.name) {
			setEditing(null);
			return;
		}
		setEditing(s.name);
		p.setError(null);
		setEditDesc((draft.edits[s.name] && draft.edits[s.name].description) ?? s.description ?? "");
		if (bodies[s.name] == null) {
			try {
				const r = await p.call({ action: "read_skill", skillName: s.name });
				setBodies(Object.assign({}, bodies, { [s.name]: r.content == null ? "" : String(r.content) }));
			} catch (err) {
				p.setError(String((err && err.message) || err));
				setEditing(null);
			}
		}
	};

	// The body arrives async (or is already cached): fill it once it is
	// known, preferring text already staged for this skill.
	React.useEffect(() => {
		if (editing && bodies[editing] != null) {
			setEditBody(draft.edits[editing] ? draft.edits[editing].body : String(bodies[editing]));
		}
	}, [editing, bodies]);

	const stageEdit = (description, body) =>
		p.patch(Object.assign({}, draft, {
			edits: Object.assign({}, draft.edits, { [editing]: { description, body } }),
		}));

	// Folder picked through the native dialog: browsers hide absolute paths,
	// so read every file and upload contents; the host writes them under
	// skills/<top-folder>/ after the same validation.
	const onPickFiles = async (ev) => {
		const picked = Array.from(ev.target.files || []);
		ev.target.value = ""; // allow re-picking the same folder later
		if (!picked.length) return;
		try {
			const top = String(picked[0].webkitRelativePath || picked[0].name).split("/")[0];
			const files = [];
			for (const f of picked) {
				if (f.name.startsWith(".")) continue; // .DS_Store & friends
				const data = await new Promise((res, rej) => {
					const r = new FileReader();
					r.onload = () => res(String(r.result).split(",")[1] || "");
					r.onerror = () => rej(r.error);
					r.readAsDataURL(f);
				});
				files.push({ path: f.webkitRelativePath || f.name, data });
			}
			if (!files.some((f) => /(^|\/)SKILL\.md$/.test(f.path))) throw new Error("The chosen folder has no SKILL.md.");
			p.patch(Object.assign({}, draft, { installs: draft.installs.concat([{ name: top, files }]) }));
		} catch (err) {
			p.setError(String((err && err.message) || err));
		}
	};

	const skills = p.skills;
	// Filter matches name or description; staged installs match name/path.
	// Pairs keep ORIGINAL draft indices so Drop still un-stages correctly
	// while filtered.
	const ql = query.trim().toLowerCase();
	const matchQ = (...parts) => !ql || parts.some((x) => String(x || "").toLowerCase().includes(ql));
	const visibleSkills = ql ? skills.filter((s) => matchQ(s.name, s.description)) : skills;
	const visibleInstalls = draft.installs.map((it, i) => ({ it, i })).filter(({ it }) => matchQ(it.files ? it.name : it.path));
	const totalCount = skills.length + draft.installs.length;
	const shownCount = visibleSkills.length + visibleInstalls.length;
	const countText = p.open && p.loaded ? (ql ? `${shownCount}/${totalCount}` : String(totalCount)) : null;

	const skillRows = visibleSkills.flatMap((s) => {
		const removing = draft.rmSkills.indexOf(s.name) >= 0;
		const row = e("tr", { key: s.name, "data-dim": removing ? "1" : null },
			e("td", { style: Object.assign({}, css.td, css.tdName) }, s.name),
			e("td", { style: css.td },
				s.description
					? e("div", {
							onClick: () => setDescOpen(Object.assign({}, descOpen, { [s.name]: !descOpen[s.name] })),
							title: descOpen[s.name] ? "Click to collapse" : "Click to expand",
							style: Object.assign(
								{ cursor: "pointer", overflowWrap: "anywhere" },
								descOpen[s.name] ? null : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: "2", overflow: "hidden" },
							),
						}, s.description)
					: e("span", { style: css.muted }, "—")),
			e("td", { style: css.td },
				s.managedFile
					? e("span", { title: s.managedFile, style: css.chip }, "managed")
					: e("span", { style: css.chip }, s.provider || "external"),
				draft.edits[s.name] ? e("span", { style: css.muted }, "  · edited") : null),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				rowActions(
					e("button", { className: "dshx-btn", style: Object.assign({}, css.btn, css.btnSm), disabled: p.busy, onClick: () => openEditor(s) }, editing === s.name ? "Hide" : s.managedFile ? "Edit" : "View"),
					s.managedFile
						? e("button", {
								className: "dshx-btn dshx-danger",
								style: Object.assign({}, removing ? css.btn : css.btnDanger, css.btnSm),
								disabled: p.busy,
								onClick: () => toggleSkillRemove(s.name),
							}, removing ? "Keep" : "Remove")
						: null,
				)),
		);
		let openRow = null;
		if (editing === s.name) {
			openRow = e("tr", { key: `${s.name}:edit` },
				e("td", { style: css.td, colSpan: 4 },
					s.managedFile
						? e("div", { style: { display: "flex", flexDirection: "column", gap: "10px", padding: "2px 0 8px" } },
								field("Description", inputEl({ value: editDesc, onChange: (ev) => { setEditDesc(ev.target.value); stageEdit(ev.target.value, editBody); } })),
								field("Body", e("textarea", { className: "dshx-input", style: Object.assign({}, css.input), rows: 12, value: editBody, onChange: (ev) => { setEditBody(ev.target.value); stageEdit(editDesc, ev.target.value); } })))
						: e("pre", { style: css.pre }, bodies[s.name] == null ? "loading..." : bodies[s.name])));
		}
		return openRow ? [row, openRow] : [row];
	});

	// Staged folder installs: the catalog name is only known after the host
	// parses SKILL.md at save time, so show the path — or, for picker uploads,
	// the top folder name and file count.
	const pendingInstallRows = visibleInstalls.map(({ it, i }) =>
		e("tr", { key: `inst:${i}` },
			e("td", { style: Object.assign({}, css.td, css.tdName) }, it.files ? it.name : it.path.split("/").filter(Boolean).pop() || it.path),
			e("td", { style: Object.assign({}, css.td, css.tdDesc), title: it.files ? undefined : it.path },
				e("span", { style: css.muted }, it.files ? `${it.files.length} file${it.files.length === 1 ? "" : "s"} via folder picker` : it.path)),
			e("td", { style: css.td }, e("span", { style: css.chip }, "unsaved")),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				rowActions(
					e("button", {
						className: "dshx-btn",
						style: Object.assign({}, css.btn, css.btnSm),
						disabled: p.busy,
						onClick: () => p.patch(Object.assign({}, draft, { installs: draft.installs.filter((_, j) => j !== i) })),
					}, "Drop"),
				)),
		));

	return [
		e("div", { key: "sk-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Skills", countText, openSec, () => setOpenSec(!openSec)),
			p.open && p.loaded && totalCount > 0 ? searchBox(query, setQuery, "Search skills") : null),
		openSec ? [
			e("p", { key: "sk-note", style: css.note }, "Folder bundles with a SKILL.md · hot-reloads · * = required"),
			e("div", { key: "sk-table", style: css.tableWrap },
				e("table", { style: css.table },
					e("thead", null, e("tr", null,
						e("th", { style: Object.assign({}, css.th, { width: "22%" }) }, "Name"), e("th", { style: css.th }, "Description"),
						e("th", { style: Object.assign({}, css.th, { width: "18%" }) }, "Source"), e("th", { style: Object.assign({}, css.th, { width: "18%" }) }))),
					e("tbody", { className: "dshx-tbody" }, skillRows.concat(pendingInstallRows)))),
			p.open && !p.loaded && !p.error ? e("p", { key: "sk-load", style: css.empty }, "loading...") : null,
			p.open && p.loaded && skills.length === 0 && draft.installs.length === 0 ? e("p", { key: "sk-empty", style: css.empty }, "No skills yet — install one below.") : null,
			ql && shownCount === 0 ? e("p", { key: "sk-nomatch", style: css.empty }, `No skills matching “${query.trim()}”.`) : null,
			e("div", { key: "sk-add", style: css.row },
				field("Install from folder", inputEl({ value: draft.installPath, placeholder: "/absolute/path/to/skill-folder — or Browse…", onChange: (ev) => p.patch(Object.assign({}, draft, { installPath: ev.target.value })) }), true),
				e("button", { className: "dshx-btn", style: css.btn, disabled: p.busy, onClick: () => pickRef.current && pickRef.current.click() }, "Browse…"),
				e("input", { ref: pickRef, type: "file", style: { display: "none" }, webkitdirectory: "", multiple: true, onChange: onPickFiles }),
				e("label", { style: css.checkRow },
					e("input", { className: "dshx-check", type: "checkbox", checked: !!draft.overwrite, onChange: (ev) => p.patch(Object.assign({}, draft, { overwrite: ev.target.checked })) }),
					"Replace existing")),
		] : null,
	];
}

SECTIONS.push(SkillsSection);


// ════════════════════ client/sections/mcp.js ════════════════════

// MCP manager section: per-profile server table with live state pills,
// enable/disable/remove staging, and the add-server form.
// Draft slice: mcpOps{} ("profile/server" -> "enable"|"disable"|"remove"),
// addMcps[].
DRAFT_SHAPES.push(() => ({ mcpOps: {}, addMcps: [] }));
DIRTY_CHECKS.push((d) => !!(Object.keys(d.mcpOps).length || d.addMcps.length));

SAVE_STEPS.push(async (call, rem) => {
	for (const entry of Object.entries(rem.mcpOps)) {
		const slash = entry[0].indexOf("/");
		await call({
			action: entry[1] === "remove" ? "remove_mcp" : entry[1],
			mcpName: entry[0].slice(slash + 1),
			profiles: [entry[0].slice(0, slash)],
		});
		delete rem.mcpOps[entry[0]];
	}
	for (const m of rem.addMcps) {
		await call(Object.assign(
			{ action: "add_mcp", mcpName: m.name, mcpConfig: m.url ? { url: m.url } : { command: m.command, args: m.args } },
			m.profiles ? { profiles: m.profiles } : {},
		));
		rem.addMcps = rem.addMcps.filter((x) => x !== m);
	}
});

const EMPTY_MF = () => ({ name: "", command: "", args: "", url: "", profiles: "" });
const MCP_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

function McpSection(p) {
	const [openMcp, setOpenMcp] = React.useState(true);
	const [mf, setMf] = React.useState(EMPTY_MF);
	const [profFilter, setProfFilter] = React.useState("all");
	// Live view filter — never staged, never saved.
	const [query, setQuery] = React.useState("");

	// Drop the add-form after a save or Discard (epoch bump).
	React.useEffect(() => {
		setMf(EMPTY_MF());
	}, [p.epoch]);

	const { draft } = p;

	/** Controlled-input binding: bm("name") → {value, onChange}. */
	const bind = (state, set) => (key, extra) =>
		Object.assign({ value: state[key], onChange: (ev) => set(Object.assign({}, state, { [key]: ev.target.value })) }, extra);
	const bm = bind(mf, setMf);

	// One staged op per profile+server: "enable" | "disable" | "remove".
	// Clicking the active control again reverts.
	const toggleMcpOp = (profile, serverName, op) => {
		const key = `${profile}/${serverName}`;
		const ops = Object.assign({}, draft.mcpOps);
		if (ops[key] === op) delete ops[key];
		else ops[key] = op;
		p.patch(Object.assign({}, draft, { mcpOps: ops }));
	};

	const stageMcp = () => {
		const name = mf.name.trim();
		const url = mf.url.trim();
		if (!name || (!url && !mf.command.trim())) return p.setError("An MCP server needs a name and a URL or a command.");
		if (!MCP_NAME_RE.test(name)) return p.setError("Server name must be 1–32 chars of letters, digits, “-” or “_”.");
		// One arg per line preserves spaces in paths ("Application
		// Support"); a single inline line still splits on spaces so
		// the old "-y pkg" habit keeps working.
		const lines = mf.args.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
		const args = lines.length > 1 ? lines : lines[0] ? lines[0].split(/\s+/).filter(Boolean) : [];
		// Optional per-add profile pick: comma-separated, empty = all.
		const profiles = mf.profiles.split(",").map((s) => s.trim()).filter(Boolean);
		p.patch(Object.assign({}, draft, {
			addMcps: draft.addMcps.concat([Object.assign({ name, url, command: url ? "" : mf.command.trim(), args }, profiles.length ? { profiles } : {})]),
		}));
		setMf(EMPTY_MF());
	};

	const mcps = p.mcps;
	const urlBad = mf.url.trim() && !/^https?:\/\//i.test(mf.url.trim());
	const knownProfiles = Array.from(new Set(mcps.map((m) => m.profile)));
	const typedProfiles = mf.profiles.split(",").map((s) => s.trim()).filter(Boolean);
	const profilesBad = knownProfiles.length > 0 && typedProfiles.length > 0 && typedProfiles.some((pr) => !knownProfiles.includes(pr));
	const mcpOpLabel = { enable: "will enable", disable: "will disable", remove: "will remove" };
	// Effective MCP state = loaded state overridden by the staged op.
	const effectiveDisabled = (m) => {
		const op = draft.mcpOps[`${m.profile}/${m.serverName}`];
		return op ? op === "disable" : !!m.disabled;
	};

	// View filters: profile picker narrows rows, search box narrows by
	// name/profile/target; staged adds match name/profiles/command/url.
	// Pending pairs keep ORIGINAL addMcps indices so Drop still un-stages
	// the right entry while filtered.
	const ql = query.trim().toLowerCase();
	const matchQ = (...parts) => !ql || parts.some((x) => String(x || "").toLowerCase().includes(ql));
	const inProfile = profFilter === "all" ? mcps : mcps.filter((m) => m.profile === profFilter);
	const visibleMcps = ql
		? inProfile.filter((m) => matchQ(m.serverName, m.profile, m.url, [m.command].concat(m.args || []).join(" ")))
		: inProfile;
	const visiblePending = draft.addMcps.map((m, i) => ({ m, i })).filter(({ m }) => matchQ(m.name, m.url, m.command, (m.profiles || []).join(",")));
	const totalCount = mcps.length + draft.addMcps.length;
	const shownCount = visibleMcps.length + visiblePending.length;
	const countText = p.open && p.loaded ? (ql ? `${shownCount}/${totalCount}` : String(totalCount)) : null;
	// Live state pill: a drawn dot (no unicode glyphs), green when
	// the server's tools are registered in this process, hollow
	// otherwise.
	const livePill = (state) => {
		const map = {
			running: [GREEN, "running", false],
			connecting: [TERTIARY, "connecting", false],
			disabled: [TERTIARY, "off", true],
			"not loaded": [TERTIARY, "not loaded", true],
		};
		const tone = map[state] || [TERTIARY, "?", true];
		return e("span", { title: "live status of this server inside this GUI's process", style: css.pillText },
			e("span", { style: css.dot(tone[0], tone[2]) }),
			tone[1]);
	};
	const mcpRows = visibleMcps.map((m, i) => {
		const op = draft.mcpOps[`${m.profile}/${m.serverName}`];
		const live = p.states[`${m.profile}/${m.serverName}`] || "not loaded";
		return e("tr", { key: `${m.profile}/${m.serverName}/${i}`, "data-dim": op ? "1" : null },
			e("td", { style: Object.assign({}, css.td, css.tdName) }, m.serverName),
			e("td", { style: css.td }, m.profile),
			e("td", { style: Object.assign({}, css.td, css.tdMono), title: m.url || [m.command].concat(m.args || []).join(" ") },
				e("div", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
					m.url || [m.command].concat(m.args || []).join(" "))),
			e("td", { style: css.td },
				livePill(live),
				e("span", { style: css.muted }, "  ·  "),
				// A staged hint implies the current direction
				// ("(will disable)" ⇒ enabled now), so the base
				// word drops and the cell stays one fragment.
				op
					? e("span", { style: css.muted }, `(${mcpOpLabel[op]})`)
					: m.disabled ? e("span", { style: css.muted }, "disabled") : "enabled"),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				rowActions(
					op !== "remove"
						? e("button", { className: "dshx-btn", style: Object.assign({}, css.btn, css.btnSm), disabled: p.busy, onClick: () => toggleMcpOp(m.profile, m.serverName, effectiveDisabled(m) ? "enable" : "disable") },
								effectiveDisabled(m) ? "Enable" : "Disable")
						: null,
					e("button", {
						className: op === "remove" ? "dshx-btn" : "dshx-btn dshx-danger",
						style: Object.assign({}, op === "remove" ? css.btn : css.btnDanger, css.btnSm),
						disabled: p.busy,
						onClick: () => toggleMcpOp(m.profile, m.serverName, "remove"),
					}, op === "remove" ? "Keep" : "Remove"),
				)),
		);
	});

	const pendingMcpRows = visiblePending.map(({ m, i }) =>
		e("tr", { key: `new:${m.name}:${i}` },
			e("td", { style: Object.assign({}, css.td, css.tdName) }, m.name),
			e("td", { style: css.td }, e("span", { style: css.muted }, "—")),
			e("td", { style: Object.assign({}, css.td, css.tdMono), title: m.url || [m.command].concat(m.args || []).join(" ") },
				e("div", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
					m.url || [m.command].concat(m.args || []).join(" "))),
			e("td", { style: css.td }, e("span", { style: css.chip }, "unsaved")),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				rowActions(
					e("button", {
						className: "dshx-btn",
						style: Object.assign({}, css.btn, css.btnSm),
						disabled: p.busy,
						onClick: () => p.patch(Object.assign({}, draft, { addMcps: draft.addMcps.filter((_, j) => j !== i) })),
					}, "Drop"),
				)),
		));

	const profSelect = e("select", { className: "dshx-input", style: Object.assign({}, css.input, { width: "auto" }), value: profFilter, onChange: (ev) => setProfFilter(ev.target.value) },
		e("option", { value: "all" }, "All profiles"),
		Array.from(new Set(mcps.map((m) => m.profile))).map((prof) => e("option", { key: prof, value: prof }, prof)));

	return [
		e("div", { key: "mc-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("MCP servers", countText, openMcp, () => setOpenMcp(!openMcp)),
			mcps.length > 0 ? e("label", { style: Object.assign({}, css.checkRow, { paddingBottom: 0 }) }, "Profile:", profSelect) : null,
			p.open && p.loaded && totalCount > 0 ? searchBox(query, setQuery, "Search servers") : null),
		openMcp ? [
			e("p", { key: "mc-note", style: css.note }, "Per-profile cordis.patch.yml · restart profile to connect · * = name + command or URL"),
			e("div", { key: "mc-table", style: css.tableWrap },
				e("table", { style: css.table },
					e("thead", null, e("tr", null,
						e("th", { style: Object.assign({}, css.th, { width: "16%" }) }, "Server"), e("th", { style: Object.assign({}, css.th, { width: "11%" }) }, "Profile"),
						e("th", { style: css.th }, "Target"), e("th", { style: Object.assign({}, css.th, { width: "18%" }) }, "State"), e("th", { style: Object.assign({}, css.th, { width: "20%" }) }))),
					e("tbody", { className: "dshx-tbody" }, mcpRows.concat(pendingMcpRows)))),
			p.open && !p.loaded && !p.error ? e("p", { key: "mc-load", style: css.empty }, "loading...") : null,
			p.open && p.loaded && mcps.length === 0 && draft.addMcps.length === 0 ? e("p", { key: "mc-empty", style: css.empty }, "No MCP servers configured — add one below.") : null,
			profFilter !== "all" && mcps.length > 0 && visibleMcps.length === 0 ? e("p", { key: "mc-filt", style: css.muted }, "No MCP servers in this profile.") : null,
			ql && shownCount === 0 ? e("p", { key: "mc-nomatch", style: css.empty }, `No servers matching “${query.trim()}”.`) : null,
			e("div", { key: "mc-add1", style: css.row },
				field("Server name", inputEl(bm("name", { placeholder: "my-server" })), true),
				field("Command", inputEl(bm("command", { placeholder: "npx" }))),
				field("URL (instead of command)", inputEl(bm("url", { placeholder: "https://host/mcp" })))),
			e("p", { key: "mc-name-note", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
				"Name: letters, digits, “-” or “_”, 1–32 chars."),
			urlBad ? e("p", { key: "mc-url-bad", style: { color: "#e05252", fontSize: 12, flex: "1 1 100%", margin: "2px 0 0" } },
				"URL should start with http:// or https:// — it will still be saved.") : null,
			e("div", { key: "mc-add2", style: css.row },
				field("Args (one per line)", e("textarea", Object.assign({ className: "dshx-input", style: Object.assign({}, css.input), rows: 3, placeholder: "-y some-server" }, bm("args")))),
				field("Profiles (optional)", inputEl(bm("profiles", { placeholder: "default, web (blank = all)", list: "mcp-profiles-list" }))),
				e("button", { className: "dshx-btn", style: css.btn, disabled: p.busy, onClick: stageMcp }, "Add server")),
			profilesBad ? e("p", { key: "mc-prof-bad", style: { color: "#e05252", fontSize: 12, flex: "1 1 100%", margin: "2px 0 0" } },
				`Unknown profile — pick a configured one${knownProfiles.length ? ` (e.g. ${knownProfiles.join(", ")})` : ""}. It will still be saved.`) : null,
			e("datalist", { key: "mc-profiles", id: "mcp-profiles-list" }, knownProfiles.map((pr) => e("option", { key: pr, value: pr }))),
		] : null,
	];
}

SECTIONS.push(McpSection);


// ════════════════════ client/sections/compact.js ════════════════════

// Auto-compact section: one slider bound to host-reported safe limits.
// Draft slice: compactRatio (number | undefined). Staging follows the same
// draft model — the slider only moves the draft; footer Save commits via
// set_compact. The threshold value itself is fetched here, on expand, so this
// section owns its data like every other module.
DRAFT_SHAPES.push(() => ({ compactRatio: undefined }));
DIRTY_CHECKS.push((d) => d.compactRatio != null);

SAVE_STEPS.push(async (call, rem) => {
	if (rem.compactRatio != null) {
		await call({ action: "set_compact", thresholdRatio: rem.compactRatio });
		rem.compactRatio = undefined;
	}
});

function CompactSection(p) {
	const [openSec, setOpenSec] = React.useState(true);
	// Host info {ratio, overridden, min, max}: undefined = not fetched yet,
	// null = old host half without the action (section explains itself).
	const [info, setInfo] = React.useState(undefined);

	React.useEffect(() => {
		if (!p.open || info !== undefined) return;
		let live = true;
		p.call({ action: "compact_status" })
			.then((v) => { if (live) setInfo(v); })
			.catch(() => { if (live) setInfo(null); });
		return () => { live = false; };
	}, [p.open]);

	const { draft } = p;
	const staged = draft.compactRatio != null;
	const pct = staged ? Math.round(draft.compactRatio * 100) : info ? Math.round(info.ratio * 100) : null;

	return [
		e("div", { key: "ac-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Auto-compact",
				p.open && info ? `${staged ? Math.round(draft.compactRatio * 100) : Math.round(info.ratio * 100)}%` : null,
				openSec, () => setOpenSec(!openSec)),
			staged ? e("span", { style: css.chip }, "unsaved") : null),
		openSec ? [
			e("p", { key: "ac-note", style: css.note },
				info
					? "Compaction starts when context use crosses this share of the window · " +
						`safe range ${Math.round(info.min * 100)}–${Math.round(info.max * 100)}%` +
						(!info.overridden ? " · currently the 80% harness default" : "") +
						" · restart profile to apply"
					: "Compaction tuning needs the updated host half — restart the app."),
			e("div", { key: "ac-row", style: Object.assign({}, css.row, { alignItems: "center" }) },
				e("label", { style: Object.assign({}, css.field, { flex: "1 1 220px", minWidth: "180px" }) },
					e("span", { style: css.label }, pct != null ? `Trigger at ${pct}%` : "Trigger"),
					info ? e("input", {
						type: "range",
						className: "dshx-check",
						min: Math.round(info.min * 100),
						max: Math.round(info.max * 100),
						step: 1,
						value: pct,
						disabled: p.busy,
						onChange: (ev) => p.patch(Object.assign({}, draft, { compactRatio: Number(ev.target.value) / 100 })),
						style: { width: "100%", accentColor: GREEN },
					}) : null),
				staged
					? e("button", {
							className: "dshx-btn",
							style: Object.assign({}, css.btn, css.btnSm),
							disabled: p.busy,
							onClick: () => p.patch(Object.assign({}, draft, { compactRatio: undefined })),
						}, "Revert")
					: null),
		] : null,
	];
}

SECTIONS.push(CompactSection);


// ════════════════════ client/sections/search.js ════════════════════

// Search section: manages Free Search's config (the `web-search-free` row) via
// the host half, and surfaces a thin `dsh_search` tool. Draft slice:
// searchConfig (object | undefined). Self-fetches on expand like compact_status;
// secrets are never echoed back, so key fields start blank ("unchanged").
// One API-key box is routed to whichever provider is selected (paid engines only).
DRAFT_SHAPES.push(() => ({ searchConfig: undefined }));
DIRTY_CHECKS.push((d) => d.searchConfig != null);

SAVE_STEPS.push(async (call, rem) => {
	if (rem.searchConfig) {
		await call(Object.assign({ action: "set_search" }, rem.searchConfig));
		rem.searchConfig = undefined;
	}
});

// engine id -> display + whether it needs a (paid) API key and which field holds it
const PROVIDER_META = {
	ddg: { label: "DuckDuckGo", free: true },
	"ddg-lite": { label: "DuckDuckGo Lite", free: true },
	bing: { label: "Bing", free: true },
	searxng: { label: "SearXNG", free: true },
	anysearch: { label: "AnySearch", free: true },
	exa: { label: "Exa", free: false, key: "exaApiKey", endpoint: "exaBaseUrl" },
	tavily: { label: "Tavily", free: false, key: "tavilyApiKey", endpoint: "tavilyBaseUrl" },
	keenable: { label: "Keenable", free: false, key: "keenableApiKey", endpoint: "keenableBaseUrl" },
	perplexity: { label: "Perplexity", free: false, key: "perplexityApiKey" },
	"deepseek-official": { label: "DeepSeek", free: false, key: "deepseekApiKey" },
};

// Suggested values so the user picks a valid code instead of guessing the format.
const REGION_HINTS = ["cn-zh", "us", "en", "gb", "de", "fr", "jp", "kr", "ru", "es", "br", "in", "au", "ca"];
const MARKET_HINTS = ["zh-CN", "en-US", "en-GB", "de-DE", "fr-FR", "ja-JP", "ko-KR", "ru-RU", "es-ES", "pt-BR", "it-IT", "hi-IN", "zh-TW"];

const normRegion = (v) => String(v || "").trim().toLowerCase();
const normMarket = (v) => {
	const t = String(v || "").trim();
	const m = t.match(/^([a-zA-Z]{2})[-_ ]?([a-zA-Z]{2})$/);
	return m ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : t;
};
const marketValid = (v) => /^[a-zA-Z]{2}-[a-zA-Z]{2}$/.test(String(v || "").trim());

function SearchSection(p) {
	const [openSec, setOpenSec] = React.useState(true);
	const [info, setInfo] = React.useState(undefined);
	const [form, setForm] = React.useState(null);

	React.useEffect(() => {
		if (!p.open || info !== undefined) return;
		let live = true;
		p.call({ action: "list_search" })
			.then((v) => {
				if (!live) return;
				setInfo(v);
				setForm({
					provider: v.provider || "bing",
					region: v.region || "",
					bingMarket: v.bingMarket || "zh-CN",
					searxngInstances: v.searxngInstances || "",
					tavilyBaseUrl: v.tavilyBaseUrl || "",
					exaBaseUrl: v.exaBaseUrl || "",
					keenableBaseUrl: v.keenableBaseUrl || "",
					excludedEngines: Array.isArray(v.excludedEngines) ? v.excludedEngines : [],
					exaApiKey: "",
					tavilyApiKey: "",
					keenableApiKey: "",
					perplexityApiKey: "",
					deepseekApiKey: "",
				});
			})
			.catch(() => { if (live) setInfo(null); });
		return () => { live = false; };
	}, [p.open]);

	const staged = p.draft.searchConfig != null;
	const set = (patchObj) => {
		const next = Object.assign({}, form, patchObj);
		setForm(next);
		p.patch(Object.assign({}, p.draft, { searchConfig: next }));
	};

	const meta = form ? PROVIDER_META[form.provider] : null;
	const keyField = meta && meta.key;
	const keyVal = keyField ? (form[keyField] || "") : "";
	const keySet = keyField ? !!(info && info.hasKey && info.hasKey[keyField]) : false;
	const marketBad = form && form.bingMarket && !marketValid(form.bingMarket);

	return [
		e("div", { key: "se-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Search (Free Search)", null, openSec, () => setOpenSec(!openSec)),
			staged ? e("span", { style: css.chip }, "unsaved") : null),
		openSec ? [
			e("p", { key: "se-note", style: css.note },
				info
					? "Free Search provider config — written to the web-search-free row. Restart the profile to apply. Secrets are never shown back."
					: "Search config needs the updated host half — restart the app."),
			info && form ? e("div", { key: "se-grid", style: Object.assign({}, css.row, { flexWrap: "wrap" }) },
				field("Provider",
					e("select", {
						className: "dshx-input",
						style: Object.assign({}, css.input, { maxWidth: 260 }),
						value: form.provider,
						disabled: p.busy,
						onChange: (ev) => set({ provider: ev.target.value }),
					}, Object.keys(PROVIDER_META).map((id) => {
						const m = PROVIDER_META[id];
						return e("option", { key: id, value: id }, `${m.label} — ${m.free ? "free" : "needs API key"}`);
					})), true),
				field("Region",
					inputEl({
						value: form.region,
						placeholder: "cn-zh",
						list: "se-region-list",
						disabled: p.busy,
						onChange: (ev) => set({ region: normRegion(ev.target.value) }),
					})),
				e("p", { key: "se-region-note", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
					"Filter by region (e.g. cn-zh, us, en). Leave blank for global. Pick from the list or type a code."),
				field("Bing market",
					inputEl({
						value: form.bingMarket,
						placeholder: "zh-CN",
						list: "se-market-list",
						disabled: p.busy,
						onChange: (ev) => set({ bingMarket: normMarket(ev.target.value) }),
					})),
				e("p", { key: "se-market-note", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
					"Language-region code for Bing: lang-COUNTRY (e.g. en-US, de-DE). Pick from the list."),
				marketBad ? e("p", { key: "se-market-bad", style: { color: "#e05252", fontSize: 12, flex: "1 1 100%", margin: "2px 0 0" } },
					"Unrecognized market code — expected like en-US. It will still be saved as typed.") : null,
				e("div", { key: "se-excl", style: { flex: "1 1 100%", display: "flex", flexWrap: "wrap", gap: 6, margin: "2px 0 0" } },
					e("span", { style: Object.assign({}, css.note, { width: "100%" }) }, "Exclude from fallback chain:"),
					Object.keys(PROVIDER_META).map((id) => {
						const m = PROVIDER_META[id];
						const on = Array.isArray(form.excludedEngines) && form.excludedEngines.includes(id);
						const isPreferred = form.provider === id;
						return e("label", { key: `se-ex-${id}`, style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, opacity: isPreferred ? 0.5 : 1 } },
							e("input", {
								type: "checkbox",
								checked: !!on,
								disabled: p.busy || isPreferred,
								onChange: (ev) => {
									const cur = new Set(Array.isArray(form.excludedEngines) ? form.excludedEngines : []);
									if (ev.target.checked) cur.add(id); else cur.delete(id);
									set({ excludedEngines: [...cur] });
								},
							}),
							m.label,
							isPreferred ? " (preferred)" : "");
					})),
			) : null,
			info && form && form.provider === "searxng" ? e("div", { key: "se-sx", style: Object.assign({}, css.row, { flexWrap: "wrap" }) },
				field("SearXNG instances",
					inputEl({
						value: form.searxngInstances,
						placeholder: "http://127.0.0.1:8888",
						disabled: p.busy,
						onChange: (ev) => set({ searxngInstances: ev.target.value }),
					}), true),
				e("p", { key: "se-sx-note", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
					"Base URLs tried in order — your own Docker instance first is the reliable path (public ones are heavily rate-limited). The instance must enable the JSON API (search.formats: json)."),
				...(Array.isArray(info.instanceStatus) ? info.instanceStatus.map((st, i) =>
					e("p", {
						key: `se-sx-st-${i}`,
						style: { fontSize: 12, flex: "1 1 100%", margin: "1px 0 0", color: st.state === "ok" ? "#3fa34d" : "#e08a52" },
					}, `${st.state === "ok" ? "✓" : "⚠"} ${st.url} — ${st.detail}`)
				) : []),
			) : null,
			info && form && meta ? e("div", { key: "se-key", style: Object.assign({}, css.row, { flexWrap: "wrap" }) },
				meta.free
					? e("p", { key: "se-free", style: Object.assign({}, css.note, { flex: "1 1 100%" }) }, `${meta.label} is free — no API key required.`)
					: [
						field(`API key — ${meta.label}`,
							inputEl({
								type: "password",
								value: keyVal,
								placeholder: keySet ? "unchanged" : `paste your ${meta.label} key`,
								disabled: p.busy,
								onChange: (ev) => set({ [keyField]: ev.target.value.trim() }),
							}), true),
						e("p", { key: "se-keynote", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
							"This key is saved only for the selected provider. Leave it blank to keep the current value."),
						meta.endpoint ? [
							field(`Endpoint (optional) — ${meta.label}`,
								inputEl({
									value: form[meta.endpoint] || "",
									placeholder: "built-in default",
									disabled: p.busy,
									onChange: (ev) => set({ [meta.endpoint]: ev.target.value.trim() }),
								}), true),
							e("p", { key: "se-endpoint-note", style: Object.assign({}, css.note, { flex: "1 1 100%", margin: "2px 0 0" }) },
								`Full http(s) search-endpoint override for ${meta.label} (self-hosted or proxy gateway). Clear the box to fall back to the built-in default.`),
						] : null,
					],
			) : null,
			// datalists referenced by the list= attributes above
			e("datalist", { key: "se-regions", id: "se-region-list" }, REGION_HINTS.map((h) => e("option", { key: h, value: h }))),
			e("datalist", { key: "se-markets", id: "se-market-list" }, MARKET_HINTS.map((h) => e("option", { key: h, value: h }))),
		] : null,
	];
}

SECTIONS.push(SearchSection);


// ════════════════════ client/themes/cyberpunk2077.js ════════════════════

// ═══ VENDORED MODULE: Cyberpunk 2077 theme ═════════════════════════
// Source: dsh-theme-cyberpunk2077 (Plugin Market install), copied into
// dsh-enhanced per the one-plugin consolidation. Factory body untouched
// except: user-facing zh-CN strings translated to English (deck labels,
// NC tips, status chips, Johnny-egg subtitle lines). The zh label matcher
// near "findBar" is functional (finds the app's own Settings button) and
// Vendored as-is except: the upstream MiSans CDN @import was removed so the
// plugin is fully offline (font stacks fall back to OS CJK fonts).
function cyberpunkThemeFactory() {
		var module = { exports: {} };
		var exports = module.exports;

		// ════════════════════════════════════════════════════════════════
		// CYBERPUNK 2077 — NIGHT CITY theme for DeepSeek Harness Web UI.
		// Token layer + full identity layer: chamfered chrome, glitch, CRT,
		// HUD states, shard sessions, typewriter + message SFX, boot intro,
		// relic interference, DECK control panel, easter eggs — plus the v2
		// pass: Kiroshi lock-on hover, combat state (stamina bar + NC loading
		// tips), slang chips, NC wall clock, hex data-stream, Johnny takeover,
		// hazard tape, EXECUTE RGB split, mobile/reduced-motion guards.
		// ════════════════════════════════════════════════════════════════
		const TOKENS = {
			// surfaces — deep night blue-black
			"--dsw-alias-bg-base": "#05070d",
			"--dsw-alias-bg-layer-1": "#0a0e18",
			"--dsw-alias-bg-layer-2": "#0d1322",
			"--dsw-alias-bg-layer-3": "#121a2c",
			"--dsw-alias-bg-overlay": "#141c30",
			"--dsw-alias-bg-module-platform": "#0a101d",
			"--dsw-alias-bg-multi-select": "#11182a",
			"--dsw-alias-bg-skeleton": "rgba(0, 240, 255, 0.07)",
			"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.72)",
			"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.4)",
			"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.72)",
			"--dsw-alias-bg-mask-photo": "rgba(0, 0, 0, 0.9)",
			"--dsw-alias-bg-mask-drop": "rgba(5, 7, 13, 0.72)",

			// labels
			"--dsw-alias-label-primary": "#e8f1ff",
			"--dsw-alias-label-secondary": "#9fb2d6",
			"--dsw-alias-label-tertiary": "#6e80a6",
			"--dsw-alias-label-caption": "#8fa3c8",
			"--dsw-alias-label-dimmed": "#5a6b8c",
			"--dsw-alias-label-primary-bluish": "#e8f1ff",
			"--dsw-alias-label-primary-dimmed": "#d8e6ff",
			"--dsw-alias-label-primary-foreground": "#0a0f18",
			"--dsw-alias-label-primary-inverted": "#0a0f18",

			// brand — the Cyberpunk 2077 yellow
			"--dsw-alias-brand-primary": "#fce300",
			"--dsw-alias-brand-text": "#fce300",
			"--dsw-alias-brand-primary-invert": "#141200",

			// buttons
			"--dsw-alias-button-primary-fill": "#fce300",
			"--dsw-alias-button-primary-hover": "#fcee0a",
			"--dsw-alias-button-primary-dimmed": "rgba(252, 227, 0, 0.12)",
			"--dsw-alias-button-contrast-fill": "#e8f1ff",
			"--dsw-alias-button-elevated-fill": "#101624",
			"--dsw-alias-button-floating-fill": "#0d1322",
			"--dsw-alias-button-floating-hover": "#141c30",
			"--dsw-alias-button-ghost-active-fill": "#101a2c",
			"--dsw-alias-button-ghost-active-hover": "#162035",
			"--dsw-alias-button-info-fill": "#00c2d9",
			"--dsw-alias-button-info-hover": "#00f0ff",
			"--dsw-alias-button-tool-bar-fill-invisible": "rgba(0, 240, 255, 0.08)",
			"--dsw-alias-button-tool-bar-fill": "rgba(0, 240, 255, 0.14)",
			"--dsw-alias-button-tool-bar-hover": "rgba(0, 240, 255, 0.22)",
			"--dsw-alias-button-ghost-active-border": "#00f0ff",

			// interactive
			"--dsw-alias-interactive-bg-hover": "rgba(0, 240, 255, 0.09)",
			"--dsw-alias-interactive-bg-active": "rgba(0, 240, 255, 0.15)",
			"--dsw-alias-interactive-bg-hover-accent": "rgba(252, 227, 0, 0.14)",
			"--dsw-alias-interactive-bg-hover-danger": "rgba(255, 0, 60, 0.14)",
			"--dsw-alias-interactive-bg-hover-solid": "#141c2b",

			// borders
			"--dsw-alias-border-l1": "rgba(0, 240, 255, 0.12)",
			"--dsw-alias-border-l2": "rgba(0, 240, 255, 0.20)",
			"--dsw-alias-border-l2-darkmode-thin": "rgba(0, 240, 255, 0.10)",
			"--dsw-alias-border-l3": "rgba(252, 227, 0, 0.22)",
			"--dsw-alias-border-l4": "rgba(0, 240, 255, 0.34)",
			"--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.10)",
			"--dsw-alias-border-inverted2": "rgba(255, 255, 255, 0.14)",

			// state
			"--dsw-alias-state-business-primary": "#00f0ff",
			"--dsw-alias-state-business-tertiary": "#0c2a3d",
			"--dsw-alias-state-error-primary": "#ff003c",
			"--dsw-alias-state-error-secondary": "#ff3b69",
			"--dsw-alias-state-success-primary": "#00f5a0",
			"--dsw-alias-state-success-secondary": "#3dffbe",
			"--dsw-alias-state-success-tertiary": "#07301f",
			"--dsw-alias-state-warn-label": "#ffc94d",
			"--dsw-alias-state-warn-primary": "#ffb300",
			"--dsw-alias-state-warn-secondary": "#ffc94d",
			"--dsw-alias-state-warn-tertiary": "#3a2a00",

			// markdown / code
			"--dsw-alias-markdown-code-block": "#060a12",
			"--dsw-alias-markdown-code-block-banner": "#0a0f1c",
			"--dsw-alias-markdown-inline-code": "#12202f",
			"--dsw-alias-markdown-placeholder": "#0e141f",
			"--dsw-alias-markdown-tag": "#0f1a2b",
			"--dsw-alias-markdown-citation": "#0e1626",
			"--dsw-alias-markdown-code-segment-selected": "#10182a",
			"--dsw-alias-markdown-code-segment-unselected": "#0a0f18",

			// scrollbar — neon yellow
			"--dsw-alias-scrollbar-bg-l1": "rgba(252, 227, 0, 0.26)",
			"--dsw-alias-scrollbar-bg-l2": "rgba(252, 227, 0, 0.32)",
			"--dsw-alias-scrollbar-hover-l1": "rgba(252, 227, 0, 0.48)",
			"--dsw-alias-scrollbar-hover-l2": "rgba(252, 227, 0, 0.55)",

			// toast / tooltip
			"--dsw-alias-toast-bg": "#0d1322",
			"--dsw-alias-tooltip-bg": "#141c30",

			// specific surfaces
			"--dsw-specific-bubble": "#0a0f1c",
			"--dsw-specific-bubble-highlight": "#12222e",
			"--dsw-specific-input-major": "#070b12",
			"--dsw-specific-login-input": "#060a11",
			"--dsw-specific-menu": "#121a2c",
			"--dsw-specific-selector": "#0d1322",
			"--dsw-specific-tip": "#0d1424",
			"--dsw-specific-sidebar-fill": "#060a11",
			"--dsw-specific-sidebar-nav-item-active": "#101826",
			"--dsw-specific-sidebar-nav-item-active-accent": "#fce300",
			"--dsw-specific-sidebar-nav-item-hover": "#0f1522",

			// statics
			"--dsw-static-neutral-bluish-00": "#05070d",
			"--dsw-static-neutral-bluish-1000": "#e8f1ff",
			"--dsw-static-neutral-bluish-100": "#0a0e18",
			"--dsw-static-neutral-bluish-200": "#0d1322",
			"--dsw-static-neutral-bluish-300": "#121a2c",
			"--dsw-static-neutral-bluish-400": "#9fb2d6",
			"--dsw-static-neutral-bluish-50": "#0a0e18",
			"--dsw-static-neutral-bluish-500": "#6e80a6",
			"--dsw-static-neutral-bluish-600": "#5a6b8c",
			"--dsw-static-neutral-bluish-700": "#3a4a68",
			"--dsw-static-neutral-bluish-750": "#24324c",
			"--dsw-static-neutral-bluish-75": "#0d1322",
			"--dsw-static-neutral-bluish-800": "#1a2234",
			"--dsw-static-neutral-bluish-850": "#111827",
			"--dsw-static-neutral-bluish-875": "#0d121d",
			"--dsw-static-neutral-bluish-900": "#090d16",
			"--dsw-static-neutral-bluish-950": "#060910",
			"--dsw-static-neutral-bluish-60": "#0a0f18",

			"--dsw-static-deepseek-400": "#00f0ff",
			"--dsw-static-deepseek-450": "#00cfe8",
			"--dsw-static-deepseek-500": "#00c2d9",
			"--dsw-static-deepseek-600": "#0f7da8",
			"--dsw-static-deepseek-700-delete": "#0b4a66",
			"--dsw-static-deepseek-800": "#0a3548",
			"--dsw-static-deepseek-900": "#092433",
			"--dsw-static-deepseek-100": "#12293a",
			"--dsw-static-deepseek-200": "#0f2d42",
			"--dsw-static-deepseek-300": "#0d3550",
			"--dsw-static-deepseek-50": "#0a1526",

			"--dsw-static-blue-400": "#00f0ff",
			"--dsw-static-blue-450": "#00cfe8",
			"--dsw-static-blue-500": "#00b3c9",
			"--dsw-static-blue-600": "#0f7da8",
			"--dsw-static-blue-800": "#0b4a66",
			"--dsw-static-blue-900": "#0a3548",
			"--dsw-static-blue-950": "#092433",
			"--dsw-static-blue-100": "#12263d",
			"--dsw-static-blue-300": "#2bd9f0",
			"--dsw-static-blue-50": "#0a1526",
			"--dsw-static-blue-75": "#0e1c30",
			"--dsw-static-blue-50p": "#0a1a2e",

			"--dsw-static-green-400": "#3dffbe",
			"--dsw-static-green-500": "#00f5a0",
			"--dsw-static-green-100": "#07301f",
			"--dsw-static-green-900": "#043524",

			"--dsw-static-red-400": "#ff3b69",
			"--dsw-static-red-500": "#ff003c",
			"--dsw-static-red-600": "#ff003c",
			"--dsw-static-red-100": "#3a1020",
			"--dsw-static-red-50": "#2b0e1a",
			"--dsw-static-red-900": "#4b0d1c",

			"--dsw-static-amber-400": "#ffc94d",
			"--dsw-static-amber-500": "#ffb300",
			"--dsw-static-amber-600": "#ff9f00",
			"--dsw-static-amber-100": "#3a2a00",
			"--dsw-static-amber-900": "#2b1f00"
		};

		const THEME_ID = "cyberpunk2077";

		// ── config (persisted in localStorage under one key) ───────────────
		const CFG_KEY = "cp2077-cfg";
		const CFG_DEFAULTS = { scan: true, relic: true, boot: true, type: true, sfx: true };
		let cfg = { ...CFG_DEFAULTS };
		function loadCfg() {
			try {
				const raw = localStorage.getItem(CFG_KEY);
				if (raw !== null) cfg = { ...CFG_DEFAULTS, ...JSON.parse(raw) };
			} catch {}
		}
		function saveCfg() {
			try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {}
		}
		// Effects gate on body classes so CSS can switch them off cheaply.
		function applyCfgToBody() {
			const b = document.body;
			if (b === undefined || b === null) return;
			b.classList.toggle("cp-off-scan", !cfg.scan);
			b.classList.toggle("cp-off-relic", !cfg.relic);
			b.classList.toggle("cp-off-sfx", !cfg.sfx);
		}

		// ── sound engine (Web Audio; everything synthesized, no assets) ────
		let audioCtx = null;
		let noiseBuf = null;
		function ensureAudio() {
			const AC = window.AudioContext || window.webkitAudioContext;
			if (AC === undefined) return null;
			if (audioCtx === null) audioCtx = new AC();
			if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
			return audioCtx;
		}
		function noiseBuffer(ctx) {
			if (noiseBuf !== null) return noiseBuf;
			const len = Math.floor(ctx.sampleRate * 0.06);
			const buf = ctx.createBuffer(1, len, ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
			noiseBuf = buf;
			return buf;
		}
		// One key click: noise transient + pitch-drop body.
		function playKeyClick(key) {
			if (!cfg.type) return;
			const ctx = ensureAudio();
			if (ctx === null || ctx.state !== "running") return;
			const t = ctx.currentTime;
			const src = ctx.createBufferSource();
			src.buffer = noiseBuffer(ctx);
			const bp = ctx.createBiquadFilter();
			bp.type = "bandpass";
			const base = key === " " ? 1300 : key === "Enter" ? 1000 : 1900;
			bp.frequency.value = base + Math.random() * 900;
			bp.Q.value = 1.1;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.05, t + 0.002);
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
			src.connect(bp); bp.connect(g); g.connect(ctx.destination);
			src.start(t); src.stop(t + 0.07);
			const osc = ctx.createOscillator();
			osc.type = "triangle";
			const f0 = key === "Enter" ? 190 : key === " " ? 130 : 150 + Math.random() * 40;
			osc.frequency.setValueAtTime(f0, t);
			osc.frequency.exponentialRampToValueAtTime(55, t + 0.055);
			const g2 = ctx.createGain();
			g2.gain.setValueAtTime(0.0001, t);
			g2.gain.exponentialRampToValueAtTime(0.07, t + 0.003);
			g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
			osc.connect(g2); g2.connect(ctx.destination);
			osc.start(t); osc.stop(t + 0.07);
		}
		// Generic blip helper: oscillator sweep with envelope.
		function blip(freqA, freqB, dur, vol, type, when) {
			const ctx = ensureAudio();
			if (ctx === null || ctx.state !== "running") return;
			const t = ctx.currentTime + (when ?? 0);
			const osc = ctx.createOscillator();
			osc.type = type ?? "square";
			osc.frequency.setValueAtTime(freqA, t);
			if (freqB !== null && freqB !== freqA) osc.frequency.exponentialRampToValueAtTime(freqB, t + dur);
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
			g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			osc.connect(g); g.connect(ctx.destination);
			osc.start(t); osc.stop(t + dur + 0.02);
		}
		// Message lifecycle SFX (all gated on cfg.sfx).
		function playSend() { if (!cfg.sfx) return; blip(680, 1240, 0.09, 0.05, "square"); }
		function playDone() { if (!cfg.sfx) return; blip(880, 880, 0.07, 0.05, "square"); blip(1320, 1320, 0.09, 0.05, "square", 0.1); }
		function playNotify() { if (!cfg.sfx) return; blip(1560, 1560, 0.05, 0.035, "triangle"); blip(2080, 2080, 0.06, 0.03, "triangle", 0.07); }
		function playError() {
			if (!cfg.sfx) return;
			const ctx = ensureAudio();
			if (ctx === null || ctx.state !== "running") return;
			const t = ctx.currentTime;
			const src = ctx.createBufferSource();
			src.buffer = noiseBuffer(ctx);
			const lp = ctx.createBiquadFilter();
			lp.type = "lowpass"; lp.frequency.value = 900;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.09, t);
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
			src.connect(lp); lp.connect(g); g.connect(ctx.destination);
			src.start(t); src.stop(t + 0.3);
			blip(160, 70, 0.28, 0.07, "sawtooth");
		}
		function playWake() {
			if (!cfg.sfx) return;
			blip(120, 48, 0.6, 0.09, "sawtooth");
			blip(2400, 300, 0.35, 0.04, "square", 0.05);
			blip(90, 40, 0.8, 0.08, "sawtooth", 0.35);
		}
		// Johnny engram booting in: two detuned saws beating against each
		// other, punctuated by data-shrieks.
		function playJohnny() {
			if (!cfg.sfx) return;
			blip(58, 52, 0.9, 0.08, "sawtooth");
			blip(61, 55, 0.9, 0.07, "sawtooth");
			blip(1400, 200, 0.12, 0.04, "square", 0.12);
			blip(1400, 180, 0.12, 0.04, "square", 0.5);
		}

		// ── DECK control panel + SND quick chip ────────────────────────────
		function ensureDeckPanel() {
			if (document.getElementById("cp2077-deck") !== null) return null;
			const wrap = document.createElement("div");
			wrap.id = "cp2077-deck";
			wrap.setAttribute("role", "group");
			wrap.setAttribute("aria-label", "Cyberdeck theme settings");
			const title = document.createElement("div");
			title.className = "cp2077-deck-title";
			title.textContent = "CYBERDECK";
			wrap.appendChild(title);
			const items = [
				["scan", "CRT Scanlines"],
				["relic", "Relic Glitch"],
				["boot", "Boot Transition"],
				["type", "Typing SFX"],
				["sfx", "Alert Sounds"]
			];
			const paint = (btn, on) => {
				btn.textContent = (on ? "◉ " : "○ ") + btn.dataset.label;
				btn.setAttribute("aria-pressed", String(on));
				btn.classList.toggle("cp2077-on", on);
			};
			for (const [key, label] of items) {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.dataset.label = label;
				btn.addEventListener("click", () => {
					cfg[key] = !cfg[key];
					saveCfg();
					applyCfgToBody();
					paint(btn, cfg[key]);
					playNotify();
				});
				paint(btn, cfg[key]);
				wrap.appendChild(btn);
			}
			const deckBtn = document.createElement("button");
			deckBtn.id = "cp2077-deck-toggle";
			deckBtn.type = "button";
			deckBtn.title = "Cyberdeck theme settings";
			deckBtn.textContent = "DECK";
			deckBtn.addEventListener("click", () => {
				const open = wrap.classList.toggle("cp2077-open");
				deckBtn.setAttribute("aria-expanded", String(open));
				deckBtn.classList.toggle("cp2077-open", open);
			});
			(document.body || document.documentElement).append(deckBtn, wrap);
			return { deckBtn, wrap };
		}
		function ensureSndChip() {
			if (document.getElementById("cp2077-snd-toggle") !== null) return null;
			const btn = document.createElement("button");
			btn.id = "cp2077-snd-toggle";
			btn.type = "button";
			btn.title = "Toggle all sounds";
			const paint = () => {
				const on = cfg.type || cfg.sfx;
				btn.textContent = on ? "SND ◉" : "SND ○";
				btn.setAttribute("aria-pressed", String(on));
			};
			btn.addEventListener("click", () => {
				const on = cfg.type || cfg.sfx;
				cfg.type = !on;
				cfg.sfx = !on;
				saveCfg();
				applyCfgToBody();
				paint();
				if (!on) playNotify();
			});
			paint();
			(document.body || document.documentElement).appendChild(btn);
			return btn;
		}

		// ── interaction watchers (send / done / error / toast) ────────────
		let lastSfxAt = 0;
		function throttled(fn) {
			return () => {
				const now = Date.now();
				if (now - lastSfxAt < 90) return;
				lastSfxAt = now;
				fn();
			};
		}
		const onSendSound = throttled(playSend);
		const onNotifySound = throttled(playNotify);
		function onKeydown(e) {
			const el = e.target;
			if (el === null || el.tagName !== "TEXTAREA") return;
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === "Enter") {
				onSendSound();
				const word = (el.value ?? "").trim().toLowerCase();
				if (word === "relic" || word === "johnny") return; // egg handles its own audio
				flashChip("GIG UP // MESSAGE SENT", "info");
				return;
			}
			playKeyClick(e.key);
		}
		// ── working state: combat HUD, NC loading tips, slang chips ──────
		let workingNow = false;
		let tipTimer = null;
		const NC_TIPS = [
			"TIP: NCPD scanners can't tell a chromed 'borg from baseline — but the bill can.",
			"TIP: In Night City, \"free\" is the most expensive thing there is.",
			"TIP: Too much braindance and reality starts looking pirated.",
			"TIP: Arasaka contracts kill in the fine print.",
			"TIP: Before you take a gig, ask one question: who gets burned?",
			"TIP: Chrome isn't about how much you pack — it's packing it right.",
			"TIP: Fixers always take their cut. Even the ones you thought were friends.",
			"TIP: Never take a rush job in downtown traffic."
		];
		function flashChip(text, tone) {
			let chip = document.getElementById("cp2077-chip");
			if (chip === null) {
				chip = document.createElement("div");
				chip.id = "cp2077-chip";
				chip.setAttribute("role", "status");
				(document.body || document.documentElement).appendChild(chip);
			}
			chip.className = tone;
			chip.textContent = text;
			// restart the entrance animation
			chip.style.animation = "none";
			void chip.offsetWidth;
			chip.style.animation = "";
			clearTimeout(chip._t);
			chip._t = setTimeout(() => chip.remove(), 1700);
		}
		function startTipRotation() {
			if (tipTimer !== null) return;
			flashChip("GIG IN PROGRESS // " + NC_TIPS[0], "info");
			let i = 1;
			tipTimer = setInterval(() => {
				flashChip("GIG IN PROGRESS // " + NC_TIPS[i % NC_TIPS.length], "info");
				i++;
			}, 6000);
		}
		function stopTipRotation() {
			if (tipTimer === null) return;
			clearInterval(tipTimer);
			tipTimer = null;
		}
		// Poll the composer's pending dot: appears while the agent streams,
		// vanishes on completion → combat-state chrome off, PREEM chip + chime.
		// (An interval is cheaper and more robust than a subtree
		// MutationObserver against a React tree.)
		function startPendingPoll() {
			const timer = setInterval(() => {
				const pending = document.querySelector("[class*='_pending']");
				const is = pending !== null;
				if (is !== workingNow) {
					workingNow = is;
					document.body.classList.toggle("cp-working", is);
					paintTitle();
					if (is) startTipRotation();
					else { stopTipRotation(); flashChip("PREEM. // GIG COMPLETE", "ok"); playDone(); }
				}
			}, 450);
			return () => { clearInterval(timer); stopTipRotation(); };
		}

		// ── Night City HUD footer: clock + hex stream, docked into the app's
		// own settings bar (its empty right half) so it never fights the
		// layout for a corner. Hidden when the bar is missing or collapsed.
		function startHudFooter() {
			const hud = document.createElement("div");
			hud.id = "cp2077-hud";
			hud.setAttribute("aria-hidden", "true");
			const hex = document.createElement("span");
			hex.id = "cp2077-hex";
			const clock = document.createElement("span");
			clock.id = "cp2077-clock";
			hud.append(hex, clock);
			(document.body || document.documentElement).appendChild(hud);
			const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
			const rnd = () => Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, "0");
			const bytes = [];
			for (let i = 0; i < 3; i++) bytes.push(rnd());
			const paintHex = () => {
				hex.textContent = "0x" + bytes.join("");
				hex.hidden = !cfg.scan || reduced;
			};
			const paintClock = () => {
				const d = new Date();
				const p = (n) => String(n).padStart(2, "0");
				clock.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + " NC-TIME";
			};
			// Find the settings bar (zh-CN "设置" / zh-TW "設定" / en "Settings").
			const findBar = () => {
				for (const b of document.querySelectorAll("button")) {
					const label = b.getAttribute("aria-label") || b.title || (b.textContent || "").trim();
					if (label === "设置" || label === "設定" || label.toLowerCase() === "settings") return b;
				}
				return null;
			};
			// Dock right-aligned inside the bar's empty right half.
			const dock = () => {
				const bar = findBar();
				if (bar === null) { hud.style.display = "none"; return; }
				const r = bar.getBoundingClientRect();
				if (r.width < 170 || r.height === 0) { hud.style.display = "none"; return; }
				hud.style.display = "";
				hud.style.left = Math.round(r.right - 10) + "px";
				hud.style.bottom = Math.round(window.innerHeight - r.bottom + (r.height - 13) / 2) + "px";
			};
			paintHex(); paintClock(); dock();
			// The settings bar renders after the app boots — poll the dock
			// every second for the first 20s, then settle into the slow tick.
			const earlyTimer = setInterval(dock, 1000);
			const earlyStop = setTimeout(() => clearInterval(earlyTimer), 20000);
			let hexIdx = 0;
			const t1 = setInterval(() => {
				if (document.hidden) return;
				bytes[hexIdx = (hexIdx + 1) % bytes.length] = rnd();
				paintHex();
			}, 400);
			const t2 = setInterval(() => {
				if (!document.hidden) paintClock();
				dock();
			}, 10000);
			window.addEventListener("resize", dock);
			// Sidebar collapse/expand shifts the bar without a window resize —
			// any click re-docks shortly after (narrow bars auto-hide the hud).
			const onClick = () => setTimeout(dock, 600);
			document.addEventListener("click", onClick, true);
			return () => {
				clearInterval(t1); clearInterval(t2);
				clearInterval(earlyTimer); clearTimeout(earlyStop);
				window.removeEventListener("resize", dock);
				document.removeEventListener("click", onClick, true);
				hud.remove();
			};
		}
		// Watch for error notices / toasts appearing anywhere.
		function startNoticeObserver() {
			const seen = new WeakSet();
			const observer = new MutationObserver((records) => {
				for (const rec of records) {
					for (const node of rec.addedNodes) {
						if (node.nodeType !== 1) continue;
						const el = node;
						if (seen.has(el)) continue;
						seen.add(el);
						const cls = (el.className && typeof el.className === "string") ? el.className : "";
						if (/_noticeError|_turnError/.test(cls)) { playError(); flashChip("FLATLINE // CONNECTION LOST", "err"); }
						else if (/_notice([^A-Za-z]|$)|_toast/.test(cls)) onNotifySound();
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			return () => observer.disconnect();
		}

		// ── ambient relic interference (random 40–70s, ~200ms) ────────────
		function startRelicLoop() {
			let stopped = false;
			let overlay = null;
			const flick = () => {
				if (stopped) return;
				if (cfg.relic && !document.hidden) {
					if (overlay === null) {
						overlay = document.createElement("div");
						overlay.id = "cp2077-relic";
						overlay.setAttribute("aria-hidden", "true");
					}
					if (!overlay.isConnected) (document.body || document.documentElement).appendChild(overlay);
					setTimeout(() => overlay.remove(), 220);
				}
				setTimeout(flick, 40000 + Math.random() * 30000);
			};
			setTimeout(flick, 25000 + Math.random() * 20000);
			return () => { stopped = true; };
		}

		// ── easter eggs: type a trigger word + Enter ──────────────────────
		// relic  → WAKE UP, SAMURAI (the Relic booting V)
		// johnny → the engram seizes the screen for 2.6s
		const EGGS = {
			relic: {
				id: "cp2077-wake",
				hold: 2000,
				sound: playWake,
				build(ov) {
					const l1 = document.createElement("div");
					l1.className = "cp2077-wake-line1";
					l1.textContent = "WAKE UP, SAMURAI.";
					const l2 = document.createElement("div");
					l2.className = "cp2077-wake-line2";
					l2.textContent = "WE HAVE A CITY TO BURN.";
					ov.append(l1, l2);
				}
			},
			johnny: {
				id: "cp2077-johnny",
				hold: 2600,
				sound: playJohnny,
				build(ov) {
					const LINES = [
						["THIS CITY'S GOT NO ROOM FOR GHOSTS.", "no room. never was."],
						["NEVER STOP FIGHTING.", "not here. not ever."],
						["WE HAD A CITY ONCE. WE LET IT BURN.", "and we'd do it again."],
						["LEGENDS DON'T DIE. THEY JUST GO OFFLINE.", "signal lost. legend intact."]
					];
					const pick = LINES[Math.floor(Math.random() * LINES.length)];
					ov.append(
						Object.assign(document.createElement("div"), { className: "cp2077-johnny-tint" }),
						Object.assign(document.createElement("div"), { className: "cp2077-johnny-tear" })
					);
					const box = document.createElement("div");
					box.className = "cp2077-johnny-box";
					const q = document.createElement("div");
					q.className = "cp2077-johnny-quote";
					q.textContent = pick[0];
					const cn = document.createElement("div");
					cn.className = "cp2077-johnny-cn";
					cn.textContent = pick[1];
					const by = document.createElement("div");
					by.className = "cp2077-johnny-attr";
					by.textContent = "— JOHNNY SILVERHAND // ENGRAM";
					box.append(q, cn, by);
					ov.append(box);
				}
			}
		};
		function startTriggerWatcher() {
			const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
			const handler = (e) => {
				const el = e.target;
				if (el === null || el.tagName !== "TEXTAREA") return;
				if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
				const egg = EGGS[(el.value ?? "").trim().toLowerCase()];
				if (egg === undefined || document.getElementById(egg.id) !== null) return;
				if (egg.id === "cp2077-johnny" && reduced()) return;
				const ov = document.createElement("div");
				ov.id = egg.id;
				ov.setAttribute("aria-hidden", "true");
				egg.build(ov);
				(document.body || document.documentElement).appendChild(ov);
				egg.sound();
				setTimeout(() => ov.remove(), egg.hold);
			};
			document.addEventListener("keydown", handler, true);
			return () => document.removeEventListener("keydown", handler, true);
		}

		// ── tab takeover: glitched favicon + terminal title ───────────────
		const TITLE_BASE = "DSH // NC-TERMINAL";
		function paintTitle() {
			document.title = (workingNow ? "▶ NC-JOB // " : "") + TITLE_BASE;
		}
		function applyTabIdentity() {
			try {
				const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
					+ "<rect width='32' height='32' fill='#05070d'/>"
					+ "<polygon points='6,3 26,3 29,6 29,26 26,29 3,29 3,6' fill='#fce300'/>"
					+ "<polygon points='10,8 22,8 24,10 24,22 22,24 8,24 8,10' fill='#05070d'/>"
					+ "<rect x='12' y='12' width='8' height='8' fill='#00f0ff'/></svg>";
				const href = "data:image/svg+xml," + encodeURIComponent(svg);
				let link = document.querySelector("link[rel*='icon']");
				if (link === null) {
					link = document.createElement("link");
					link.rel = "icon";
					(document.head || document.documentElement).appendChild(link);
				}
				link.href = href;
			} catch {}
			const glitchChars = "▓▒░#%@&$";
			paintTitle();
			const timer = setInterval(() => {
				if (document.hidden) return;
				const b = workingNow ? "▶ NC-JOB // " + TITLE_BASE : TITLE_BASE;
				const i = Math.floor(Math.random() * b.length);
				document.title = b.slice(0, i) + glitchChars[Math.floor(Math.random() * glitchChars.length)] + b.slice(i + 1);
				setTimeout(paintTitle, 160);
			}, 9000);
			return () => clearInterval(timer);
		}

		// ── boot glitch transition (once per tab SESSION: the first load of a
		// tab plays it; reloads/reconnects within that session skip the replay,
		// a fresh tab or a new day sees it again) ─────────────────────────
		const BOOT_SEEN_KEY = "cp2077-boot-seen";
		function playBootTransition() {
			if (!cfg.boot) return null;
			if (document.getElementById("cp2077-boot") !== null) return null;
			if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
			try {
				if (sessionStorage.getItem(BOOT_SEEN_KEY) === "1") return null;
				sessionStorage.setItem(BOOT_SEEN_KEY, "1");
			} catch {}
			const ov = document.createElement("div");
			ov.id = "cp2077-boot";
			ov.setAttribute("aria-hidden", "true");
			const mk = (cls, text) => {
				const d = document.createElement("div");
				d.className = cls;
				if (text !== undefined) d.textContent = text;
				return d;
			};
			ov.append(
				mk("cp-line"),
				mk("cp-crt"),
				mk("cp-bars"),
				mk("cp-title", "NIGHT CITY"),
				mk("cp-sub", "DSH TERMINAL // NETRUNNER OS"),
				mk("cp-flash")
			);
			(document.body || document.documentElement).appendChild(ov);
			setTimeout(() => ov.remove(), 2300);
			return ov;
		}

		// ── the identity layer (CSS) ──────────────────────────────────────
		function injectCyberpunkStyles() {
			if (document.querySelector("style[data-cyberpunk-theme]")) return;
			const tokenLines = Object.entries(TOKENS)
				.map(([name, value]) => "  " + name + ": " + value + " !important;")
				.join("\n");
			const style = document.createElement("style");
			style.dataset.cyberpunkTheme = "dsh-theme-cyberpunk2077";
			style.textContent = [
				// Fully offline: no web-font fetch. MiSans stays first in the stacks
				// only so a user who has it installed locally still gets it; otherwise
				// they fall back to the OS CJK font (PingFang SC / Microsoft YaHei).
				"html { color-scheme: dark !important; }",
				"body {",
				"  background-color: #05070d !important;",
				"  color: #e8f1ff;",
				"  --dsw-font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  --ds-font-family-code: 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei';",
				tokenLines,
				"}",

				// ── CRT: scanlines + city grid + neon haze (toggle: scan) ─────
				"#root::after {",
				"  content: \"\";",
				"  position: fixed; inset: 0; z-index: 9999; pointer-events: none;",
				"  background:",
				"    repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 3px),",
				"    repeating-linear-gradient(90deg, rgba(0,240,255,0.022) 0 1px, transparent 1px 84px),",
				"    repeating-linear-gradient(0deg, rgba(0,240,255,0.018) 0 1px, transparent 1px 84px),",
				"    radial-gradient(1100px 520px at 92% -6%, rgba(255,0,127,0.075), transparent 62%),",
				"    radial-gradient(950px 480px at -6% 106%, rgba(0,240,255,0.065), transparent 62%);",
				"}",
				"body.cp-off-scan #root::after { display: none; }",

				// ── hazard stripe across the top ──────────────────────────────
				"[class*='frame']::before {",
				"  content: \"\";",
				"  position: absolute; top: 0; left: 0; right: 0; height: 3px;",
				"  z-index: 60; pointer-events: none; opacity: 0.55;",
				"  background: repeating-linear-gradient(-45deg, rgba(252,227,0,0.85) 0 7px, transparent 7px 14px);",
				"}",

				// ── chamfered chrome: every button gets the NC 45° cut ────────
				"button {",
				"  clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px);",
				"  font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  font-weight: 600; letter-spacing: 0.06em;",
				"  transition: filter 0.15s var(--ds-ease-in-out), color 0.15s var(--ds-ease-in-out), background-color 0.15s var(--ds-ease-in-out);",
				"}",
				"button:hover { color: #fce300; filter: drop-shadow(0 0 6px rgba(252,227,0,0.45)); }",
				"button:active { transform: translateY(1px); }",
				"button:disabled { filter: none; }",

				// primary actions: solid NC yellow, black text, neon pulse
				"button[class*='primary'], button[class*='newSession'], button[class*='add'] {",
				"  background: #fce300 !important; color: #0a0a05 !important; border-color: transparent !important;",
				"}",
				"button[class*='primary']:hover, button[class*='newSession']:hover, button[class*='add']:hover {",
				"  background: #fcee0a !important; color: #0a0a05 !important;",
				"  filter: drop-shadow(0 0 10px rgba(252,227,0,0.6));",
				"}",
				"@keyframes cpPulse {",
				"  0%, 100% { filter: drop-shadow(0 0 3px rgba(252,227,0,0.25)); }",
				"  50% { filter: drop-shadow(0 0 12px rgba(252,227,0,0.55)); }",
				"}",
				"button[class*='primary'], button[class*='newSession'] { animation: cpPulse 2.8s ease-in-out infinite; }",

				// ── composer: transparent-input + mirror architecture ────────
				"body textarea {",
				"  background: transparent !important;",
				"  caret-color: #fce300 !important;",
				"}",
				"[class*='_card']:has(textarea:focus) {",
				"  box-shadow: 0 0 0 1px rgba(252, 227, 0, 0.35), 0 0 18px rgba(252, 227, 0, 0.12) !important;",
				"}",
				"[class*='_backdrop'] { color: #e8f1ff !important; }",

				// send button: EXECUTE hint on hover
				"[class*='_row'] button[class*='_primary'] { position: relative; }",
				"[class*='_row'] button[class*='_primary']::after {",
				"  content: 'EXECUTE ⏎';",
				"  position: absolute; right: 0; bottom: calc(100% + 8px);",
				"  padding: 2px 8px; white-space: nowrap;",
				"  font: 600 10px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.18em;",
				"  color: #fce300; background: rgba(6,10,18,0.92); border: 1px solid rgba(252,227,0,0.35);",
				"  clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);",
				"  opacity: 0; transform: translateY(3px); transition: opacity .12s, transform .12s; pointer-events: none; z-index: 30;",
				"}",
				"[class*='_row'] button[class*='_primary']:hover::after { opacity: 1; transform: translateY(0); }",
				// RGB-split glitch, only on the EXECUTE button hover
				"[class*='_row'] button[class*='_primary']:hover {",
				"  text-shadow: -2px 0 rgba(255,0,60,0.9), 2px 0 rgba(0,240,255,0.9);",
				"}",

				// ── agent working: segmented HUD spinner + PROCESSING ────────
				"[class*='_pending'] {",
				"  width: 14px !important; height: 14px !important; border-radius: 50% !important;",
				"  background: conic-gradient(#00f0ff 0 25%, transparent 25% 50%, #fce300 50% 62%, transparent 62% 87%, #00f0ff 87% 100%) !important;",
				"  animation: cpSpin 1.1s steps(8) infinite !important;",
				"  filter: drop-shadow(0 0 5px rgba(0,240,255,0.6));",
				"}",
				"@keyframes cpSpin { to { transform: rotate(360deg); } }",
				"[class*='_accessory']:has([class*='_pending'])::after {",
				"  content: 'PROCESSING_';",
				"  font: 600 10px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.22em;",
				"  color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,0.5);",
				"  animation: cpBlink 1.2s steps(2) infinite;",
				"}",
				"@keyframes cpBlink { 50% { opacity: 0.45; } }",

				// ── combat state: stamina bar while the agent works ───────────
				"body.cp-working [class*='_accessory']:has([class*='_pending'])::before {",
				"  content: \"\"; display: block; margin: 3px 0 2px; width: 108px; height: 2px;",
				"  background-image: linear-gradient(90deg, transparent, #00f0ff 30%, #fce300 50%, #00f0ff 70%, transparent);",
				"  background-size: 200% 100%;",
				"  animation: cpStamina 1.6s linear infinite;",
				"}",
				"@keyframes cpStamina { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }",

				// ── sessions as shards: rarity cycling + legendary active ────
				"[class*='_sessionRow'] {",
				"  position: relative; border-radius: 2px !important;",
				"  border-left: 2px solid rgba(159,178,214,0.25);",
				"  transition: border-color .15s, filter .15s;",
				"}",
				"[class*='_sessionRow']:nth-child(5n+2) { border-left-color: rgba(61,255,190,0.4); }",
				"[class*='_sessionRow']:nth-child(5n+3) { border-left-color: rgba(0,240,255,0.4); }",
				"[class*='_sessionRow']:nth-child(5n+4) { border-left-color: rgba(190,80,255,0.4); }",
				"[class*='_sessionRow']:nth-child(5n+5) { border-left-color: rgba(255,140,0,0.45); }",
				"[class*='_sessionRow']:hover { filter: drop-shadow(0 0 4px rgba(0,240,255,0.25)); }",
				"[class*='_sessionRow'][class*='_selected'] {",
				"  border-left: 2px solid #ffb300 !important;",
				"  background: linear-gradient(90deg, rgba(252,227,0,0.10), rgba(252,227,0,0.02)) !important;",
				"  box-shadow: inset 0 0 12px rgba(252,227,0,0.06), 0 0 10px rgba(252,227,0,0.18);",
				"  filter: drop-shadow(0 0 6px rgba(255,179,0,0.35));",
				"}",

				// ── Kiroshi optics: hover = target lock (sweep + brackets) ───
				"[class*='_sessionRow']::before {",
				"  content: \"\"; position: absolute; left: 0; right: 0; top: 0; height: 1px; z-index: 6;",
				"  pointer-events: none; opacity: 0;",
				"  background: linear-gradient(90deg, transparent, rgba(0,240,255,0.85), transparent);",
				"}",
				"[class*='_sessionRow']:hover::before { animation: cpKiroshi 1.5s linear infinite; }",
				"@keyframes cpKiroshi { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }",
				"[class*='_sessionRow']:not([class*='_selected']):hover {",
				"  background-image:",
				"    linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)), linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)),",
				"    linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)), linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)),",
				"    linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)), linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)),",
				"    linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)), linear-gradient(rgba(0,240,255,0.75), rgba(0,240,255,0.75)) !important;",
				"  background-repeat: no-repeat;",
				"  background-size: 12px 2px, 2px 12px, 12px 2px, 2px 12px, 12px 2px, 2px 12px, 12px 2px, 2px 12px;",
				"  background-position: 0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%;",
				"}",

				// ── goal bar → mission tracker ────────────────────────────────
				"[class*='_dock'] {",
				"  border-left: 2px solid rgba(252,227,0,0.5) !important;",
				"  background: linear-gradient(90deg, rgba(252,227,0,0.05), transparent 65%) !important;",
				"}",
				"[class*='_dock'] [class*='_label'] {",
				"  font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif !important;",
				"  letter-spacing: 0.14em; color: #fce300 !important;",
				"}",
				"[class*='_dock'] [class*='_label']::before { content: '◈ '; color: #ffb300; }",

				// ── stats strip → HUD readout ────────────────────────────────
				"[class*='_strip'] {",
				"  font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei' !important;",
				"  letter-spacing: 0.08em; color: #8fa3c8 !important;",
				"}",
				"[class*='_strip']::before { content: '⟨ '; color: rgba(252,227,0,0.5); }",
				"[class*='_strip']::after { content: ' ⟩'; color: rgba(252,227,0,0.5); }",

				// ── notices / toasts → CP notification chrome ────────────────
				"[class*='_notice'], [class*='_toast'] {",
				"  position: relative;",
				"  border: 1px solid rgba(252,227,0,0.35) !important; border-left: 3px solid #fce300 !important;",
				"  background: linear-gradient(90deg, rgba(252,227,0,0.08), rgba(13,19,34,0.95)) !important;",
				"  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);",
				"  animation: cpToastIn .28s cubic-bezier(0.2, 0.9, 0.3, 1.2);",
				"}",
				"@keyframes cpToastIn {",
				"  0% { opacity: 0; transform: translateX(-14px); filter: drop-shadow(0 0 0 rgba(252,227,0,0)); }",
				"  35% { opacity: 1; filter: drop-shadow(0 0 10px rgba(252,227,0,0.5)); }",
				"  100% { opacity: 1; transform: translateX(0); }",
				"}",
				"[class*='_noticeError'] {",
				"  border-color: rgba(255,0,60,0.5) !important; border-left: 3px solid #ff003c !important;",
				"  background: linear-gradient(90deg, rgba(255,0,60,0.10), rgba(13,19,34,0.95)) !important;",
				"}",
				// hazard tape across the top of every error notice
				"[class*='_noticeError']::after {",
				"  content: \"\"; position: absolute; top: 0; left: 0; right: 0; height: 3px; pointer-events: none;",
				"  background: repeating-linear-gradient(-45deg, rgba(255,0,60,0.85) 0 6px, transparent 6px 12px);",
				"}",
				"[class*='_turnErrorTitle'] { color: #ff3b69 !important; font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif !important; letter-spacing: 0.08em; }",

				// ── empty-state flavor line ──────────────────────────────────
				"[class*='_composerHero']::after {",
				"  content: '— NIGHT CITY LOCAL // 2077 —';",
				"  display: block; margin-top: 10px;",
				"  font: 400 11px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.3em;",
				"  color: rgba(0,240,255,0.55);",
				"}",

				// ── glitching logo ────────────────────────────────────────────
				"@keyframes cpLogoGlitch {",
				"  0%, 86%, 100% { text-shadow: none; transform: none; }",
				"  88% { text-shadow: -2px 0 #ff003c, 2px 0 #00f0ff; transform: translateX(1px); }",
				"  90% { text-shadow: 2px 0 #ff003c, -2px 0 #00f0ff; transform: translateX(-1px); }",
				"  92% { text-shadow: none; transform: none; }",
				"  94% { text-shadow: -1px 0 #ff003c, 1px 0 #00f0ff; }",
				"  96% { text-shadow: none; }",
				"}",
				"[class*='logoRow'] {",
				"  font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  color: #fce300 !important;",
				"  letter-spacing: 0.04em;",
				"  text-shadow: 0 0 14px rgba(252, 227, 0, 0.35);",
				"  animation: cpLogoGlitch 5.5s infinite steps(1);",
				"}",
				"[class*='logoRow'] svg, [class*='logoRow'] path { color: #fce300; }",

				// headings
				"h1, h2, h3, h4 {",
				"  font-family: 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  letter-spacing: 0.03em;",
				"}",
				"h1, h2 { text-shadow: 0 0 12px rgba(0, 240, 255, 0.3), 0 0 30px rgba(252, 227, 0, 0.15); }",

				// sidebar chrome
				"[class*='sidebarCol'] { box-shadow: inset -1px 0 0 rgba(0, 240, 255, 0.10); }",
				"[class*='sidebarCol'] [class*='footArea'] { border-top: 1px solid rgba(252, 227, 0, 0.25); }",
				"[class*='sidebarCol'] [class*='railFish'], [class*='sidebarCol'] svg { color: #fce300; }",

				// details panel — HUD corner brackets
				"[class*='detailsCol'] { position: relative; }",
				"[class*='detailsCol']::after {",
				"  content: \"\"; position: absolute; top: 10px; right: 10px;",
				"  width: 16px; height: 16px; pointer-events: none;",
				"  border-top: 2px solid rgba(252, 227, 0, 0.6);",
				"  border-right: 2px solid rgba(252, 227, 0, 0.6);",
				"}",
				"[class*='detailsCol']::before {",
				"  content: \"\"; position: absolute; bottom: 10px; left: 10px;",
				"  width: 16px; height: 16px; pointer-events: none;",
				"  border-bottom: 2px solid rgba(0, 240, 255, 0.45);",
				"  border-left: 2px solid rgba(0, 240, 255, 0.45);",
				"}",

				// markdown
				"pre {",
				"  clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);",
				"  border-left: 2px solid rgba(0, 240, 255, 0.5);",
				"  background: #060a12 !important;",
				"  font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei' !important;",
				"}",
				"code { font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; color: #fcee0a; }",
				":not(pre) > code { background: rgba(252, 227, 0, 0.08); padding: 1px 5px; }",
				"blockquote { border-left: 2px solid rgba(252, 227, 0, 0.45); }",

				// selection / focus / forms
				"::selection { background: rgba(252, 227, 0, 0.30); color: #ffffff; }",
				":focus-visible { outline: 1px solid #00f0ff; outline-offset: 1px; box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.22); }",
				"input[type='checkbox'], input[type='radio'] { accent-color: #fce300; }",
				"a { color: #00f0ff; }",
				"a:hover { color: #fce300; }",

				// dialogs — hazard edge for confirmations
				"[role='dialog'], [role='alertdialog'] {",
				"  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);",
				"  border: 1px solid rgba(252, 227, 0, 0.22);",
				"}",

				// scrollbars
				"*::-webkit-scrollbar { width: 8px; height: 8px; }",
				"*::-webkit-scrollbar-track { background: transparent; }",
				"*::-webkit-scrollbar-thumb { background: rgba(252, 227, 0, 0.28) !important; border-radius: 0; }",
				"*::-webkit-scrollbar-thumb:hover { background: rgba(252, 227, 0, 0.5) !important; }",

				// ── slang status chips: GIG UP / PREEM. / FLATLINE / tips ─────
				"#cp2077-chip { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 10052;",
				"  max-width: min(64vw, 560px); padding: 4px 12px; pointer-events: none; text-align: center;",
				"  font: 600 11px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.16em;",
				"  background: rgba(6,10,18,0.92);",
				"  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);",
				"  animation: cpChipIn .22s cubic-bezier(0.2, 0.9, 0.3, 1.2); }",
				"#cp2077-chip.info { color: #00f0ff; box-shadow: inset 0 0 0 1px rgba(0,240,255,0.45), 0 0 12px rgba(0,240,255,0.18); }",
				"#cp2077-chip.ok { color: #00f5a0; box-shadow: inset 0 0 0 1px rgba(0,245,160,0.45), 0 0 12px rgba(0,245,160,0.18); }",
				"#cp2077-chip.err { color: #ff3b69; box-shadow: inset 0 0 0 1px rgba(255,0,60,0.5), 0 0 12px rgba(255,0,60,0.2); }",
				"@keyframes cpChipIn { 0% { opacity: 0; transform: translate(-50%, -6px); } 100% { opacity: 1; transform: translate(-50%, 0); } }",

				// ── Night City HUD footer (docked into the settings bar) ──────
				"#cp2077-hud { position: fixed; z-index: 10048; pointer-events: none; user-select: none;",
				"  display: flex; align-items: center; gap: 10px; white-space: nowrap;",
				"  transform: translateX(-100%);",
				"  font: 600 10px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; }",
				"#cp2077-hud #cp2077-clock { color: rgba(0,240,255,0.6); letter-spacing: 0.2em; text-shadow: 0 0 8px rgba(0,240,255,0.35); }",
				"#cp2077-hud #cp2077-hex { color: rgba(0,240,255,0.3); letter-spacing: 0.18em; }",
				"body.cp-off-scan #cp2077-hud #cp2077-hex { display: none; }",

				// ── easter egg: JOHNNY SILVERHAND seizes the screen ──────────
				"#cp2077-johnny { position: fixed; inset: 0; z-index: 2147483644; pointer-events: none;",
				"  animation: cpJohnnyOut 2.6s forwards; }",
				"#cp2077-johnny .cp2077-johnny-tint { position: absolute; inset: 0; backdrop-filter: saturate(0.35) contrast(1.18);",
				"  background: linear-gradient(90deg, rgba(255,0,60,0.16), transparent 30%, transparent 70%, rgba(0,240,255,0.16)); }",
				"#cp2077-johnny .cp2077-johnny-tear { position: absolute; inset: -10%; mix-blend-mode: screen;",
				"  background: repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 18px, rgba(255,0,60,0.06) 18px 20px, transparent 20px 44px);",
				"  animation: cpJohnnyTear 0.4s steps(4) infinite; }",
				"@keyframes cpJohnnyTear { 0% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 100% { transform: translateX(-8px); } }",
				"#cp2077-johnny .cp2077-johnny-box { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; text-align: center; }",
				"#cp2077-johnny .cp2077-johnny-quote { font: 700 clamp(26px, 4.4vw, 54px) 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  letter-spacing: 0.12em; color: #e8f1ff; text-shadow: -3px 0 rgba(255,0,60,0.8), 3px 0 rgba(0,240,255,0.8);",
				"  animation: cpJohnnyQuote 2.6s steps(1) forwards; }",
				"#cp2077-johnny .cp2077-johnny-cn { font: 400 clamp(11px, 1.4vw, 15px) 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  letter-spacing: 0.3em; color: rgba(159,178,214,0.85); }",
				"#cp2077-johnny .cp2077-johnny-attr { font: 600 10px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei';",
				"  letter-spacing: 0.26em; color: rgba(255,59,105,0.8); margin-top: 6px; }",
				"@keyframes cpJohnnyQuote {",
				"  0% { opacity: 0; } 6% { opacity: 1; transform: translateX(-5px) skewX(-2deg); }",
				"  10% { transform: translateX(5px) skewX(2deg); } 14% { transform: none; }",
				"  40% { transform: none; } 46% { transform: translateX(3px); } 50% { transform: none; }",
				"  84% { opacity: 1; } 100% { opacity: 0; } }",
				"@keyframes cpJohnnyOut { 0% { opacity: 0; } 6% { opacity: 1; } 86% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }",

				// ── DECK panel + SND chip chrome ─────────────────────────────
				"#cp2077-snd-toggle, #cp2077-deck-toggle { position: fixed; right: 14px; z-index: 10050; padding: 4px 10px;",
				"  font: 600 11px 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.14em; color: #fce300;",
				"  background: rgba(6, 10, 18, 0.85); border: 1px solid rgba(252, 227, 0, 0.35); cursor: pointer; opacity: 0.55;",
				"  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); }",
				"#cp2077-snd-toggle:hover, #cp2077-deck-toggle:hover { opacity: 1; filter: drop-shadow(0 0 6px rgba(252, 227, 0, 0.45)); }",
				"#cp2077-snd-toggle { bottom: 14px; }",
				"#cp2077-deck-toggle { bottom: 44px; color: #00f0ff; border-color: rgba(0, 240, 255, 0.35); }",
				"#cp2077-deck-toggle.cp2077-open { opacity: 1; }",
				"#cp2077-deck { position: fixed; right: 14px; bottom: 76px; z-index: 10049; width: 176px; padding: 10px;",
				"  background: rgba(6, 10, 18, 0.94); border: 1px solid rgba(0, 240, 255, 0.3);",
				"  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);",
				"  display: none; flex-direction: column; gap: 4px;",
				"  box-shadow: 0 0 18px rgba(0, 240, 255, 0.12); }",
				"#cp2077-deck.cp2077-open { display: flex; }",
				"#cp2077-deck .cp2077-deck-title { font: 700 11px 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif; letter-spacing: 0.3em;",
				"  color: #00f0ff; margin-bottom: 6px; padding-bottom: 5px;",
				"  background: repeating-linear-gradient(-45deg, rgba(0,240,255,0.4) 0 5px, transparent 5px 10px) bottom / 100% 3px no-repeat; }",
				"#cp2077-deck button { width: 100%; text-align: left; padding: 5px 8px; font: 600 11px 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  letter-spacing: 0.1em; color: #9fb2d6; background: transparent; border: none; cursor: pointer;",
				"  clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px); }",
				"#cp2077-deck button:hover { color: #e8f1ff; background: rgba(0, 240, 255, 0.08); filter: none; }",
				"#cp2077-deck button.cp2077-on { color: #fce300; }",

				// ── relic interference flicker (ambient, toggle: relic) ──────
				"#cp2077-relic { position: fixed; inset: 0; z-index: 2147483640; pointer-events: none;",
				"  background: linear-gradient(0deg, rgba(255,0,60,0.05), transparent 30%, transparent 70%, rgba(0,240,255,0.05)),",
				"    repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 9px);",
				"  mix-blend-mode: screen; animation: cpRelic .22s steps(3); }",
				"@keyframes cpRelic {",
				"  0% { transform: translateX(-3px) skewX(-0.4deg); filter: hue-rotate(25deg); }",
				"  50% { transform: translateX(3px) skewX(0.4deg); filter: hue-rotate(-30deg) saturate(1.6); }",
				"  100% { transform: none; filter: none; } }",
				"body.cp-off-relic #cp2077-relic { display: none; }",
				"@media (prefers-reduced-motion: reduce) { #cp2077-relic { display: none; } }",

				// ── easter egg: WAKE UP SAMURAI ─────────────────────────────
				"#cp2077-wake { position: fixed; inset: 0; z-index: 2147483645; background: #05070d;",
				"  pointer-events: none; display: grid; place-content: center; gap: 8px;",
				"  animation: cpWakeIn 2s forwards; }",
				"#cp2077-wake .cp2077-wake-line1 { font: 700 clamp(30px, 5vw, 64px) 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif;",
				"  letter-spacing: 0.14em; color: #fce300; text-shadow: -3px 0 #ff003c, 3px 0 #00f0ff; }",
				"#cp2077-wake .cp2077-wake-line2 { font: 400 clamp(12px, 1.6vw, 18px) 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei';",
				"  letter-spacing: 0.3em; color: #00f0ff; }",
				"@keyframes cpWakeIn {",
				"  0% { opacity: 0; transform: scaleY(0.02); }",
				"  8% { opacity: 1; transform: scaleY(1); }",
				"  12% { transform: translateX(-6px) skewX(-2deg); }",
				"  14% { transform: translateX(6px) skewX(2deg); }",
				"  16% { transform: none; }",
				"  30% { opacity: 1; } 88% { opacity: 1; }",
				"  100% { opacity: 0; visibility: hidden; } }",

				// ── boot transition ──────────────────────────────────────────
				"#cp2077-boot { position: fixed; inset: 0; z-index: 2147483646; background: #05070d;",
				"  pointer-events: none; animation: cpBootFade 2s forwards; }",
				"#cp2077-boot .cp-line { position: absolute; top: 50%; left: 0; right: 0; height: 2px; transform: translateY(-50%);",
				"  background: linear-gradient(90deg, transparent, #00f0ff 18%, #fff 50%, #00f0ff 82%, transparent);",
				"  box-shadow: 0 0 26px 3px rgba(0, 240, 255, 0.75); animation: cpBootLine 0.7s cubic-bezier(0.2, 0.75, 0.3, 1) forwards; }",
				"#cp2077-boot .cp-crt { position: absolute; inset: 0;",
				"  background: radial-gradient(58% 78% at 50% 50%, rgba(0, 240, 255, 0.14), transparent 72%);",
				"  clip-path: inset(49.9% 0 49.9% 0); animation: cpBootCrt 0.8s cubic-bezier(0.2, 0.8, 0.25, 1) forwards; }",
				"#cp2077-boot .cp-bars { position: absolute; inset: -15%; mix-blend-mode: screen; animation: cpBootBars 1s steps(7) forwards;",
				"  background: repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.10) 0 2px, transparent 2px 26px, rgba(255, 0, 60, 0.09) 26px 27px, transparent 27px 53px); }",
				"#cp2077-boot .cp-title { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); white-space: nowrap;",
				"  font: 700 clamp(34px, 6vw, 72px) 'MiSans', 'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif; letter-spacing: 0.16em; color: #fce300;",
				"  animation: cpBootTitle 1.5s steps(1) forwards; }",
				"#cp2077-boot .cp-sub { position: absolute; left: 50%; top: 56%; transform: translate(-50%, -50%);",
				"  font: 400 clamp(10px, 1.3vw, 14px) 'SF Mono', 'JetBrains Mono', Consolas, 'Liberation Mono', Menlo, 'PingFang SC', 'Microsoft YaHei'; letter-spacing: 0.34em; color: #00f0ff;",
				"  opacity: 0; animation: cpBootSub 1.5s ease-out forwards; }",
				"#cp2077-boot .cp-flash { position: absolute; inset: 0; background: #fff; opacity: 0; mix-blend-mode: screen; animation: cpBootFlash 2s forwards; }",
				"@keyframes cpBootFade { 0% { opacity: 0; } 3% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }",
				"@keyframes cpBootLine { 0% { transform: translateY(-50%) scaleX(0.02); opacity: 1; } 45% { transform: translateY(-50%) scaleX(1); opacity: 1; } 100% { transform: translateY(-50%) scaleX(1); opacity: 0; } }",
				"@keyframes cpBootCrt { 0% { clip-path: inset(49.9% 0 49.9% 0); opacity: 1; } 70% { opacity: 0.8; } 100% { clip-path: inset(0 0 0 0); opacity: 0; } }",
				"@keyframes cpBootBars { 0% { transform: translateY(-5%); opacity: 1; } 70% { opacity: 0.7; } 100% { transform: translateY(5%); opacity: 0; } }",
				"@keyframes cpBootTitle { 0% { opacity: 0; } 10% { opacity: 1; transform: translate(-50%, -50%) skewX(0); }",
				"  14% { opacity: 1; transform: translate(-49%, -50%) skewX(-6deg); text-shadow: -3px 0 #ff003c, 3px 0 #00f0ff; }",
				"  18% { transform: translate(-51%, -50%) skewX(4deg); text-shadow: 3px 0 #ff003c, -3px 0 #00f0ff; }",
				"  22% { transform: translate(-50%, -50%) skewX(0); text-shadow: 0 0 18px rgba(252, 227, 0, 0.45); }",
				"  55% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; letter-spacing: 0.34em; } }",
				"@keyframes cpBootSub { 0% { opacity: 0; letter-spacing: 0.1em; } 25% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; letter-spacing: 0.4em; } }",
				"@keyframes cpBootFlash { 0%, 68% { opacity: 0; } 73% { opacity: 0.85; } 77% { opacity: 0.1; } 80% { opacity: 0.5; } 84%, 100% { opacity: 0; } }",
				"@media (prefers-reduced-motion: reduce) { #cp2077-boot { display: none; } }",

				// ── perf guards: small screens go lean, reduced motion goes still ──
				"@media (max-width: 768px) {",
				"  #root::after, #cp2077-hud, #cp2077-chip { display: none; }",
				"  button[class*='primary'], button[class*='newSession'] { animation: none; }",
				"  [class*='_sessionRow']:hover::before { animation: none; }",
				"}",
				"@media (prefers-reduced-motion: reduce) {",
				"  button[class*='primary'], button[class*='newSession'], [class*='logoRow'] { animation: none !important; }",
				"  [class*='_sessionRow']:hover::before { animation: none !important; }",
				"  body.cp-working [class*='_accessory']:has([class*='_pending'])::before { animation: none !important; }",
				"  [class*='_accessory']:has([class*='_pending'])::after { animation: none !important; }",
				"  #cp2077-hud #cp2077-hex, #cp2077-chip { display: none !important; }",
				"}"
			].join("\n");
			(document.head || document.documentElement).appendChild(style);
		}

		// Browser plugin: register/focus the theme, force dark chroma, wire
		// every subsystem (SFX, watchers, deck, relic, tab identity, boot).
		function apply(ctx) {
			ctx.effect(() => {
				document.documentElement.style.colorScheme = "dark";
				document.body.toggleAttribute("data-ds-dark-theme", true);
				loadCfg();
				applyCfgToBody();
				injectCyberpunkStyles();
				playBootTransition();
				ensureSndChip();
				ensureDeckPanel();
				document.addEventListener("keydown", onKeydown, true);
				const stopPending = startPendingPoll();
				const stopNotices = startNoticeObserver();
				const stopRelic = startRelicLoop();
				const stopWake = startTriggerWatcher();
				const stopTitle = applyTabIdentity();
				const stopClock = startHudFooter();
				// Keep dark chroma even if the theme service later resolves the
				// preference to a light scheme and flips the attribute off.
				const observer = new MutationObserver(() => {
					document.documentElement.style.colorScheme = "dark";
					document.body.toggleAttribute("data-ds-dark-theme", true);
				});
				observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
				try {
					ctx.theme.register({
						id: THEME_ID,
						colorScheme: "dark",
						tokens: TOKENS
					});
					ctx.theme.setTheme(THEME_ID);
				} catch (e) {
					console.error("dsh-theme-cyberpunk2077 theme register failed", e);
				}
				return () => {
					observer.disconnect();
					document.removeEventListener("keydown", onKeydown, true);
					stopPending();
					stopNotices();
					stopRelic();
					stopWake();
					stopTitle();
					stopClock();
				};
			}, "dsh-theme-cyberpunk2077: register");
		}

		exports.isPlugin = true;
		exports.inject = ["theme"];
		exports.apply = apply;

	return module.exports;
}
const CYBERPUNK_THEME = cyberpunkThemeFactory();
THEMES.push({ id: CYBERPUNK_THEME.THEME_ID || "cyberpunk2077", name: "Cyberpunk 2077", apply: CYBERPUNK_THEME.apply });


// ════════════════════ client/themes/matrix.js ════════════════════

// ═══ VENDORED-STYLE MODULE: ENHANCED theme (formerly "Matrix") ═════
// Original work for dsh-enhanced (no upstream): phosphor-green terminal
// look over the app's token system + a canvas digital-rain of katakana/
// ASCII glyphs ("ASCII background shader") shimmering over the UI at low
// alpha, plus CRT scanlines/vignette. Registration contract mirrors the
// vendored cyberpunk theme exactly: apply(ctx) -> ctx.effect(...) ->
// ctx.theme.register({id,colorScheme,tokens}) + setTheme. Theme switches
// reload the page, so the disposer mostly matters for hot updates.
// Palette v2: near-black page ramp, popping phosphor accents, heavier
// modal scrims + borders (user ask: deep blacks, high contrast panels).
function matrixThemeFactory() {
	const THEME_ID = "enhanced";

	const TOKENS = {

			"--dsw-alias-bg-base": "#000000",
			"--dsw-alias-bg-layer-1": "rgba(1, 10, 5, 0.86)",
			"--dsw-alias-bg-layer-2": "rgba(2, 14, 7, 0.58)",
			"--dsw-alias-bg-layer-3": "#071f10",
			"--dsw-alias-bg-overlay": "rgba(6, 26, 13, 0.82)",
			"--dsw-alias-bg-module-platform": "#010603",
			"--dsw-alias-bg-multi-select": "#051c0d",
			"--dsw-alias-bg-skeleton": "rgba(0, 255, 65, 0.06)",
			"--dsw-mask-blur": "blur(6px)",
			"--dsw-shadow-lv3": "inset 2px 2px 3px -2px rgba(255,255,255,0.30), inset -2px -2px 3px -2px rgba(255,255,255,0.22), inset 0 0 3px 1px rgba(255,255,255,0.14), 0 0 64px rgba(0,255,65,0.14), 0 24px 56px rgba(0,0,0,0.62)",
			"--dsw-alias-bg-mask-1": "rgba(0, 0, 0, 0.84)",
			"--dsw-alias-bg-mask-2": "rgba(0, 0, 0, 0.5)",
			"--dsw-alias-bg-mask-3": "rgba(0, 0, 0, 0.84)",
			"--dsw-alias-bg-mask-photo": "rgba(0, 0, 0, 0.92)",
			"--dsw-alias-bg-mask-drop": "rgba(1, 5, 2, 0.8)",
			"--dsw-alias-label-primary": "#dcffe4",
			"--dsw-alias-label-secondary": "#8affab",
			"--dsw-alias-label-tertiary": "#79c288",
			"--dsw-alias-label-caption": "#9fe8b0",
			"--dsw-alias-label-dimmed": "#5f9269",
			"--dsw-alias-label-primary-bluish": "#dcffe4",
			"--dsw-alias-label-primary-dimmed": "#dafde1",
			"--dsw-alias-label-primary-foreground": "#02180a",
			"--dsw-alias-label-primary-inverted": "#02180a",
			"--dsw-alias-brand-primary": "#00ff41",
			"--dsw-alias-brand-text": "#00ff41",
			"--dsw-alias-brand-primary-invert": "#01180a",
			"--dsw-alias-button-primary-fill": "#00ff41",
			"--dsw-alias-button-primary-hover": "#5cff85",
			"--dsw-alias-button-primary-dimmed": "rgba(0, 255, 65, 0.14)",
			"--dsw-alias-button-contrast-fill": "#dcffe4",
			"--dsw-alias-button-elevated-fill": "#03140a",
			"--dsw-alias-button-floating-fill": "#04180c",
			"--dsw-alias-button-floating-hover": "#072310",
			"--dsw-alias-button-ghost-active-fill": "#06200f",
			"--dsw-alias-button-ghost-active-hover": "#0b3016",
			"--dsw-alias-button-info-fill": "#00e63a",
			"--dsw-alias-button-info-hover": "#39ff14",
			"--dsw-alias-button-tool-bar-fill-invisible": "rgba(0, 255, 65, 0.08)",
			"--dsw-alias-button-tool-bar-fill": "rgba(0, 255, 65, 0.15)",
			"--dsw-alias-button-tool-bar-hover": "rgba(0, 255, 65, 0.24)",
			"--dsw-alias-button-ghost-active-border": "#39ff14",
			"--dsw-alias-interactive-bg-hover": "rgba(0, 255, 65, 0.10)",
			"--dsw-alias-interactive-bg-active": "rgba(0, 255, 65, 0.17)",
			"--dsw-alias-interactive-bg-hover-accent": "rgba(0, 255, 65, 0.15)",
			"--dsw-alias-interactive-bg-hover-danger": "rgba(255, 0, 60, 0.14)",
			"--dsw-alias-interactive-bg-hover-solid": "#0a2413",
			"--dsw-alias-border-l1": "rgba(0, 255, 65, 0.18)",
			"--dsw-alias-border-l2": "rgba(0, 255, 65, 0.38)",
			"--dsw-alias-border-l2-darkmode-thin": "rgba(0, 255, 65, 0.12)",
			"--dsw-alias-border-l3": "rgba(0, 255, 65, 0.38)",
			"--dsw-alias-border-l4": "rgba(0, 255, 65, 0.55)",
			"--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.18)",
			"--dsw-alias-border-inverted2": "rgba(255, 255, 255, 0.25)",
			"--dsw-alias-state-business-primary": "#39ff14",
			"--dsw-alias-state-business-tertiary": "#0d3a17",
			"--dsw-alias-state-error-primary": "#ff003c",
			"--dsw-alias-state-error-secondary": "#ff3b69",
			"--dsw-alias-state-success-primary": "#00f53c",
			"--dsw-alias-state-success-secondary": "#6bff92",
			"--dsw-alias-state-success-tertiary": "#062c0e",
			"--dsw-alias-state-warn-label": "#6bff8d",
			"--dsw-alias-state-warn-primary": "#39ff14",
			"--dsw-alias-state-warn-secondary": "#6bff8d",
			"--dsw-alias-state-warn-tertiary": "#03330e",
			"--dsw-alias-markdown-code-block": "#010502",
			"--dsw-alias-markdown-code-block-banner": "#031207",
			"--dsw-alias-markdown-inline-code": "#0a2413",
			"--dsw-alias-markdown-placeholder": "#020c05",
			"--dsw-alias-markdown-tag": "#08200f",
			"--dsw-alias-markdown-citation": "#071d0d",
			"--dsw-alias-markdown-code-segment-selected": "#0a2413",
			"--dsw-alias-markdown-code-segment-unselected": "#021007",
			"--dsw-alias-scrollbar-bg-l1": "rgba(0, 255, 65, 0.38)",
			"--dsw-alias-scrollbar-bg-l2": "rgba(0, 255, 65, 0.36)",
			"--dsw-alias-scrollbar-hover-l1": "rgba(0, 255, 65, 0.52)",
			"--dsw-alias-scrollbar-hover-l2": "rgba(0, 255, 65, 0.60)",
			"--dsw-alias-toast-bg": "rgba(2, 14, 7, 0.85)",
			"--dsw-alias-tooltip-bg": "rgba(5, 22, 11, 0.74)",
			"--dsw-specific-bubble": "rgba(1, 10, 5, 0.92)",
			"--dsw-specific-bubble-highlight": "#0d2a16",
			"--dsw-specific-input-major": "#000000",
			"--dsw-specific-login-input": "#000000",
			"--dsw-specific-menu": "rgba(3, 17, 8, 0.70)",
			"--dsw-specific-selector": "rgba(2, 14, 7, 0.90)",
			"--dsw-hovercard-bg": "rgba(3, 17, 8, 0.70)",
			"--dsw-specific-tip": "#081f0e",
			"--dsw-specific-sidebar-fill": "rgba(0, 6, 3, 0.72)",
			"--dsw-specific-sidebar-nav-item-active": "#0d2312",
			"--dsw-specific-sidebar-nav-item-active-accent": "#00ff41",
			"--dsw-specific-sidebar-nav-item-hover": "#0b1e0e",
			"--dsw-static-neutral-bluish-00": "#000000",
			"--dsw-static-neutral-bluish-1000": "#dcffe4",
			"--dsw-static-neutral-bluish-100": "#021007",
			"--dsw-static-neutral-bluish-200": "#04180c",
			"--dsw-static-neutral-bluish-300": "#071f10",
			"--dsw-static-neutral-bluish-400": "#8affab",
			"--dsw-static-neutral-bluish-50": "#021007",
			"--dsw-static-neutral-bluish-500": "#79c288",
			"--dsw-static-neutral-bluish-600": "#5f9269",
			"--dsw-static-neutral-bluish-700": "#3f7149",
			"--dsw-static-neutral-bluish-750": "#275430",
			"--dsw-static-neutral-bluish-75": "#04180c",
			"--dsw-static-neutral-bluish-800": "#0d3118",
			"--dsw-static-neutral-bluish-850": "#092310",
			"--dsw-static-neutral-bluish-875": "#05170c",
			"--dsw-static-neutral-bluish-900": "#020b06",
			"--dsw-static-neutral-bluish-950": "#010603",
			"--dsw-static-neutral-bluish-60": "#021007",
			"--dsw-static-deepseek-400": "#39ff14",
			"--dsw-static-deepseek-450": "#1bff52",
			"--dsw-static-deepseek-500": "#00f53c",
			"--dsw-static-deepseek-600": "#00cc32",
			"--dsw-static-deepseek-700-delete": "#0a7a20",
			"--dsw-static-deepseek-800": "#0a5c1a",
			"--dsw-static-deepseek-900": "#094314",
			"--dsw-static-deepseek-100": "#10401d",
			"--dsw-static-deepseek-200": "#0e4a1d",
			"--dsw-static-deepseek-300": "#175c24",
			"--dsw-static-deepseek-50": "#04180c",
			"--dsw-static-blue-400": "#39ff14",
			"--dsw-static-blue-450": "#1bff52",
			"--dsw-static-blue-500": "#00e63a",
			"--dsw-static-blue-600": "#00cc32",
			"--dsw-static-blue-800": "#0a7a20",
			"--dsw-static-blue-900": "#0a5c1a",
			"--dsw-static-blue-950": "#094314",
			"--dsw-static-blue-100": "#114520",
			"--dsw-static-blue-300": "#66ff99",
			"--dsw-static-blue-50": "#04180c",
			"--dsw-static-blue-75": "#06200f",
			"--dsw-static-blue-50p": "#051c0d",
			"--dsw-static-green-400": "#6bff92",
			"--dsw-static-green-500": "#00f53c",
			"--dsw-static-green-100": "#062c0e",
			"--dsw-static-green-900": "#043310",
			"--dsw-static-red-400": "#ff3b69",
			"--dsw-static-red-500": "#ff003c",
			"--dsw-static-red-600": "#ff003c",
			"--dsw-static-red-100": "#3a1020",
			"--dsw-static-red-50": "#2b0e1a",
			"--dsw-static-red-900": "#4b0d1c",
			"--dsw-static-amber-400": "#6bff8d",
			"--dsw-static-amber-500": "#39ff14",
			"--dsw-static-amber-600": "#39ff14",
			"--dsw-static-amber-100": "#03330e",
			"--dsw-static-amber-900": "#02290a",
	};

	// ── digital rain ────────────────────────────────────────────────────
	// ponytail: single full-screen canvas ABOVE the UI (screen-blend at 9%
	// alpha) instead of threading translucency through every surface token
	// — readable text for free, classic code-fall look. Upgrade path if it
	// ever feels like a sticker: split bg-base tokens to rgba and drop the
	// canvas behind the app root.
	function startRain(reducedMotion) {
		const canvas = document.createElement("canvas");
		canvas.id = "dshx-matrix-rain";
		canvas.setAttribute("aria-hidden", "true");
		document.body.appendChild(canvas);
		const g2d = canvas.getContext("2d");
		if (g2d === null) {
			canvas.remove();
			return () => {};
		}
		const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789<>[]{}=+*#$@%".split("");
		const FS = 15;
		let cols = [];
		let w = 0;
		let h = 0;
		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			w = window.innerWidth;
			h = window.innerHeight;
			canvas.width = Math.floor(w * dpr);
			canvas.height = Math.floor(h * dpr);
			g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
			g2d.fillStyle = "#020602";
			g2d.fillRect(0, 0, w, h);
			g2d.font = `${FS}px ui-monospace, Menlo, Consolas, monospace`;
			g2d.textBaseline = "top";
			cols = Array.from({ length: Math.ceil(w / FS) }, () => ({
				y: Math.floor((Math.random() * h) / FS),
				v: 0.6 + Math.random() * 1.3,
				bright: Math.random() < 0.14,
				trail: Array.from({ length: 3 + ((Math.random() * 9) | 0) }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]),
			}));
		};
		resize();
		window.addEventListener("resize", resize);

		const drawCell = (x, y, ch, color) => {
			g2d.fillStyle = color;
			g2d.fillText(ch, x * FS, y * FS);
		};
		const step = () => {
			for (let i = 0; i < cols.length; i++) {
				const c = cols[i];
				c.y += c.v >= Math.random() + 0.5 ? 1 : 0; // uneven speeds
				if (c.y * FS > h + 40) {
					c.y = -((Math.random() * 12) | 0);
					c.bright = Math.random() < 0.14;
				}
				const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
				drawCell(i, c.y, ch, c.bright ? "#d8ffdf" : "#00ff41");
				// ghost trail: dimmer glyphs one cell behind
				drawCell(i, Math.max(0, c.y - 1), c.trail[c.y % c.trail.length], "rgba(0, 220, 60, 0.45)");
				if (Math.random() < 0.25) c.trail[(c.y + 1) % c.trail.length] = ch;
			}
		};

		if (reducedMotion) {
			// One sparse static frame, no loop (prefers-reduced-motion).
			step();
			return () => {
				window.removeEventListener("resize", resize);
				canvas.remove();
			};
		}
		let last = 0;
		let alive = true;
		const frame = (t) => {
			if (!alive) return;
			requestAnimationFrame(frame);
			if (document.hidden || t - last < 66) return; // ~15fps strobe
			last = t;
			g2d.fillStyle = "rgba(2, 6, 2, 0.24)";
			g2d.fillRect(0, 0, w, h);
			step();
		};
		requestAnimationFrame(frame);
		return () => {
			alive = false;
			window.removeEventListener("resize", resize);
			canvas.remove();
		};
	}

	function startFx() {
		const style = document.createElement("style");
		style.id = "dshx-matrix-style";
		style.textContent =
			"#dshx-matrix-rain{position:fixed;inset:0;z-index:2147483646;pointer-events:none;" +
			"opacity:0.22;mix-blend-mode:screen}" +
			"#dshx-matrix-fx{position:fixed;inset:0;z-index:2147483646;pointer-events:none;opacity:0.10;" +
			"background:repeating-linear-gradient(0deg, rgba(0,255,65,0.5) 0 1px, transparent 1px 3px)," +
			"radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)}" +
			'[class*="menu" i],[class*="popover" i],[class*="tooltip" i],[class*="toast" i]{' +
			'box-shadow:inset 2px 2px 3px -2px rgba(255,255,255,.28),inset -2px -2px 3px -2px rgba(255,255,255,.18),inset 0 0 3px 1px rgba(255,255,255,.12),0 0 44px rgba(0,255,65,.10),0 16px 40px rgba(0,0,0,.55)}' +
			'body{text-shadow:0 0 8px rgba(0,255,65,.20)}' +
			// hover glow, mirror of the cyberpunk theme but in matrix phosphor green
			'button{transition:filter .15s,color .15s,background-color .15s}' +
			'button:hover{color:#7dff9b;filter:drop-shadow(0 0 6px rgba(0,255,65,.5))}' +
			"button[class*='primary']:hover,button[class*='add']:hover{color:#02180a!important;filter:drop-shadow(0 0 10px rgba(0,255,65,.6))}" +
			"button[class*='newSession']:hover{color:#39ff14!important;filter:drop-shadow(0 0 10px rgba(0,255,65,.6))}" +
			'button:active{transform:translateY(1px)}' +
			'button:disabled{filter:none}' +
			"[class*='_sessionRow']:hover{filter:drop-shadow(0 0 4px rgba(0,255,65,.30))}" +
			// session-hover preview window (HoverCard `._card_`): the app hardcodes a gray
			// --dsw-hovercard-bg on the element itself, so override the token to matrix green.
			"[class*='_card']{--dsw-hovercard-bg:rgba(2,14,7,.94)!important;background:var(--dsw-hovercard-bg)!important}" +
			// neon pulse: the same breathing-glow animation as cyberpunk's cpPulse, in matrix green
			'@keyframes mxPulse{0%,100%{filter:drop-shadow(0 0 3px rgba(0,255,65,.25))}50%{filter:drop-shadow(0 0 12px rgba(0,255,65,.55))}}' +
			"button[class*='primary'],button[class*='newSession']{animation:mxPulse 2.8s ease-in-out infinite}" +
			// Kiroshi target-lock: sweep + corner brackets on session hover (mirror of cyberpunk)
			"[class*='_sessionRow']{position:relative}" +
			"[class*='_sessionRow']::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;z-index:6;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(0,255,65,.85),transparent)}" +
			"[class*='_sessionRow']:hover::before{animation:mxKiroshi 1.5s linear infinite}" +
			'@keyframes mxKiroshi{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}' +
			"[class*='_sessionRow']:not([class*='_selected']):hover{background-image:" +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)) !important;" +
			'background-repeat:no-repeat;background-size:12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px;' +
			'background-position:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%}' +
			// Kiroshi target-lock on the New Session button too (parity with session rows)
			"button[class*='newSession']{position:relative}" +
			"button[class*='newSession']::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;z-index:6;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(0,255,65,.85),transparent)}" +
			"button[class*='newSession']:hover::before{animation:mxKiroshi 1.5s linear infinite}" +
			"button[class*='newSession']:hover{background-image:" +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)) !important;" +
			'background-repeat:no-repeat;background-size:12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px;' +
			'background-position:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%}' +
			// Kiroshi on settings dropdown menu items (parity with session rows):
			// scan (sweep) on hover, full lock (corner brackets) on the selected item.
			// The item is a <button class="_item_..."> nested in _itemWrap_; the selected
			// state adds _selected_19372_188 to that same button.
			"[class*='_submenu_'] button[class*='_item_']{position:relative}" +
			"[class*='_submenu_'] button[class*='_item_']::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;z-index:6;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(0,255,65,.85),transparent)}" +
			"[class*='_submenu_'] button[class*='_item_']:hover::before{animation:mxKiroshi 1.5s linear infinite}" +
			"[class*='_submenu_'] button[class*='_item_'][class*='_selected_']{background-image:" +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75))," +
			"linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)),linear-gradient(rgba(0,255,65,.75),rgba(0,255,65,.75)) !important;" +
			'background-repeat:no-repeat;background-size:12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px,12px 2px,2px 12px;' +
			'background-position:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%}' +
			// composer send: RUN hint slide-in + green glitch (mirror of cyberpunk EXECUTE)
			"[class*='_row'] button[class*='_primary']{position:relative}" +
			"[class*='_row'] button[class*='_primary']::after{content:'RUN \\23CE';position:absolute;right:0;bottom:calc(100% + 8px);padding:2px 8px;white-space:nowrap;" +
			"font:600 10px 'SF Mono','JetBrains Mono',Consolas,'Liberation Mono',Menlo,'PingFang SC','Microsoft YaHei';letter-spacing:.18em;" +
			'color:#7dff9b;background:rgba(1,8,4,.92);border:1px solid rgba(0,255,65,.35);' +
			'clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);' +
			'opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s;pointer-events:none;z-index:30}' +
			"[class*='_row'] button[class*='_primary']:hover::after{opacity:1;transform:translateY(0)}" +
			"[class*='_row'] button[class*='_primary']:hover{text-shadow:-2px 0 rgba(57,255,20,.9),2px 0 rgba(120,255,160,.9)}" +
			// links / scrollbar / selection / focus parity with cyberpunk
			'a{color:#39ff14}' +
			'a:hover{color:#7dff9b}' +
			'*::-webkit-scrollbar{width:8px;height:8px}' +
			'*::-webkit-scrollbar-track{background:transparent}' +
			"*::-webkit-scrollbar-thumb{background:rgba(0,255,65,.28)!important;border-radius:0}" +
			"*::-webkit-scrollbar-thumb:hover{background:rgba(0,255,65,.5)!important}" +
			'::selection{background:rgba(0,255,65,.30);color:#dcffe4}' +
			':focus-visible{outline:1px solid #39ff14;outline-offset:1px;box-shadow:0 0 0 3px rgba(0,255,65,.22)}' +
			"input[type='checkbox'],input[type='radio']{accent-color:#39ff14}" +
			'@keyframes dshx-crt{0%,100%{opacity:.10}50%{opacity:.135}}' +
			'#dshx-matrix-fx{animation:dshx-crt 3.4s steps(2,end) infinite}' +
			'[class*="dialog" i],[class*="menu" i],[class*="popover" i],[class*="tooltip" i],[class*="toast" i]{isolation:isolate}' +
			'[class*="dialog" i]::after,[class*="menu" i]::after,[class*="popover" i]::after,[class*="toast" i]::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;' +
			'-webkit-backdrop-filter:blur(6px) saturate(1.2);backdrop-filter:blur(6px) saturate(1.2);' +
			'-webkit-filter:url(#dshx-glass);filter:url(#dshx-glass);overflow:hidden;pointer-events:none}' +
			'[class*="tooltip" i]::after{filter:url(#dshx-glass-sm)}' +
			'body[data-ds-dark-theme] [class*="_boot_"]{--dsh-boot-bg:#000402;--dsh-boot-label-primary:#dcffe4;' +
			'--dsh-boot-label-secondary:#8affab;--dsh-boot-label-tertiary:#79c288;--dsh-boot-border:rgba(0,255,65,.18);--dsh-boot-brand:#39ff14}' +
			// ── boot intro (once per tab session): matrix "wake up" ──
			'#mx-boot{position:fixed;inset:0;z-index:2147483647;background:#000402;display:flex;' +
			'flex-direction:column;align-items:center;justify-content:center;gap:22px;overflow:hidden;' +
			"pointer-events:none;color:#39ff14;font:500 13px 'SF Mono','JetBrains Mono',Consolas,'Liberation Mono',Menlo,'PingFang SC','Microsoft YaHei';" +
			'animation:mxBootFade 2.6s forwards}' +
			'#mx-boot .mx-rain{position:absolute;inset:0;width:100%;height:100%;z-index:0}' +
			'#mx-boot .mx-ascii{position:relative;z-index:2;white-space:pre;font-family:"SF Mono","JetBrains Mono",Consolas,"Liberation Mono",Menlo,monospace;font-size:clamp(9px,1.6vw,15px);line-height:1.05;' +
			'text-shadow:0 0 6px rgba(0,255,65,.85),0 0 20px rgba(0,255,65,.4);opacity:0;animation:mxBootAscii .9s ease-out forwards}' +
			'#mx-boot .mx-sub{position:relative;z-index:2;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#7dff9b;' +
			'text-shadow:0 0 8px rgba(0,255,65,.6);opacity:0;animation:mxBootSub 1.5s ease-out .5s forwards}' +
			"#mx-boot .mx-line{position:absolute;z-index:1;left:0;right:0;top:0;height:2px;" +
			'background:linear-gradient(90deg,transparent,#39ff14,transparent);box-shadow:0 0 22px 3px rgba(0,255,65,.7);' +
			'animation:mxBootLine .8s cubic-bezier(.2,.75,.3,1) forwards}' +
			"#mx-boot .mx-scan{position:absolute;z-index:1;inset:0;background:repeating-linear-gradient(0deg,rgba(0,255,65,.08) 0 1px,transparent 1px 3px);" +
			'mix-blend-mode:screen;opacity:.55;animation:mxBootScan 2.4s linear forwards}' +
			"#mx-boot .mx-flash{position:absolute;z-index:3;inset:0;background:#bdffc9;opacity:0;mix-blend-mode:screen;animation:mxBootFlash 2.6s forwards}" +
			'@keyframes mxBootFade{0%{opacity:0}6%{opacity:1}78%{opacity:1}100%{opacity:0;visibility:hidden}}' +
			'@keyframes mxBootAscii{0%{opacity:0;filter:blur(7px)}100%{opacity:1;filter:blur(0)}}' +
			'@keyframes mxBootSub{0%{opacity:0;letter-spacing:.12em}30%{opacity:1}90%{opacity:1}100%{opacity:0;letter-spacing:.55em}}' +
			'@keyframes mxBootLine{0%{top:0;opacity:1}100%{top:100%;opacity:0}}' +
			'@keyframes mxBootScan{0%{transform:translateY(-100%);opacity:.8}100%{transform:translateY(100%);opacity:0}}' +
			'@keyframes mxBootFlash{0%,70%{opacity:0}75%{opacity:.5}80%{opacity:.06}84%,100%{opacity:0}}' +
			'@media (prefers-reduced-motion: reduce){ #mx-boot{display:none} }';
		const fx = document.createElement("div");
		fx.id = "dshx-matrix-fx";
		fx.setAttribute("aria-hidden", "true");
		document.head.appendChild(style);
		document.body.appendChild(fx);
		// True chromatic aberration: split R/G/B, shift wavelengths apart,
		// recomposite additively. sRGB interpolation keeps hues exact.
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "0");
		svg.setAttribute("height", "0");
		svg.style.position = "absolute";
		svg.innerHTML =
			'<defs>' +
			'<filter id="dshx-glass" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">' +
			'<feTurbulence type="fractalNoise" baseFrequency="0.006 0.006" numOctaves="1" seed="5" result="turbulence"/>' +
			'<feComponentTransfer in="turbulence" result="mapped"><feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5"/><feFuncG type="gamma" amplitude="0" exponent="1" offset="0"/><feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5"/></feComponentTransfer>' +
			'<feGaussianBlur in="turbulence" stdDeviation="3" result="softMap"/>' +
			'<feSpecularLighting in="softMap" surfaceScale="5" specularConstant="1" specularExponent="100" lighting-color="white" result="specLight"><fePointLight x="-200" y="-200" z="300"/></feSpecularLighting>' +
			'<feComposite in="specLight" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="softMap" scale="600" xChannelSelector="R" yChannelSelector="G"/>' +
			'</filter>' +
			'<filter id="dshx-glass-sm" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">' +
			'<feTurbulence type="fractalNoise" baseFrequency="0.015 0.015" numOctaves="1" seed="7" result="turbulence"/>' +
			'<feComponentTransfer in="turbulence" result="mapped"><feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5"/><feFuncG type="gamma" amplitude="0" exponent="1" offset="0"/><feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5"/></feComponentTransfer>' +
			'<feGaussianBlur in="turbulence" stdDeviation="2" result="softMap"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="softMap" scale="220" xChannelSelector="R" yChannelSelector="G"/>' +
			'</filter></defs>';
		document.body.appendChild(svg);
		return () => {
			style.remove();
			fx.remove();
			svg.remove();
		};
	}

	// ── tab favicon: dedicated matrix-green glyph (mirrors cyberpunk's takeover) ──
	function applyMatrixFavicon() {
		try {
			const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 88 56'>"
				+ "<rect width='88' height='56' rx='12' fill='#000402'/>"
				+ "<text x='44' y='14' text-anchor='middle' font-family='monospace' font-size='11' fill='#39ff14' font-weight='bold'>"
				+ "<tspan x='44' dy='0'>.---.</tspan>"
				+ "<tspan x='44' dy='9'>/     \\</tspan>"
				+ "<tspan x='44' dy='9'>|   O   |</tspan>"
				+ "<tspan x='44' dy='9'>\\     /</tspan>"
				+ "<tspan x='44' dy='9'> '---' </tspan>"
				+ "</text></svg>";
			const href = "data:image/svg+xml," + encodeURIComponent(svg);
			let link = document.querySelector("link[rel*='icon']");
			if (link === null) {
				link = document.createElement("link");
				link.rel = "icon";
				(document.head || document.documentElement).appendChild(link);
			}
			link.href = href;
		} catch {}
	}

		// ── boot intro: matrix "wake up" (once per tab session, mirrors cyberpunk) ──
		function playMatrixBoot() {
			if (document.getElementById("mx-boot") !== null) return null;
			if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
			const ART = [
				"EEEEE  N   N  H   H    A    N   N  CCCCC  EEEEE  DDDD ",
				"E      NN  N  H   H   A A   NN  N  C      E      D   D",
				"EEEE   N N N  HHHHH  A   A  N N N  C      EEEE   D   D",
				"E      N  NN  H   H  AAAAA  N  NN  C      E      D   D",
				"EEEEE  N   N  H   H  A   A  N   N  CCCCC  EEEEE  DDDD "
			].join("\n");
			const ov = document.createElement("div");
			ov.id = "mx-boot";
			ov.setAttribute("aria-hidden", "true");
			const mk = (cls, text) => {
				const d = document.createElement("div");
				d.className = cls;
				if (text !== undefined) d.textContent = text;
				return d;
			};
			const cv = document.createElement("canvas");
			cv.className = "mx-rain";
			const pre = document.createElement("pre");
			pre.className = "mx-ascii";
			pre.textContent = ART;
			ov.append(cv, mk("mx-line"), mk("mx-scan"), pre, mk("mx-sub", "WAKE UP, NEO...  >>  DSH ENHANCED OS ONLINE"), mk("mx-flash"));
			(document.body || document.documentElement).appendChild(ov);
			// katakana digital-rain canvas (the "code"), torn down with the overlay
			let raf = 0;
			let dead = false;
			const stop = () => { dead = true; cancelAnimationFrame(raf); };
			const g = cv.getContext("2d");
			if (g !== null) {
				const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789".split("");
				const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
				const FS = 16;
				let w = 0, h = 0;
				const resize = () => {
					w = window.innerWidth; h = window.innerHeight;
					cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
					g.setTransform(dpr, 0, 0, dpr, 0, 0);
				};
				resize();
				const cols = Array.from({ length: Math.ceil(w / FS) }, () => ({ y: (Math.random() * h) / FS, v: 0.5 + Math.random() * 1.3 }));
				const draw = () => {
					g.fillStyle = "rgba(0,4,2,0.16)";
					g.fillRect(0, 0, w, h);
					g.font = FS + "px ui-monospace, Menlo, Consolas, monospace";
					g.textBaseline = "top";
					for (let i = 0; i < cols.length; i++) {
						const c = cols[i];
						g.fillStyle = Math.random() < 0.12 ? "#d8ffdf" : "#00ff41";
						g.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * FS, c.y * FS);
						c.y += c.v;
						if (c.y * FS > h + 20) c.y = -Math.random() * 20;
					}
					if (!dead) raf = requestAnimationFrame(draw);
				};
				draw();
			}
			setTimeout(() => { stop(); ov.remove(); }, 2700);
			return ov;
		}

	function apply(ctx) {
		ctx.effect(() => {
			const stopFx = startFx();
			const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
			const stopRain = startRain(reduced);
			applyMatrixFavicon();
			playMatrixBoot();
			// Keep dark chroma even if the theme service later flips the attr.
			const observer = new MutationObserver(() => {
				document.documentElement.style.colorScheme = "dark";
				document.body.toggleAttribute("data-ds-dark-theme", true);
			});
			observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
			try {
				ctx.theme.register({
					id: THEME_ID,
					colorScheme: "dark",
					tokens: TOKENS
				});
				ctx.theme.setTheme(THEME_ID);
			} catch (e) {
				console.error("[dsh-enhanced] matrix theme register failed", e);
			}
			return () => {
				observer.disconnect();
				stopRain();
				stopFx();
			};
		}, "dsh-enhanced: matrix theme");
	}

	return { THEME_ID, isPlugin: true, inject: ["theme"], apply };
}
const MATRIX_THEME = matrixThemeFactory();
THEMES.push({ id: MATRIX_THEME.THEME_ID || "enhanced", name: "ENHANCED", apply: MATRIX_THEME.apply });


// ════════════════════ client/sections/theme.js ════════════════════

// Theme section: pick the card's look — Default or a vendored theme from
// themes/*.js. Draft slice: theme (string | undefined).
//
// Commit model: Save stores the choice in localStorage and reloads the page;
// on boot main.js applies whatever is stored. A uniform save+reload keeps
// enable and disable symmetric — no half-removed style sheets, no need to
// know the host UI's default-theme id. Registered LAST among save steps so
// the reload happens only after every other staged op has been replayed.
DRAFT_SHAPES.push(() => ({ theme: undefined }));
DIRTY_CHECKS.push((d) => d.theme != null);

SAVE_STEPS.push(async (call, rem) => {
	if (rem.theme != null) {
		try {
			localStorage.setItem(THEME_KEY, rem.theme);
		} catch {}
		location.reload();
	}
});

function ThemeSection(p) {
	const [openSec, setOpenSec] = React.useState(true);
	const [current] = React.useState(readStoredTheme);

	const { draft } = p;
	const chosen = draft.theme != null ? draft.theme : current;

	return [
		e("div", { key: "th-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Theme", null, openSec, () => setOpenSec(!openSec)),
			draft.theme != null && draft.theme !== current ? e("span", { style: css.chip }, "unsaved") : null),
		openSec ? [
			e("p", { key: "th-note", style: css.note },
				"Applied on Save · switching reloads the page · vendored themes ship inside this plugin"),
			e("div", { key: "th-row", style: Object.assign({}, css.row, { alignItems: "center" }) },
				THEMES.map((t) =>
					e("label", { key: t.id, style: Object.assign({}, css.checkRow, { paddingBottom: 0, fontSize: "13px", color: SECONDARY }) },
						e("input", {
							type: "radio",
							name: "dshx-theme",
							className: "dshx-check",
							checked: chosen === t.id,
							disabled: p.busy,
							onChange: () => p.patch(Object.assign({}, draft, { theme: t.id })),
						}),
						t.name,
						current === t.id ? e("span", { style: css.muted }, "  · active") : null))),
		] : null,
	];
}

SECTIONS.push(ThemeSection);


// ════════════════════ client/main.js ════════════════════

// Boot module: plugin registration + saved-theme activation. This file also
// CLOSES the ModuleLoader factory opened in core.js.
//
// Theme activation reads localStorage (dshx.theme) and applies the vendored
// theme through its apply(ctx). The vendored plugin expects ctx.theme, so we
// lend it the theme service on a prototype-linked context — no cloning of
// live Cordis objects — and its internal ctx.effect() call still ties every
// side effect to THIS plugin's fiber (stop/update cleans up automatically).

function applyThemeWith(ctx, themeService, id) {
	const t = THEMES.find((x) => x.id === id);
	if (!t || typeof t.apply !== "function") return;
	if (!themeService || typeof themeService.register !== "function") return;
	// Lend the theme service to the vendored plugin WITHOUT writing through
	// ctx: the runtime context is a fiber-guarded proxy, and even assignment
	// on a DERIVED object (`Object.create(ctx)` then `child.theme = svc`)
	// fires the prototype proxy's set trap -> cordis rejects it with
	// "cannot set property theme in multiple fibers". defineProperty creates
	// a genuine own data slot instead; every other member still delegates.
	const themeCtx = Object.create(ctx);
	Object.defineProperty(themeCtx, "theme", {
		value: themeService,
		writable: true,
		enumerable: true,
		configurable: true,
	});
	try {
		t.apply(themeCtx);
	} catch (err) {
		console.error(`[dsh-enhanced] theme "${id}" failed to apply:`, err);
	}
	// The layout controller paints tokens onto <body> only when it receives a
	// theme/change event — and at boot it subscribes AFTER this module runs,
	// so a single synchronous setTheme publishes into the void and the static
	// stock stylesheet keeps ruling. Re-emit until the paint is observable in
	// body.style, bounded (~8s) so a broken pipeline can't spin forever.
	let tries = 0;
	const kick = () => {
		if (document.body.style.getPropertyValue("--dsw-alias-bg-base") !== "") return;
		if (tries++ > 40) return;
		try { themeService.setTheme(id); } catch { /* unregistered mid-update */ }
		setTimeout(kick, 200);
	};
	setTimeout(kick, 200);
}

	// Sidebar-foot instance controls: two icon buttons STACKED VERTICALLY in
	// the same row as Settings (slot "sidebar.footer.action"), working in the
	// expanded sidebar and the collapsed rail alike. Shutdown is permanently
	// red so the destructive one is never mistaken for the mundane one.
	// Two-click inline confirm — first click arms (tint + tooltip flips),
	// second executes; auto-disarms so a stray click can't leave a loaded
	// destructive control in the chrome.
	const FOOT_CSS = `
		.dshx-foot-btn { appearance: none; background: none; border: 0; border-radius: 8px;
			padding: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
			color: var(--dsw-alias-label-tertiary, rgba(127,127,127,.8));
			transition: color .15s, background-color .15s; }
		.dshx-foot-btn:hover:not(:disabled) { color: var(--dsw-alias-label-primary, currentColor);
			background: var(--dsw-alias-bg-layer-3, rgba(127,127,127,.08)); }
		.dshx-foot-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-primary, currentColor); outline-offset: 1px; }
		.dshx-foot-btn:disabled { opacity: .45; cursor: default !important; }
		.dshx-foot-restart:hover:not(:disabled), .dshx-foot-restart[data-armed="1"] { color: #e05252; }
		.dshx-foot-shutdown { color: #e05252; }
		.dshx-foot-shutdown:hover:not(:disabled), .dshx-foot-shutdown[data-armed="1"] { color: #ff7070;
			background: rgba(224,82,82,.12); }
	`;
	const ICON_PATHS = {
		restart: [
			{ key: "p", type: "polyline", props: { points: "23 4 23 10 17 10" } },
			{ key: "a", type: "path", props: { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" } },
		],
		shutdown: [
			{ key: "p", type: "path", props: { d: "M18.36 6.64a9 9 0 1 1-12.73 0" } },
			{ key: "l", type: "line", props: { x1: "12", y1: "2", x2: "12", y2: "12" } },
		],
	};
	function InstanceIcons(ctx) {
		return function InstanceButtons() {
			const [armed, setArmed] = React.useState(""); // "" | "restart" | "shutdown"
			const [busy, setBusy] = React.useState("");
			React.useEffect(() => {
				if (!armed) return;
				const t = setTimeout(() => setArmed(""), 4000);
				return () => clearTimeout(t);
			}, [armed]);
			const fire = (kind) => {
				if (armed !== kind) { setArmed(kind); return; }
				setArmed("");
				setBusy(kind); // success = process dying; stay disabled
				rpcCall(ctx, { action: kind === "restart" ? "restart_instance" : "shutdown_instance" })
					.catch(() => setBusy(""));
			};
			const button = (kind) => {
				const isRestart = kind === "restart";
				const tip = busy ? (isRestart ? "Restarting…" : "Shutting down…")
					: armed === kind ? "Click again to confirm"
					: isRestart ? "Restart DSH" : "Shut down DSH";
				return e("button", {
					type: "button",
					className: "dshx-foot-btn dshx-foot-" + kind,
					"data-armed": armed === kind ? "1" : undefined,
					title: tip, "aria-label": tip,
					disabled: busy !== "" && busy !== kind,
					onClick: () => fire(kind),
				},
					e("svg", {
						width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
						stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
					}, ICON_PATHS[kind].map((s) => e(s.type, Object.assign({ key: s.key }, s.props)))));
			};
			return e("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" } },
				e("style", null, FOOT_CSS),
				button("restart"),
				button("shutdown"));
		};
	}

return {
	name: "dsh-enhanced",
	inject: [],
	apply(ctx) {
		if (typeof ctx.inject !== "function") return;

		// The card itself: Settings → Plugins → Plugin Configuration.
		ctx.inject(["slots"], (scope) => {
			scope.slots.inject("settings.plugin.item", function* () {
				yield scope.slots.register(
					{ name: "settings.plugin.item", id: "dsh-enhanced", key: "dsh-enhanced", order: 31 },
					Manager(ctx),
				);
			});

			// Restart/shutdown logos, stacked, beside Settings at the sidebar foot.
			scope.slots.inject("sidebar.footer.action", function* () {
				yield scope.slots.register(
					{ name: "sidebar.footer.action", id: "dshx-instance", order: 90, label: "Restart / shut down DSH" },
					InstanceIcons(ctx),
				);
			});
		});

		// Restore the persisted visual theme, if one is selected.
		const chosen = readStoredTheme();
		if (!chosen || chosen === "default") return;
		const svc = typeof ctx.get === "function" ? ctx.get("theme") : undefined;
		if (svc) applyThemeWith(ctx, svc, chosen);
		else ctx.inject(["theme"], (scope) => applyThemeWith(ctx, scope.theme, chosen));
	},
};
}
});

