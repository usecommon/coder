// Summarize a benchmark run: pass rates, paired comparison, and provider-reported token usage and cost.
// Usage: bun report.ts <results.jsonl> <proxy.jsonl> [--exclude rust/macros,...] > RESULTS.md
import { readFileSync } from "node:fs";

const [resultsPath, proxyPath] = process.argv.slice(2);
const exclude = new Set((process.argv.find((a) => a.startsWith("--exclude="))?.slice(10) ?? "rust/macros,go/octal").split(",").filter(Boolean));
// DeepSeek list prices (USD per 1M tokens) for deepseek-flash: cache miss input, cache hit input, output.
const PRICE = { miss: 0.15, hit: 0.003, out: 0.6 };

const lines = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const split = process.argv.find((a) => a.startsWith("--split="))?.slice(8) ?? "all";
const splitOf = (key: string) => (BigInt("0x" + new Bun.CryptoHasher("sha256").update(key).digest("hex")) % 2n === 0n ? "dev" : "holdout");
const inSplit = (key: string) => split === "all" || splitOf(key) === split;
const results = lines(resultsPath!).filter((r) => !exclude.has(`${r.lang}/${r.name}`) && inSplit(`${r.lang}/${r.name}`));
const calls = lines(proxyPath!);
const agents = [...new Set(results.map((r) => r.agent))].sort();
const langs = [...new Set(results.map((r) => r.lang))];

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(0)}k`);

// Exact two-sided McNemar test on discordant pairs.
function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  let p = 0;
  const m = Math.min(b, c);
  let comb = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) comb = (comb * (n - i + 1)) / i;
    if (i <= m) p += comb;
  }
  return Math.min(1, (2 * p) / 2 ** n);
}

const usage = (agent: string, filter?: (tag: string) => boolean) => {
  const u = { requests: 0, prompt: 0, hit: 0, out: 0, reasoning: 0, errors: 0 };
  for (const c of calls) {
    if (!c.tag?.startsWith(`${agent}__`)) continue;
    const [, lang, name] = c.tag.split("__");
    if (exclude.has(`${lang}/${name}`) || !inSplit(`${lang}/${name}`)) continue;
    if (filter && !filter(c.tag)) continue;
    u.requests++;
    if (c.status !== 200) u.errors++;
    const x = c.usage ?? {};
    u.prompt += x.prompt_tokens ?? 0;
    u.hit += x.prompt_cache_hit_tokens ?? x.prompt_tokens_details?.cached_tokens ?? 0;
    u.out += x.completion_tokens ?? 0;
    u.reasoning += x.completion_tokens_details?.reasoning_tokens ?? 0;
  }
  return { ...u, cost: ((u.prompt - u.hit) * PRICE.miss + u.hit * PRICE.hit + u.out * PRICE.out) / 1e6 };
};

const by = (agent: string) => results.filter((r) => r.agent === agent);
const out: string[] = [];
out.push(`## Results\n`);
out.push(`Tasks scored: ${results.length / agents.length} per agent (excluded: ${[...exclude].join(", ") || "none"}).\n`);
out.push(`| Agent | Pass rate | ${langs.map((l) => l[0]!.toUpperCase() + l.slice(1)).join(" | ")} | Timeouts | Median time | Requests | Input tokens (cached) | Output tokens | Cost | Cost per solved task |`);
out.push(`|---|---|${langs.map(() => "---|").join("")}---|---|---|---|---|---|---|`);
for (const a of agents) {
  const rs = by(a);
  const pass = rs.filter((r) => r.pass).length;
  const u = usage(a);
  out.push(
    `| **${a}** | **${pass}/${rs.length} (${pct(pass, rs.length)})** | ${langs
      .map((l) => {
        const x = rs.filter((r) => r.lang === l);
        return `${x.filter((r) => r.pass).length}/${x.length}`;
      })
      .join(" | ")} | ${rs.filter((r) => r.agentTimedOut).length} | ${Math.round(median(rs.map((r) => r.agentMs)) / 1000)}s | ${u.requests} | ${k(u.prompt)} (${pct(u.hit, u.prompt)}) | ${k(u.out)} | $${u.cost.toFixed(3)} | $${(u.cost / Math.max(pass, 1)).toFixed(4)} |`,
  );
}
if (agents.length === 2) {
  const [A, B] = agents as [string, string];
  const key = (r: any) => `${r.lang}/${r.name}`;
  const bMap = new Map(by(B).map((r) => [key(r), r.pass]));
  let both = 0, onlyA = 0, onlyB = 0, neither = 0;
  const onlyAList: string[] = [], onlyBList: string[] = [];
  for (const r of by(A)) {
    const pb = bMap.get(key(r));
    if (r.pass && pb) both++;
    else if (r.pass) (onlyA++, onlyAList.push(key(r)));
    else if (pb) (onlyB++, onlyBList.push(key(r)));
    else neither++;
  }
  out.push(`\n### Paired comparison\n`);
  out.push(`| Both pass | Only ${A} | Only ${B} | Neither |\n|---|---|---|---|\n| ${both} | ${onlyA} | ${onlyB} | ${neither} |\n`);
  out.push(`Exact McNemar test on the ${onlyA + onlyB} tasks where they disagree: **p = ${mcnemar(onlyA, onlyB).toFixed(3)}** (p < 0.05 would indicate a real difference in pass rate on this task set).\n`);
  out.push(`- Only ${A}: ${onlyAList.join(", ") || "none"}`);
  out.push(`- Only ${B}: ${onlyBList.join(", ") || "none"}\n`);
}
const perReq = agents.map((a) => {
  const u = usage(a);
  return `${a}: ${k(u.prompt / Math.max(u.requests, 1))} input tokens per request, ${pct(u.hit, u.prompt)} served from DeepSeek's cache, ${u.errors} API errors`;
});
out.push(`### Token profile\n`);
for (const p of perReq) out.push(`- ${p}`);
console.log(out.join("\n"));
