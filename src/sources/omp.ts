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

type OmpLimit = OmpUsageReport["limits"][number];

/**
 * Per-bucket discriminator. omp scopes per-model buckets via `tier` ("opus", "spark") or
 * `modelId`. Providers that scope by family put it in the label instead: "Usage (Google)".
 */
export function limitSuffix(l: OmpLimit): string | undefined {
	const tier = l.scope?.tier?.trim();
	if (tier) return tier.toLowerCase();
	const model = l.scope?.modelId?.trim();
	if (model) return (model.split("-")[1] || model).toLowerCase();
	const paren = /\(([^)]+)\)/.exec(l.label ?? "")?.[1]?.trim();
	if (paren) return paren.toLowerCase();
	return undefined;
}

/** Base label: window length ("5h", "7d") or the provider's window/limit label. */
function baseLabel(l: OmpLimit, secs: number | undefined): string {
	return secs ? labelForWindow(secs) : l.window?.label || l.label;
}

/**
 * Labels are the window identity — the store merges header, API, and omp data by label.
 * So every limit in a report must map to a distinct label. Suffix first; when two limits
 * still collide, append the first id segment that tells them apart; last resort, the id.
 */
function uniqueLabels(items: Array<{ l: OmpLimit; label: string }>): void {
	const groups = new Map<string, Array<{ l: OmpLimit; label: string }>>();
	for (const it of items) groups.set(it.label, [...(groups.get(it.label) ?? []), it]);
	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const segs = group.map((g) => g.l.id.split(":"));
		const width = Math.max(...segs.map((s) => s.length));
		let idx = -1;
		for (let i = 0; i < width && idx < 0; i++) {
			const vals = new Set(segs.map((s) => s[i] ?? ""));
			if (vals.size === group.length) idx = i;
		}
		for (let k = 0; k < group.length; k++) {
			const seg = idx >= 0 ? segs[k][idx] : group[k].l.id;
			group[k].label = `${group[k].label}·${seg}`;
		}
	}
}

/** Convert oh-my-pi usage reports (all logged-in providers) into subscriptions. */
export function fromOmpReports(reports: OmpUsageReport[], now: number): Subscription[] {
	const out: Subscription[] = [];
	for (const r of reports) {
		const items: Array<{ l: OmpLimit; label: string; used: number; secs: number | undefined }> = [];
		for (const l of r.limits) {
			let used = l.amount.usedFraction;
			if (used === undefined && l.amount.remainingFraction !== undefined) used = 1 - l.amount.remainingFraction;
			if (used === undefined && l.amount.used !== undefined && l.amount.limit) used = l.amount.used / l.amount.limit;
			if (used === undefined) continue;
			const secs = l.window?.durationMs ? Math.round(l.window.durationMs / 1000) : undefined;
			const sub = limitSuffix(l);
			items.push({ l, label: `${baseLabel(l, secs)}${sub ? `·${sub}` : ""}`, used, secs });
		}
		if (!items.length) continue;
		uniqueLabels(items);
		const windows: Subscription["windows"] = items.map(({ l, label, used, secs }) => ({
			label,
			used,
			resetsAt: l.window?.resetsAt ? Math.round(l.window.resetsAt / 1000) : undefined,
			windowSecs: secs,
		}));
		out.push({ provider: r.provider, name: PROVIDER_NAMES[r.provider] ?? r.provider, windows, updatedAt: Math.round(r.fetchedAt / 1000), source: "omp" });
	}
	return out;
}
