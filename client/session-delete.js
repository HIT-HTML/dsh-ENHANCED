// Native sidebar hover-delete: each session row's ⋯ area gains a trash-can
// icon that fades in on row hover. The shipped WorkspaceBrowser hardcodes its
// rows (no slot to extend), so we augment the DOM directly:
//
// - Rows are identifiable as div[role="treeitem"]; their LAST element child is
//   the actions span holding the ⋯ menu trigger — our button goes beside it.
// - The owning session id comes from the React fiber chain: only SessionNodeItem
//   carries an `onArchive` prop, so workspace rows and other popovers never match.
// - Clicking replays the exact host delete_sessions contract the agent uses:
//   dry run → confirmToken → confirm. Trash-backed; live/idle guards intact.
// ponytail: "__reactFiber$" keys and the onArchive marker are upstream details;
// if a frontend update breaks resolution we fail quiet (no icon), never
// mis-delete. Stale rows after deletion are fixed cosmetically (row removed)
// until the app's own store refreshes.
function setupSessionDelete(ctx) {
	const RED = "#e05252";

	const style = document.createElement("style");
	style.textContent = `
		.dshx-rowdel { appearance: none; background: none; border: 0; padding: 2px; margin-left: 2px;
			cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
			color: var(--dsw-alias-label-tertiary, rgba(127,127,127,.8));
			opacity: 0; transition: opacity .12s, color .12s; }
		[role="treeitem"]:hover .dshx-rowdel, .dshx-rowdel:focus-visible { opacity: 1; }
		.dshx-rowdel:hover:not(:disabled) { color: ${RED}; }
		.dshx-rowdel:disabled { opacity: .45; cursor: default !important; }
	`;
	document.head.appendChild(style);

	const TRASH =
		'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
		'stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

	function resolveSession(row) {
		const key = Object.keys(row).find((k) => k.startsWith("__reactFiber$"));
		if (!key) return null;
		for (let f = row[key], hops = 0; f && hops < 60; f = f.return, hops++) {
			const p = f.memoizedProps;
			if (p && typeof p === "object" && p.onArchive && p.node && typeof p.node.id === "string") {
				return p.node.id.replace(/^session-/, "");
			}
		}
		return null;
	}

	function augment(row) {
		if (!(row instanceof Element) || row.querySelector(".dshx-rowdel")) return;
		const id = resolveSession(row);
		if (!id) return;
		const anchor = row.lastElementChild;
		if (!anchor) return; // blank/draft rows render no actions area

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dshx-rowdel";
		btn.title = "Delete session";
		btn.setAttribute("aria-label", `Delete session`);
		btn.innerHTML = TRASH;
		btn.addEventListener("click", async (ev) => {
			ev.stopPropagation();
			ev.preventDefault();
			ev.stopImmediatePropagation(); // the row itself opens on click
			btn.disabled = true;
			try {
				const dry = await rpcCall(ctx, { action: "delete_sessions", sessionIds: [id] });
				await rpcCall(ctx, { action: "delete_sessions", sessionIds: [id], confirm: true, confirmToken: dry.confirmToken });
				row.remove();
			} catch (err) {
				toast(String((err && err.message) || err));
				btn.disabled = false;
			}
		}, true);
		anchor.appendChild(btn);
	}

	function toast(msg) {
		const t = document.createElement("div");
		t.textContent = msg;
		t.style.cssText =
			"position:fixed;bottom:18px;left:50%;transform:translateX(-50%);max-width:70vw;" +
			"background:#26262c;color:#eee;padding:8px 14px;border-radius:10px;font-size:12.5px;" +
			"z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.4)";
		document.body.appendChild(t);
		setTimeout(() => t.remove(), 4500);
	}

	let observer;
	try {
		observer = new MutationObserver((muts) => {
			for (const m of muts) {
				for (const n of m.addedNodes) {
					if (!(n instanceof Element)) continue;
					if (n.getAttribute("role") === "treeitem") augment(n);
					else n.querySelectorAll?.('[role="treeitem"]').forEach(augment);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	} catch {
		return () => {}; // ancient engine without MutationObserver: feature absent
	}
	document.querySelectorAll('[role="treeitem"]').forEach(augment); // already-mounted sidebar

	return () => {
		observer.disconnect();
		style.remove();
		document.querySelectorAll(".dshx-rowdel").forEach((b) => b.remove());
	};
}
