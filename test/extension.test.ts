import { test } from "node:test";
import assert from "node:assert/strict";
import ext from "../src/extension.ts";

/** Fake host: records handlers, widget calls, notifications. */
function fakeHost(opts: { omp?: boolean; anthropicToken?: string } = {}) {
	const handlers: Record<string, Function[]> = {};
	const commands: Record<string, Function> = {};
	const widgets: any[] = [];
	const notes: string[] = [];
	const ctx: any = {
		hasUI: true,
		model: { provider: "anthropic", id: "claude-x" },
		ui: { setWidget: (k: string, lines: any, o: any) => widgets.push([k, lines, o]), notify: (m: string) => notes.push(m) },
		modelRegistry: opts.omp
			? { authStorage: { fetchUsageReports: async () => [{ provider: "openai-codex", fetchedAt: Date.now(), limits: [{ id: "p", label: "5h", window: { id: "5h", label: "5h", durationMs: 18000_000, resetsAt: Date.now() + 3600_000 }, amount: { usedFraction: 0.66, unit: "percent" } }] }] } }
			: { getProviderAuth: async (p: string) => (p === "anthropic" && opts.anthropicToken ? { auth: { apiKey: opts.anthropicToken }, source: "OAuth" } : undefined) },
	};
	const api = {
		on: (e: string, h: Function) => (handlers[e] ??= []).push(h),
		registerCommand: (n: string, d: any) => (commands[n] = d.handler),
	};
	ext(api as any);
	const fire = async (e: string, ev: any) => { for (const h of handlers[e] ?? []) await h(ev, ctx); };
	return { fire, commands, widgets, notes, ctx };
}

test("headers on a reply create the widget below the editor", async () => {
	const h = fakeHost();
	await h.fire("session_start", { reason: "startup" });
	await h.fire("after_provider_response", { status: 200, headers: { "anthropic-ratelimit-unified-5h-utilization": "0.25", "anthropic-ratelimit-unified-5h-reset": String(Math.floor(Date.now() / 1000) + 7200) } });
	const last = h.widgets.at(-1)!;
	assert.equal(last[0], "usage-limits");
	assert.equal(last[2].placement, "belowEditor");
	assert.match(last[1][0], /Claude/);
	assert.match(last[1][0], /5h .*25%/);
	await h.fire("session_shutdown", {});
});

test("omp host: session_start polls fetchUsageReports and renders", async () => {
	const h = fakeHost({ omp: true });
	await h.fire("session_start", { reason: "startup" });
	assert.match(h.widgets.at(-1)![1][0], /ChatGPT.*5h .*66%/);
	await h.fire("session_shutdown", {});
});

test("pi host: polls anthropic usage api with OAuth token (fetch mocked)", async () => {
	const orig = globalThis.fetch;
	let seenAuth = "";
	globalThis.fetch = (async (_u: any, init: any) => { seenAuth = init.headers.authorization; return new Response(JSON.stringify({ five_hour: { utilization: 40, resets_at: new Date(Date.now() + 3600e3).toISOString() } }), { status: 200 }); }) as any;
	try {
		const h = fakeHost({ anthropicToken: "sk-ant-oat-test" });
		await h.fire("session_start", { reason: "startup" });
		assert.equal(seenAuth, "Bearer sk-ant-oat-test");
		assert.match(h.widgets.at(-1)![1][0], /Claude.*40%/);
		await h.fire("session_shutdown", {});
	} finally { globalThis.fetch = orig; }
});

test("/usage toggle hides and shows; /usage prints plain text", async () => {
	const h = fakeHost({ omp: true });
	await h.fire("session_start", {});
	await h.commands.usage("toggle", h.ctx);
	assert.equal(h.widgets.at(-1)![1], undefined);
	await h.commands.usage("toggle", h.ctx);
	assert.ok(Array.isArray(h.widgets.at(-1)![1]));
	await h.commands.usage("", h.ctx);
	assert.match(h.notes.at(-1)!, /ChatGPT.*66%.*\[omp\]/);
	assert.doesNotMatch(h.notes.at(-1)!, /\x1b/);
	await h.fire("session_shutdown", {});
});
