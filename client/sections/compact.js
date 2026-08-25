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
