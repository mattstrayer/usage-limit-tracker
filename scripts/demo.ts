import { renderLine } from "../src/render.ts";
const now = Math.floor(Date.now() / 1000);
const H = 3600;
console.log(renderLine("Claude Max", [
  { label: "5h", used: 0.04, resetsAt: now + 4 * H, windowSecs: 5 * H },
  { label: "7d", used: 0.02, resetsAt: now + 90 * H, windowSecs: 168 * H },
]));
console.log(renderLine("Claude Max", [
  { label: "5h", used: 0.80, resetsAt: now + 2.5 * H, windowSecs: 5 * H },
  { label: "7d", used: 0.61, resetsAt: now + 55 * H, windowSecs: 168 * H },
]));
console.log(renderLine("ChatGPT Plus", [
  { label: "5h", used: 0.98, resetsAt: now + 0.5 * H, windowSecs: 5 * H },
  { label: "wk", used: 0.45, resetsAt: now + 27 * H, windowSecs: 168 * H },
]));
