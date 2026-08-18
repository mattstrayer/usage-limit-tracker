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

// Fixture from a real google-antigravity report (ids/labels as omp emits them).
const antigravityReport = {
	provider: "google-antigravity", fetchedAt: now * 1000, limits: [
		{ id: "google-antigravity:google:default:weekly", label: "Usage (Google)", scope: { windowId: "weekly" }, window: { id: "weekly", label: "Weekly", durationMs: 604800000, resetsAt: (now + 6 * 86400 + 4 * 3600) * 1000 }, amount: { unit: "percent", remainingFraction: 0.7231696, usedFraction: 0.2768304 } },
		{ id: "google-antigravity:google:default:daily", label: "Usage (Google)", scope: { windowId: "daily" }, window: { id: "daily", label: "Daily", durationMs: 86400000 }, amount: { unit: "percent", remainingFraction: 1, usedFraction: 0 } },
		{ id: "google-antigravity:anthropic:default:weekly", label: "Usage (Anthropic)", scope: { windowId: "weekly" }, window: { id: "weekly", label: "Weekly", durationMs: 604800000, resetsAt: (now + 7 * 86400) * 1000 }, amount: { unit: "percent", remainingFraction: 1, usedFraction: 0 } },
		{ id: "google-antigravity:openai:default:weekly", label: "Usage (OpenAI)", scope: { windowId: "weekly" }, window: { id: "weekly", label: "Weekly", durationMs: 604800000, resetsAt: (now + 7 * 86400) * 1000 }, amount: { unit: "percent", remainingFraction: 1, usedFraction: 0 } },
	],
};

test("omp antigravity: family suffix from label parenthetical; daily keeps no reset", () => {
	const [s] = fromOmpReports([antigravityReport], now);
	assert.equal(s.name, "Antigravity");
	assert.deepEqual(s.windows.map((w) => [w.label, +w.used.toFixed(2), w.resetsAt, w.windowSecs]), [
		["7d·google", 0.28, now + 6 * 86400 + 4 * 3600, 604800],
		["1d·google", 0, undefined, 86400],
		["7d·anthropic", 0, now + 7 * 86400, 604800],
		["7d·openai", 0, now + 7 * 86400, 604800],
	]);
});

test("omp anthropic (real id/tier shape): base buckets plain, per-model buckets suffixed", () => {
	const [s] = fromOmpReports([{
		provider: "anthropic", fetchedAt: now * 1000, limits: [
			{ id: "anthropic:5h", label: "Claude 5 Hour", scope: { windowId: "5h" }, window: { id: "5h", label: "5 Hour", durationMs: 18000_000, resetsAt: (now + 3600) * 1000 }, amount: { usedFraction: 0.1, unit: "percent" } },
			{ id: "anthropic:7d", label: "Claude 7 Day", scope: { windowId: "7d" }, window: { id: "7d", label: "7 Day", durationMs: 604800_000, resetsAt: (now + 86400) * 1000 }, amount: { usedFraction: 0.2, unit: "percent" } },
			{ id: "anthropic:7d:opus", label: "Claude 7 Day (Opus)", scope: { windowId: "7d", tier: "opus" }, window: { id: "7d", label: "7 Day", durationMs: 604800_000 }, amount: { usedFraction: 0.3, unit: "percent" } },
			{ id: "anthropic:7d:sonnet", label: "Claude 7 Day (Sonnet)", scope: { windowId: "7d", tier: "sonnet" }, window: { id: "7d", label: "7 Day", durationMs: 604800_000 }, amount: { usedFraction: 0.4, unit: "percent" } },
		],
	}], now);
	assert.deepEqual(s.windows.map((w) => w.label), ["5h", "7d", "7d·opus", "7d·sonnet"]);
});

test("omp: labels are unique per report — id segment breaks remaining ties", () => {
	const lim = (id: string) => ({ id, label: "Usage", window: { id: "weekly", label: "Weekly", durationMs: 604800000 }, amount: { usedFraction: 0.5, unit: "percent" } });
	const [s] = fromOmpReports([{ provider: "x", fetchedAt: now * 1000, limits: [lim("x:alpha:weekly"), lim("x:beta:weekly"), lim("x:gamma:weekly")] }], now);
	assert.deepEqual(s.windows.map((w) => w.label), ["7d·alpha", "7d·beta", "7d·gamma"]);
	// Only difference is the whole id → fall back to it.
	const [t] = fromOmpReports([{ provider: "y", fetchedAt: now * 1000, limits: [lim("one"), lim("two")] }], now);
	assert.deepEqual(t.windows.map((w) => w.label), ["7d·one", "7d·two"]);
	const labels = new Set([...s.windows, ...t.windows].map((w) => w.label));
	assert.equal(labels.size, 5);
});

test("store: repeated antigravity polls keep all four buckets (regression: label collapse)", () => {
	const st = new SubscriptionStore();
	st.upsertMany(fromOmpReports([antigravityReport], now));
	st.upsertMany(fromOmpReports([{ ...antigravityReport, fetchedAt: (now + 300) * 1000 }], now + 300));
	assert.equal(st.all()[0].windows.length, 4);
});
