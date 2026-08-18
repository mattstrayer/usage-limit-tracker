import { test } from "node:test";
import assert from "node:assert/strict";
import { renderLine, renderWindow, type Window } from "../src/render.ts";
import { parseAnthropicHeaders, parseCodexHeaders } from "../src/sources/headers.ts";
import { parseAnthropicUsage } from "../src/sources/anthropic.ts";
import { fromOmpReports } from "../src/sources/omp.ts";
import { SubscriptionStore } from "../src/store.ts";

const now = 1_700_000_000;
const H = 3600;
const D = 86400;
const plain = (name: string, w: Window[]) => renderLine(name, w, { color: false, now });

// Golden lines. `│` is the elapsed tick (floor(elapsed·width); it overwrites that cell), `●` chill / `▲` hot, trailing token is time to reset.
// A window without resetsAt is a threshold gauge: no tick, no glyph, no countdown.

test("render: Claude from headers + usage-api per-model buckets", () => {
	const st = new SubscriptionStore();
	st.upsert(parseAnthropicUsage({
		five_hour: { utilization: 42, resets_at: new Date((now + 2 * H) * 1000).toISOString() },
		seven_day: { utilization: 10, resets_at: new Date((now + 3 * D) * 1000).toISOString() },
		seven_day_opus: { utilization: 5, resets_at: new Date((now + 3 * D) * 1000).toISOString() },
		seven_day_sonnet: { utilization: 61, resets_at: new Date((now + 3 * D) * 1000).toISOString() },
	}, now));
	// A fresh header sample overrides 5h only; the other buckets survive.
	st.upsert(parseAnthropicHeaders({ "anthropic-ratelimit-unified-5h-utilization": "0.5", "anthropic-ratelimit-unified-5h-reset": String(now + 2 * H) }, now + 1));
	const s = st.all()[0];
	assert.equal(plain(s.name, s.windows), "Claude  5h █████░│░░░  50% ● 2h00m  7d █░░░░│░░░░  10% ● 3d0h  7d·opus ░░░░░│░░░░   5% ● 3d0h  7d·sonnet █████│░░░░  61% ● 3d0h");
});

test("render: ChatGPT Codex from headers, hot 5h", () => {
	const s = parseCodexHeaders({
		"x-codex-primary-used-percent": "92", "x-codex-primary-window-minutes": "300", "x-codex-primary-reset-at": String(now + 1.5 * H),
		"x-codex-secondary-used-percent": "30", "x-codex-secondary-window-minutes": "10080", "x-codex-secondary-reset-at": String(now + 5 * D),
	}, now)!;
	assert.equal(plain(s.name, s.windows), "ChatGPT  5h ███████│█░  92% ▲ 1h30m  7d ██│░░░░░░░  30% ● 5d0h");
});

test("render: Antigravity — four labelled buckets, daily has no reset", () => {
	const [s] = fromOmpReports([{
		provider: "google-antigravity", fetchedAt: now * 1000, limits: [
			{ id: "google-antigravity:google:default:weekly", label: "Usage (Google)", window: { id: "weekly", label: "Weekly", durationMs: 7 * D * 1000, resetsAt: (now + 6 * D + 4 * H) * 1000 }, amount: { unit: "percent", usedFraction: 0.28 } },
			{ id: "google-antigravity:google:default:daily", label: "Usage (Google)", window: { id: "daily", label: "Daily", durationMs: D * 1000 }, amount: { unit: "percent", usedFraction: 0 } },
			{ id: "google-antigravity:anthropic:default:weekly", label: "Usage (Anthropic)", window: { id: "weekly", label: "Weekly", durationMs: 7 * D * 1000, resetsAt: (now + 7 * D) * 1000 }, amount: { unit: "percent", usedFraction: 0 } },
			{ id: "google-antigravity:openai:default:weekly", label: "Usage (OpenAI)", window: { id: "weekly", label: "Weekly", durationMs: 7 * D * 1000, resetsAt: (now + 7 * D) * 1000 }, amount: { unit: "percent", usedFraction: 0 } },
		],
	}], now);
	assert.equal(plain(s.name, s.windows), "Antigravity  7d·google █│░░░░░░░░  28% ● 6d4h  1d·google ░░░░░░░░░░   0%  7d·anthropic │░░░░░░░░░   0% ● 7d0h  7d·openai │░░░░░░░░░   0% ● 7d0h");
});

test("render: Gemini CLI per-tier buckets from omp tier scope", () => {
	const [s] = fromOmpReports([{
		provider: "google-gemini-cli", fetchedAt: now * 1000, limits: [
			{ id: "google-gemini-cli:pro:daily", label: "Gemini Pro", scope: { tier: "Pro" }, window: { id: "daily", label: "Daily", durationMs: D * 1000, resetsAt: (now + 6 * H) * 1000 }, amount: { unit: "percent", usedFraction: 0.75 } },
			{ id: "google-gemini-cli:flash:daily", label: "Gemini Flash", scope: { tier: "Flash" }, window: { id: "daily", label: "Daily", durationMs: D * 1000, resetsAt: (now + 6 * H) * 1000 }, amount: { unit: "percent", usedFraction: 0.1 } },
		],
	}], now);
	assert.equal(plain(s.name, s.windows), "Gemini  1d·pro ███████│░░  75% ● 6h00m  1d·flash █░░░░░░│░░  10% ● 6h00m");
});

test("render: unknown provider without duration uses the provider's window label", () => {
	const [s] = fromOmpReports([{
		provider: "acme", fetchedAt: now * 1000, limits: [
			{ id: "acme:credits", label: "Credits", window: { id: "credits", label: "Credits" }, amount: { unit: "count", used: 40, limit: 200 } },
		],
	}], now);
	assert.equal(plain(s.name, s.windows), "acme  Credits ██░░░░░░░░  20%");
});

test("render: color output wraps label-free segments in ANSI, plain does not", () => {
	const w: Window = { label: "5h", used: 0.5, resetsAt: now + H, windowSecs: 5 * H };
	assert.match(renderWindow(w, { now }), /\x1b\[38;2;/);
	assert.doesNotMatch(renderWindow(w, { now, color: false }), /\x1b/);
});
