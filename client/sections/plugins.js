// Plugin manager section: per-profile table of mounted plugins with
// enable/disable staging. Draft slice: pluginOps{} ("profile/id" -> true
// when the staged target is enabled, false when disabled).
DRAFT_SHAPES.push(() => ({ pluginOps: {} }));
DIRTY_CHECKS.push((d) => !!Object.keys(d.pluginOps).length);

SAVE_STEPS.push(async (call, rem) => {
	for (const entry of Object.entries(rem.pluginOps)) {
		const slash = entry[0].indexOf("/");
		// The GUI click IS the human confirmation, so disables of official
		// plugins carry confirm: true (the tool guard targets agent calls).
		await call({
			action: "set_plugin_enabled",
			pluginId: entry[0].slice(slash + 1),
			enabled: entry[1],
			confirm: !entry[1],
		});
		delete rem.pluginOps[entry[0]];
	}
});

function PluginsSection(p) {
	const [openPlg, setOpenPlg] = React.useState(false);
	const [profFilter, setProfFilter] = React.useState("all");
	const [query, setQuery] = React.useState("");
	const { draft } = p;

	const toggleOp = (profile, id) => {
		const key = `${profile}/${id}`;
		const ops = Object.assign({}, draft.pluginOps);
		const row = p.plugins.find((x) => x.profile === profile && x.id === id);
		if (!row) return;
		if (ops[key] !== undefined) delete ops[key];
		else ops[key] = row.disabled ? true : false;
		p.patch(Object.assign({}, draft, { pluginOps: ops }));
	};

	const plugins = Array.isArray(p.plugins) ? p.plugins : [];
	const listFailed = p.plugins === null;
	const knownProfiles = Array.from(new Set(plugins.map((m) => m.profile)));
	const ql = query.trim().toLowerCase();
	const matchQ = (...parts) => !ql || parts.some((x) => String(x || "").toLowerCase().includes(ql));
	const inProfile = profFilter === "all" ? plugins : plugins.filter((m) => m.profile === profFilter);
	const visible = ql ? inProfile.filter((m) => matchQ(m.id, m.profile)) : inProfile;
	const countText = p.open && p.loaded ? (listFailed ? "?" : ql ? `${visible.length}/${plugins.length}` : String(plugins.length)) : null;

	const rows = visible.map((m, i) => {
		const key = `${m.profile}/${m.id}`;
		const op = draft.pluginOps[key];
		const short = m.id.includes("/") ? m.id.split("/").pop() : m.id;
		const source = m.bundled ? "bundled" : m.installed ? "installed" : "managed";
		return e("tr", { key: `${key}/${i}`, "data-dim": op !== undefined ? "1" : null },
			e("td", { style: Object.assign({}, css.td, css.tdName), title: m.id }, short),
			e("td", { style: css.td }, m.profile),
			e("td", { style: Object.assign({}, css.td, css.muted) }, source),
			e("td", { style: css.td },
				e("span", { title: "Loaded = this plugin's code is active in the GUI process right now. After a config change it updates when the profile recomposes.", style: css.pillText },
					e("span", { style: css.dot(m.live ? GREEN : TERTIARY, !m.live) }),
					m.live ? "loaded" : "not loaded"),
				e("span", { style: css.muted }, "  ·  "),
				e("span", { title: "Configured state on disk (cordis.patch.yml). Toggling rewrites this and the profile recomposes live.", style: css.muted },
					op !== undefined
						? `(will ${op ? "enable" : "disable"})`
						: m.disabled
							? m.disabledByUs ? "disabled · dsh-enhanced" : "disabled"
							: "enabled")),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				e("button", {
					className: "dshx-btn",
					style: Object.assign({}, css.btn, css.btnSm),
					disabled: p.busy,
					onClick: () => toggleOp(m.profile, m.id),
					// Label follows effective state (staged op overrides live row),
				// so clicking always offers the opposite direction.
			}, (op !== undefined ? op : !m.disabled) ? "Disable" : "Enable"),
			),
		);
	});

	const profSelect = e("select", { className: "dshx-input", style: Object.assign({}, css.input, { width: "auto" }), value: profFilter, onChange: (ev) => setProfFilter(ev.target.value) },
		e("option", { value: "all" }, "All profiles"),
		knownProfiles.map((prof) => e("option", { key: prof, value: prof }, prof)));

	return [
		e("div", { key: "pl-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Plugins", countText, openPlg, () => setOpenPlg(!openPlg)),
			plugins.length > 0 && openPlg ? e("label", { style: Object.assign({}, css.checkRow, { paddingBottom: 0 }) }, "Profile:", profSelect) : null,
			p.open && p.loaded && openPlg && plugins.length > 0 ? searchBox(query, setQuery, "Search plugins") : null),
		openPlg ? [
			e("p", { key: "pl-note", style: css.note },
				"Per-profile cordis.patch.yml marker block · applies live on Save — boots watch the file and recompose, no restart. Official @deepseek-ai/* plugins may remove core surfaces."),
			e("div", { key: "pl-table", style: css.tableWrap },
				e("table", { style: css.table },
					e("thead", null, e("tr", null,
						e("th", { style: Object.assign({}, css.th, { width: "24%" }) }, "Plugin"), e("th", { style: Object.assign({}, css.th, { width: "11%" }) }, "Profile"),
						e("th", { style: Object.assign({}, css.th, { width: "12%" }) }, "Source"), e("th", { style: Object.assign({}, css.th, { width: "29%" }) }, "State"),
						e("th", { style: Object.assign({}, css.th, { width: "14%" }) }))),
					e("tbody", { className: "dshx-tbody" }, rows))),
			p.open && !p.loaded && !p.error ? e("p", { key: "pl-load", style: css.empty }, "loading...") : null,
			p.open && p.loaded && listFailed ? e("p", { key: "pl-stale", style: css.err }, "Plugin list unavailable — the running dsh-enhanced build predates this section. Reload this profile's GUI process to pick up v1.1.0.") : null,
			p.open && p.loaded && !listFailed && plugins.length === 0 ? e("p", { key: "pl-empty", style: css.empty }, "No plugins found in any profile.") : null,
			profFilter !== "all" && plugins.length > 0 && visible.length === 0 ? e("p", { key: "pl-filt", style: css.muted }, "No plugins in this profile.") : null,
			ql && visible.length === 0 ? e("p", { key: "pl-nomatch", style: css.empty }, `No plugins matching “${query.trim()}”.`) : null,
		] : null,
	];
}

SECTIONS.push(PluginsSection);
