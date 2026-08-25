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
						const [s, m, st, pl, ses] = await Promise.all([
							call({ action: "list_skills" }),
							call({ action: "list_mcps" }),
							call({ action: "mcp_status" }).catch(() => ({ servers: [] })),
							call({ action: "list_plugins" }).catch(() => ({ plugins: [] })),
							call({ action: "list_sessions" }).catch(() => ({ sessions: [] })),
						]);
						setSummary({ skills: s.skills || [], mcps: m.mcps || [], plugins: pl.plugins || [], sessions: ses.sessions || [] });
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
							plugins: (summary && summary.plugins) || [],
							sessions: (summary && summary.sessions) || [],
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
