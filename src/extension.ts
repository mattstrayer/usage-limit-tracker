/**
 * pi / oh-my-pi extension: per-subscription usage limit bars.
 * Works on both hosts. Uses only structural types so it needs no host package at compile time.
 */
import { renderLine } from "./render.ts";
import { MUTED, PASTEL, VIVID, type Palette } from "./smart-color.ts";
import { fetchAnthropicUsage } from "./sources/anthropic.ts";
import { fetchCodexUsage } from "./sources/codex.ts";
import { parseHeaders } from "./sources/headers.ts";
import { fromOmpReports, type OmpUsageReport } from "./sources/omp.ts";
import { SubscriptionStore } from "./store.ts";

// ---- minimal host surface (pi and omp both satisfy this) ----
interface HostCtx {
	model?: { provider?: string; id?: string };
	modelRegistry?: {
		getProviderAuth?: (p: string) => Promise<{ auth?: { apiKey?: string }; source?: string } | undefined>;
		authStorage?: { fetchUsageReports?: (o?: unknown) => Promise<OmpUsageReport[] | null> };
	};
	hasUI?: boolean;
	ui: {
		setWidget: (key: string, lines: string[] | undefined, o?: { placement?: "aboveEditor" | "belowEditor" }) => void;
		notify: (msg: string, level?: "info" | "warning" | "error") => void;
	};
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (h: unknown) => void;
}
interface HostAPI {
	on: (event: string, handler: (event: any, ctx: HostCtx) => unknown) => void;
	registerCommand: (name: string, def: { description: string; handler: (args: string, ctx: HostCtx) => Promise<void> | void }) => void;
}

const WIDGET = "usage-limits";
const POLL_MS = 5 * 60_000; // usage endpoints are rate limited; TokenEater backs off at 429 too
const TICK_MS = 60_000; // re-render so reset countdowns move
const PALETTES: Record<string, Palette> = { muted: MUTED, vivid: VIVID, pastel: PASTEL };

export default function usageLimitTracker(pi: HostAPI): void {
	const store = new SubscriptionStore();
	let visible = process.env.USAGE_LIMITS_HIDDEN !== "1";
	let palette = PALETTES[process.env.USAGE_LIMITS_PALETTE ?? ""] ?? MUTED;
	let ctx: HostCtx | undefined;
	let timers: unknown[] = [];
	let lastError = "";
	const now = () => Math.floor(Date.now() / 1000);
	const debug = (...a: unknown[]) => { if (process.env.USAGE_LIMITS_DEBUG) console.error("[usage-limits]", ...a); };

	function render(): void {
		if (!ctx || ctx.hasUI === false) return;
		if (!visible || store.size === 0) return ctx.ui.setWidget(WIDGET, undefined);
		const t = now();
		const lines = store.all().map((s) => renderLine(s.name, s.windows, { now: t, palette }));
		ctx.ui.setWidget(WIDGET, lines, { placement: "belowEditor" });
	}

	async function poll(): Promise<void> {
		if (!ctx) return;
		const t = now();
		try {
			// oh-my-pi: one call covers every logged-in provider.
			const omp = ctx.modelRegistry?.authStorage?.fetchUsageReports;
			if (omp) {
				const reports = await omp.call(ctx.modelRegistry!.authStorage);
				debug("omp reports:", reports?.map((r) => `${r.provider}:${r.limits.map((l) => l.id).join("|")}`) ?? null);
				if (reports) store.upsertMany(fromOmpReports(reports, t));
				lastError = "";
				return render();
			}
			// pi: ask the registry for OAuth tokens per provider we know how to query.
			const auth = ctx.modelRegistry?.getProviderAuth;
			debug("host:", auth ? "pi" : "unknown (no getProviderAuth/authStorage)");
			if (!auth) return;
			const a = await auth("anthropic").catch(() => undefined);
			if (a?.auth?.apiKey?.startsWith("sk-ant-oat")) store.upsert(await fetchAnthropicUsage(a.auth.apiKey, t));
			const c = await auth("openai-codex").catch(() => undefined);
			if (c?.auth?.apiKey && /oauth/i.test(c.source ?? "")) store.upsert(await fetchCodexUsage(c.auth.apiKey, await codexAccountId(), t));
			lastError = "";
		} catch (e) {
			lastError = e instanceof Error ? e.message : String(e);
			debug("poll error:", lastError);
		}
		debug("subscriptions:", store.all().map((s) => `${s.name}[${s.source}] ${s.windows.map((w) => `${w.label}=${Math.round(w.used * 100)}%`).join(",")}`));
		render();
	}

	async function codexAccountId(): Promise<string | undefined> {
		// pi stores accountId next to the OAuth credential; readStoredCredential is exported by the host package.
		for (const mod of ["@earendil-works/pi-coding-agent", "@oh-my-pi/pi-coding-agent"]) {
			try {
				const m: any = await import(mod);
				const cred = await m.readStoredCredential?.("openai-codex");
				if (cred?.accountId) return String(cred.accountId);
			} catch {
				/* not this host */
			}
		}
		return undefined;
	}

	function startTimers(): void {
		stopTimers();
		const set = ctx?.setInterval ? (fn: () => void, ms: number) => ctx!.setInterval!(fn, ms) : (fn: () => void, ms: number) => {
			const h = setInterval(fn, ms);
			(h as any).unref?.();
			return h;
		};
		timers.push(set(() => void poll(), POLL_MS), set(render, TICK_MS));
	}
	function stopTimers(): void {
		for (const h of timers) (ctx?.clearTimer ? ctx.clearTimer(h) : clearInterval(h as any));
		timers = [];
	}

	pi.on("session_start", async (_e, c) => {
		ctx = c;
		startTimers();
		await poll();
	});
	pi.on("session_shutdown", () => stopTimers());

	// Free data on every reply: rate-limit headers.
	pi.on("after_provider_response", (e, c) => {
		ctx = c;
		if (!e?.headers) return;
		const parsed = parseHeaders(c.model?.provider, e.headers, now());
		debug("headers from", c.model?.provider, "→", parsed ? parsed.windows.map((w) => `${w.label}=${Math.round(w.used * 100)}%`).join(",") : "none");
		if (store.upsert(parsed)) render();
	});

	pi.registerCommand("usage", {
		description: "Usage limits: /usage [refresh|toggle|palette muted|vivid|pastel]",
		handler: async (args, c) => {
			ctx = c;
			const [cmd, arg] = args.trim().split(/\s+/);
			if (cmd === "toggle") {
				visible = !visible;
				return render();
			}
			if (cmd === "palette" && PALETTES[arg]) {
				palette = PALETTES[arg];
				return render();
			}
			await poll();
			const subs = store.all();
			if (!subs.length) return c.ui.notify(lastError ? `usage: no data (${lastError})` : "usage: no subscription data yet — send a message or log in via /login", "warning");
			const t = now();
			c.ui.notify(subs.map((s) => `${renderLine(s.name, s.windows, { now: t, color: false })}  [${s.source}]`).join("\n"), "info");
		},
	});
}
