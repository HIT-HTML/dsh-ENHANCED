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
			let tokenGuard = null;
			try {
				ctx.theme.register({
					id: THEME_ID,
					colorScheme: "dark",
					tokens: TOKENS
				});
				ctx.theme.setTheme(THEME_ID);
				// Native repaints (day/night switch, lazily-loaded settings/model
				// chunks) rewrite body tokens with the stock palette, leaving gray
				// default menus over the theme. Reassert ours whenever they drift.
				// ponytail: inequality check converges the observe-loop; upgrade
				// path = an upstream "tokens changed" hook on the theme service.
				tokenGuard = new MutationObserver(() => {
					for (const k in TOKENS)
						if (document.body.style.getPropertyValue(k) !== TOKENS[k]) document.body.style.setProperty(k, TOKENS[k]);
				});
				tokenGuard.observe(document.body, { attributes: true, attributeFilter: ["style"] });
			} catch (e) {
				console.error("[dsh-enhanced] matrix theme register failed", e);
			}
			return () => {
				observer.disconnect();
				if (tokenGuard) tokenGuard.disconnect();
				stopRain();
				stopFx();
			};
		}, "dsh-enhanced: matrix theme");
	}

	return { THEME_ID, isPlugin: true, inject: ["theme"], apply };
}
const MATRIX_THEME = matrixThemeFactory();
THEMES.push({ id: MATRIX_THEME.THEME_ID || "enhanced", name: "ENHANCED", apply: MATRIX_THEME.apply });
