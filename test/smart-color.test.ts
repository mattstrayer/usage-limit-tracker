import { test } from "node:test";
import assert from "node:assert/strict";
import { risk, zone, riskColor, MUTED, VIVID, thresholdRisk } from "../src/smart-color.ts";
import { renderWindow, elapsedFraction } from "../src/render.ts";

// TokenEater validation matrix (Balanced profile)
test("burst at window start stays chill", () => {
	assert.equal(zone(risk(0.05, 0.01)), "chill");
});
test("80% used at 50% elapsed is hot", () => {
	assert.equal(zone(risk(0.8, 0.5)), "hot");
});
test("98% used with 30 min left on 5h is hot", () => {
	assert.equal(zone(risk(0.98, 0.9)), "hot");
	assert.deepEqual(riskColor(risk(0.98, 0.9), VIVID), VIVID.critical);
});
test("72% used at 80% elapsed is calm", () => {
	assert.ok(["chill", "ontrack"].includes(zone(risk(0.72, 0.8))));
});
test("continuous — no cliff between adjacent samples", () => {
	const a = risk(0.75, 0.79), b = risk(0.75, 0.8);
	assert.ok(Math.abs(a - b) < 0.02);
});
test("threshold gauge maps 60/85", () => {
	assert.deepEqual(riskColor(thresholdRisk(0.1), VIVID), VIVID.normal);
	assert.deepEqual(riskColor(thresholdRisk(0.9), VIVID), VIVID.critical);
	assert.notDeepEqual(riskColor(thresholdRisk(0.7), VIVID), VIVID.normal);
});
test("elapsed fraction", () => {
	assert.equal(elapsedFraction(1000 + 9000, 18000, 1000), 0.5);
	assert.equal(elapsedFraction(500, 18000, 1000), 1);
});
test("render plain", () => {
	const s = renderWindow({ label: "5h", used: 0.42, resetsAt: 1000 + 9000, windowSecs: 18000 }, { now: 1000, color: false });
	assert.equal(s, "5h ████░│░░░░  42% ● 2h30m");
});
test("render context bar without window", () => {
	const s = renderWindow({ label: "ctx", used: 0.08 }, { color: false });
	assert.equal(s, "ctx ░░░░░░░░░░   8%");
});
