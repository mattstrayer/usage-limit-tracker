/**
 * Render demo lines to docs/demo.svg (exact colors, no terminal needed).
 * Usage: node --experimental-strip-types scripts/svg.ts > docs/demo.svg
 */
import { renderLine } from "../src/render.ts";
import { MUTED } from "../src/smart-color.ts";

const now = 1_700_000_000;
const H = 3600;
const lines = [
	renderLine("Claude", [
		{ label: "5h", used: 0.14, resetsAt: now + 4.33 * H, windowSecs: 5 * H },
		{ label: "7d", used: 0.04, resetsAt: now + 89 * H, windowSecs: 168 * H },
		{ label: "7d·opus", used: 0.06, resetsAt: now + 89 * H, windowSecs: 168 * H },
	], { now, palette: MUTED }),
	renderLine("ChatGPT Pro", [
		{ label: "5h", used: 0.72, resetsAt: now + 0.68 * H, windowSecs: 5 * H },
		{ label: "7d", used: 0.41, resetsAt: now + 67 * H, windowSecs: 168 * H },
	], { now, palette: MUTED }),
	renderLine("Claude", [
		{ label: "5h", used: 0.98, resetsAt: now + 0.5 * H, windowSecs: 5 * H },
		{ label: "7d", used: 0.61, resetsAt: now + 55 * H, windowSecs: 168 * H },
	], { now, palette: MUTED }),
];

// ANSI → SVG tspans. Handles: 0 reset, 1 bold, 2 dim, 38;2;r;g;b fg.
const FG = "#d4d4d4", BG = "#1e1e1e", DIMC = "#5a5a5a";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function toTspans(line: string): string {
	let out = "", color = FG, bold = false, dim = false;
	const re = /\x1b\[([0-9;]*)m/g;
	let last = 0, m: RegExpExecArray | null;
	const flush = (txt: string) => {
		if (!txt) return;
		const c = dim ? DIMC : color;
		out += `<tspan fill="${c}"${bold ? ' font-weight="bold"' : ""}>${esc(txt).replace(/ /g, " ")}</tspan>`;
	};
	while ((m = re.exec(line))) {
		flush(line.slice(last, m.index));
		last = re.lastIndex;
		const p = m[1].split(";").map(Number);
		if (p[0] === 0) { color = FG; bold = false; dim = false; }
		else if (p[0] === 1) bold = true;
		else if (p[0] === 2) dim = true;
		else if (p[0] === 38 && p[1] === 2) { color = `rgb(${p[2]},${p[3]},${p[4]})`; dim = false; }
	}
	flush(line.slice(last));
	return out;
}

const cw = 8.4, lh = 22, pad = 16;
const cols = Math.max(...lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").length));
const w = Math.ceil(cols * cw + pad * 2), h = lines.length * lh + pad * 2;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">
<rect width="100%" height="100%" rx="8" fill="${BG}"/>
`;
lines.forEach((l, i) => { svg += `<text x="${pad}" y="${pad + lh * (i + 1) - 6}" xml:space="preserve">${toTspans(l)}</text>\n`; });
svg += "</svg>\n";
process.stdout.write(svg);
