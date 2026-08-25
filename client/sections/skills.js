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
