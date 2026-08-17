import type { Subscription } from "../types.ts";
import { PROVIDER_NAMES } from "../types.ts";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const HEADERS = {
	accept: "application/json",
	"anthropic-beta": "oauth-2025-04-20",
	"user-agent": "claude-cli/2.1.0 (external, cli)",
};

const isoToSecs = (s: unknown) => (typeof s === "string" && !Number.isNaN(Date.parse(s)) ? Math.round(Date.parse(s) / 1000) : undefined);

/** Poll Anthropic's OAuth usage endpoint. Token must be a Claude OAuth access token (sk-ant-oat…). */
export async function fetchAnthropicUsage(token: string, now: number, fetchImpl: typeof fetch = fetch): Promise<Subscription | undefined> {
	const res = await fetchImpl(USAGE_URL, { headers: { ...HEADERS, authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`anthropic usage ${res.status}`);
	const j = (await res.json()) as Record<string, any>;
	return parseAnthropicUsage(j, now);
}

export function parseAnthropicUsage(j: Record<string, any>, now: number): Subscription | undefined {
	const windows: Subscription["windows"] = [];
	const add = (label: string, b: any, secs: number) => {
		if (!b || typeof b !== "object") return;
		const u = typeof b.utilization === "number" ? b.utilization / 100 : undefined;
		if (u === undefined) return;
		windows.push({ label, used: u, resetsAt: isoToSecs(b.resets_at), windowSecs: secs });
	};
	add("5h", j.five_hour, 5 * 3600);
	add("7d", j.seven_day, 7 * 86400);
	add("7d·opus", j.seven_day_opus, 7 * 86400);
	add("7d·sonnet", j.seven_day_sonnet, 7 * 86400);
	if (!windows.length) return undefined;
	return { provider: "anthropic", name: PROVIDER_NAMES.anthropic, windows, updatedAt: now, source: "usage-api" };
}
