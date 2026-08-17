import type { Subscription } from "../types.ts";
import { PROVIDER_NAMES, labelForWindow } from "../types.ts";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

const toSecs = (t: unknown) => (typeof t === "number" && Number.isFinite(t) ? (t > 1e12 ? Math.round(t / 1000) : Math.round(t)) : undefined);

/** Poll the ChatGPT Codex usage endpoint. */
export async function fetchCodexUsage(token: string, accountId: string | undefined, now: number, fetchImpl: typeof fetch = fetch): Promise<Subscription | undefined> {
	const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "pi-usage-limit-tracker" };
	if (accountId) headers["chatgpt-account-id"] = accountId;
	const res = await fetchImpl(USAGE_URL, { headers });
	if (!res.ok) throw new Error(`codex usage ${res.status}`);
	return parseCodexUsage((await res.json()) as Record<string, any>, now);
}

export function parseCodexUsage(j: Record<string, any>, now: number): Subscription | undefined {
	const windows: Subscription["windows"] = [];
	const add = (w: any, dflt: number) => {
		if (!w || typeof w !== "object" || typeof w.used_percent !== "number") return;
		const secs = typeof w.limit_window_seconds === "number" ? w.limit_window_seconds : dflt;
		const resetsAt = toSecs(w.reset_at) ?? (typeof w.reset_after_seconds === "number" ? now + Math.round(w.reset_after_seconds) : undefined);
		windows.push({ label: labelForWindow(secs), used: w.used_percent / 100, resetsAt, windowSecs: secs });
	};
	add(j.rate_limit?.primary_window, 5 * 3600);
	add(j.rate_limit?.secondary_window, 7 * 86400);
	if (!windows.length) return undefined;
	const plan = typeof j.plan_type === "string" ? j.plan_type : "";
	const name = plan ? `${PROVIDER_NAMES["openai-codex"]} ${plan[0].toUpperCase()}${plan.slice(1)}` : PROVIDER_NAMES["openai-codex"];
	return { provider: "openai-codex", name, windows, updatedAt: now, source: "usage-api" };
}
