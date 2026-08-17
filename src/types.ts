import type { Window } from "./render.ts";

/** One logged-in subscription (Claude Max, ChatGPT Plus, …) and its quota windows. */
export interface Subscription {
	/** Provider id as pi/omp knows it: "anthropic", "openai-codex", … */
	provider: string;
	/** Display name, e.g. "Claude", "ChatGPT Pro". */
	name: string;
	windows: Window[];
	/** Unix seconds when this data was observed. */
	updatedAt: number;
	/** Where it came from: "headers" | "usage-api" | "omp". */
	source: string;
}

export const PROVIDER_NAMES: Record<string, string> = {
	anthropic: "Claude",
	"openai-codex": "ChatGPT",
	"github-copilot": "Copilot",
	"google-gemini-cli": "Gemini",
	"google-antigravity": "Antigravity",
	cursor: "Cursor",
	kimi: "Kimi",
	"kimi-coding": "Kimi",
	xai: "xAI",
};

export function labelForWindow(secs: number | undefined): string {
	if (!secs) return "now";
	const h = secs / 3600;
	if (h <= 1) return `${Math.round(secs / 60)}m`;
	if (h < 24) return `${Math.round(h)}h`;
	const d = h / 24;
	if (d >= 28 && d <= 31) return "mo";
	return `${Math.round(d)}d`;
}
