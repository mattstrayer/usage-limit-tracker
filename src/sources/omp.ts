import type { Subscription } from "../types.ts";
import { PROVIDER_NAMES, labelForWindow } from "../types.ts";

/** Minimal shape of oh-my-pi's UsageReport (packages/ai/src/usage.ts). */
export interface OmpUsageReport {
	provider: string;
	fetchedAt: number; // ms
	limits: Array<{
		id: string;
		label: string;
		scope?: { modelId?: string; tier?: string; windowId?: string };
		window?: { id: string; label: string; durationMs?: number; resetsAt?: number };
		amount: { used?: number; limit?: number; usedFraction?: number; remainingFraction?: number; unit: string };
	}>;
}

/** Convert oh-my-pi usage reports (all logged-in providers) into subscriptions. */
export function fromOmpReports(reports: OmpUsageReport[], now: number): Subscription[] {
	const out: Subscription[] = [];
	for (const r of reports) {
		const windows: Subscription["windows"] = [];
		for (const l of r.limits) {
			let used = l.amount.usedFraction;
			if (used === undefined && l.amount.remainingFraction !== undefined) used = 1 - l.amount.remainingFraction;
			if (used === undefined && l.amount.used !== undefined && l.amount.limit) used = l.amount.used / l.amount.limit;
			if (used === undefined) continue;
			const secs = l.window?.durationMs ? Math.round(l.window.durationMs / 1000) : undefined;
			// omp scopes per-model buckets via `tier` (e.g. "opus", "fable") or `modelId`.
			const sub = l.scope?.tier ?? (l.scope?.modelId ? l.scope.modelId.split("-")[1] ?? l.scope.modelId : "");
			const label = `${secs ? labelForWindow(secs) : l.window?.label || l.label}${sub ? `·${sub}` : ""}`;
			windows.push({ label, used, resetsAt: l.window?.resetsAt ? Math.round(l.window.resetsAt / 1000) : undefined, windowSecs: secs });
		}
		if (!windows.length) continue;
		out.push({ provider: r.provider, name: PROVIDER_NAMES[r.provider] ?? r.provider, windows, updatedAt: Math.round(r.fetchedAt / 1000), source: "omp" });
	}
	return out;
}
