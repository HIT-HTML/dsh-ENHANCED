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
	exa: { label: "Exa", free: false, key: "exaApiKey" },
	tavily: { label: "Tavily", free: false, key: "tavilyApiKey" },
	keenable: { label: "Keenable", free: false, key: "keenableApiKey" },
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
					],
			) : null,
			// datalists referenced by the list= attributes above
			e("datalist", { key: "se-regions", id: "se-region-list" }, REGION_HINTS.map((h) => e("option", { key: h, value: h }))),
			e("datalist", { key: "se-markets", id: "se-market-list" }, MARKET_HINTS.map((h) => e("option", { key: h, value: h }))),
		] : null,
	];
}

SECTIONS.push(SearchSection);
