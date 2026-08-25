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
