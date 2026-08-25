// Session housekeeping section: per-workspace table of stored sessions with
// size/age, and deletion staging. Draft slice: delSessions[] of
// "workspace/sessionId" keys. Save executes the move-to-trash immediately
// (the host still refuses open or recently-active sessions on its side).
DRAFT_SHAPES.push(() => ({ delSessions: [] }));
DIRTY_CHECKS.push((d) => !!d.delSessions.length);

SAVE_STEPS.push(async (call, rem) => {
	if (rem.delSessions.length) {
		// Two-step like the tool contract: dry run mints a token over the
		// CURRENT disk state, then confirm executes against that same state.
		const ids = rem.delSessions.slice();
		const plan = await call({ action: "delete_sessions", sessionIds: ids });
		await call({ action: "delete_sessions", sessionIds: ids, confirm: true, confirmToken: plan.confirmToken });
		rem.delSessions = [];
	}
});

function SessionsSection(p) {
	const [openSes, setOpenSes] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const { draft } = p;

	const toggleDel = (key) => {
		const has = draft.delSessions.includes(key);
		p.patch(Object.assign({}, draft, { delSessions: has ? draft.delSessions.filter((k) => k !== key) : draft.delSessions.concat([key]) }));
	};

	const sessions = Array.isArray(p.sessions) ? p.sessions : [];
	const listFailed = p.sessions === null;
	const ql = query.trim().toLowerCase();
	const visible = ql ? sessions.filter((s) => `${s.workspace}/${s.sessionId}`.toLowerCase().includes(ql)) : sessions;
	const countText = p.open && p.loaded ? (listFailed ? "?" : ql ? `${visible.length}/${sessions.length}` : String(sessions.length)) : null;
	const fmtBytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " KB");
	const fmtIdle = (m) => (m < 60 ? m + " min" : m < 1440 ? Math.round(m / 60) + " h" : Math.round(m / 1440) + " d");
	const stagedBytes = sessions.filter((s) => draft.delSessions.includes(`${s.workspace}/${s.sessionId}`)).reduce((n, s) => n + s.bytes, 0);

	const rows = visible.map((s) => {
		const key = `${s.workspace}/${s.sessionId}`;
		const staged = draft.delSessions.includes(key);
		const blocked = s.liveHere || s.minutesIdle < 15;
		return e("tr", { key, "data-dim": staged ? "1" : null },
			e("td", { style: Object.assign({}, css.td, css.tdMono), title: s.sessionId }, key),
			e("td", { style: css.td }, fmtBytes(s.bytes)),
			e("td", { style: css.td },
				e("span", { style: css.pillText },
					e("span", { style: css.dot(s.liveHere ? GREEN : TERTIARY, !s.liveHere) }),
					s.liveHere ? "open here" : "idle " + fmtIdle(s.minutesIdle))),
			e("td", { style: Object.assign({}, css.td, css.tdActions) },
				e("button", {
					className: staged ? "dshx-btn" : "dshx-btn dshx-danger",
					style: Object.assign({}, staged ? css.btn : css.btnDanger, css.btnSm),
					disabled: p.busy || (!staged && blocked),
					title: blocked && !s.liveHere ? "Active recently — the host refuses sessions idle under 15 minutes." : "",
					onClick: () => toggleDel(key),
				}, staged ? "Keep" : "Delete"),
			),
		);
	});

	return [
		e("div", { key: "se-head", style: Object.assign({}, css.row, { alignItems: "center" }) },
			sectionHead("Sessions", countText, openSes, () => setOpenSes(!openSes)),
			p.open && p.loaded && openSes && sessions.length > 0 ? searchBox(query, setQuery, "Search sessions") : null,
			stagedBytes > 0 ? e("span", { style: css.chip }, `${draft.delSessions.length} staged · ${fmtBytes(stagedBytes)}`) : null),
		openSes ? [
			e("p", { key: "se-note", style: css.note },
				"Stored conversation logs under ~/.dsh/sessions · Delete moves the whole directory into ~/.dsh/dsh-enhanced/trash (restore = move back). Open and recently-active sessions are refused."),
			e("div", { key: "se-table", style: css.tableWrap },
				e("table", { style: css.table },
					e("thead", null, e("tr", null,
						e("th", { style: css.th }, "Session"), e("th", { style: Object.assign({}, css.th, { width: "10%" }) }, "Size"),
						e("th", { style: Object.assign({}, css.th, { width: "18%" }) }, "State"), e("th", { style: Object.assign({}, css.th, { width: "12%" }) }))),
					e("tbody", { className: "dshx-tbody" }, rows))),
			p.open && !p.loaded && !p.error ? e("p", { key: "se-load", style: css.empty }, "loading...") : null,
			p.open && p.loaded && listFailed ? e("p", { key: "se-stale", style: css.err }, "Session list unavailable — the running dsh-enhanced build predates this section. Reload this profile's GUI process to pick up v1.1.0.") : null,
			p.open && p.loaded && !listFailed && sessions.length === 0 ? e("p", { key: "se-empty", style: css.empty }, "No stored sessions.") : null,
			ql && visible.length === 0 ? e("p", { key: "se-nomatch", style: css.empty }, `No sessions matching “${query.trim()}”.`) : null,
		] : null,
	];
}

SECTIONS.push(SessionsSection);
