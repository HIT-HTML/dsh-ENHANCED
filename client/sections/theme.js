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
