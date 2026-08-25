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
