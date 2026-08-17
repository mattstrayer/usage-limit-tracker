import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnthropicHeaders, parseCodexHeaders, parseHeaders } from "../src/sources/headers.ts";
import { parseAnthropicUsage } from "../src/sources/anthropic.ts";
import { parseCodexUsage } from "../src/sources/codex.ts";
import { fromOmpReports } from "../src/sources/omp.ts";
import { SubscriptionStore } from "../src/store.ts";

const now = 1_700_000_000;

test("anthropic headers → 5h/7d windows", () => {
	const s = parseAnthropicHeaders({
		"anthropic-ratelimit-unified-5h-utilization": "0.42",
		"anthropic-ratelimit-unified-5h-reset": String(now + 3600),
		"anthropic-ratelimit-unified-7d-utilization": "0.1",
		"anthropic-ratelimit-unified-7d-reset": String(now + 86400),
	}, now)!;
	assert.equal(s.provider, "anthropic");
	assert.deepEqual(s.windows.map((w) => [w.label, w.used, w.resetsAt, w.windowSecs]), [["5h", 0.42, now + 3600, 18000], ["7d", 0.1, now + 86400, 604800]]);
});
test("codex headers → primary/secondary, percent scaled, ms reset handled", () => {
	const s = parseCodexHeaders({
		"x-codex-primary-used-percent": "37",
		"x-codex-primary-window-minutes": "300",
		"x-codex-primary-reset-at": String((now + 100) * 1000),
		"x-codex-secondary-used-percent": "12",
		"x-codex-secondary-window-minutes": "10080",
	}, now)!;
	assert.equal(s.windows[0].label, "5h");
	assert.equal(s.windows[0].used, 0.37);
	assert.equal(s.windows[0].resetsAt, now + 100);
	assert.equal(s.windows[1].label, "7d");
});
test("parseHeaders sniffs when provider unknown; ignores unrelated", () => {
	assert.equal(parseHeaders(undefined, { "x-codex-primary-used-percent": "5" }, now)?.provider, "openai-codex");
	assert.equal(parseHeaders("anthropic", { "content-type": "json" }, now), undefined);
});
test("anthropic usage api payload", () => {
	const s = parseAnthropicUsage({ five_hour: { utilization: 4, resets_at: "2026-08-17T20:00:00Z" }, seven_day: { utilization: 2, resets_at: "2026-08-20T00:00:00Z" }, seven_day_opus: null }, now)!;
	assert.equal(s.windows.length, 2);
	assert.equal(s.windows[0].used, 0.04);
	assert.equal(s.windows[0].resetsAt, Date.parse("2026-08-17T20:00:00Z") / 1000);
});
test("codex usage api payload with plan and reset_after_seconds", () => {
	const s = parseCodexUsage({ plan_type: "pro", rate_limit: { primary_window: { used_percent: 50, limit_window_seconds: 18000, reset_after_seconds: 600 }, secondary_window: { used_percent: 9, limit_window_seconds: 604800, reset_at: now + 5000 } } }, now)!;
	assert.equal(s.name, "ChatGPT Pro");
	assert.equal(s.windows[0].resetsAt, now + 600);
	assert.equal(s.windows[1].resetsAt, now + 5000);
});
test("omp reports → subscriptions", () => {
	const subs = fromOmpReports([{
		provider: "anthropic", fetchedAt: now * 1000, limits: [
			{ id: "a", label: "5h", scope: { tier: "max" }, window: { id: "5h", label: "5h", durationMs: 18000_000, resetsAt: (now + 60) * 1000 }, amount: { usedFraction: 0.3, unit: "percent" } },
			{ id: "b", label: "7d opus", scope: { modelId: "claude-opus-4" }, window: { id: "7d", label: "7d", durationMs: 604800_000 }, amount: { remainingFraction: 0.8, unit: "percent" } },
		],
	}, { provider: "weird", fetchedAt: now * 1000, limits: [] }], now);
	assert.equal(subs.length, 1);
	assert.equal(subs[0].name, "Claude");
	assert.deepEqual(subs[0].windows.map((w) => [w.label, +w.used.toFixed(2), w.resetsAt]), [["5h·max", 0.3, now + 60], ["7d·opus", 0.2, undefined]]);
});
test("store merges by label and keeps longer name", () => {
	const st = new SubscriptionStore();
	st.upsert({ provider: "openai-codex", name: "ChatGPT Pro", windows: [{ label: "5h", used: 0.1 }, { label: "7d", used: 0.2 }], updatedAt: now, source: "usage-api" });
	st.upsert({ provider: "openai-codex", name: "ChatGPT", windows: [{ label: "5h", used: 0.5 }], updatedAt: now + 1, source: "headers" });
	const s = st.all()[0];
	assert.equal(s.name, "ChatGPT Pro");
	assert.deepEqual(s.windows.map((w) => [w.label, w.used]), [["5h", 0.5], ["7d", 0.2]]);
	assert.equal(s.source, "headers");
});
