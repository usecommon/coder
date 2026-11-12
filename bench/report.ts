// Summarize a benchmark run: pass rates, paired comparison, and provider-reported token usage and cost.
// Usage: bun report.ts <results.jsonl> <proxy.jsonl> [--exclude rust/macros,...] > RESULTS.md
import { readFileSync } from "node:fs";

const [resultsPath, proxyPath] = process.argv.slice(2);
const exclude = new Set((process.argv.find((a) => a.startsWith("--exclude="))?.slice(10) ?? "rust/macros,go/octal").split(",").filter(Boolean));
// List prices, USD per 1M tokens: uncached input, cache read, cache write, output. Choose with --prices=<model>.
const PRICES: Record<string, { miss: number; hit: number; write: number; out: number }> = {
  "deepseek-flash": { miss: 0.15, hit: 0.003, write: 0.15, out: 0.6 },
  "claude-sonnet-5-5": { miss: 2, hit: 0.1, write: 2.5, out: 10 },
  "claude-opus-5-5": { miss: 4, hit: 0.2, write: 5, out: 20 },
  "claude-haiku-5-5": { miss: 0.1, hit: 0.01, write: 0.125, out: 0.5 },
};
const priceName = process.argv.find((a) => a.startsWith("--prices="))?.slice(9) ?? "deepseek-flash";
const PRICE = PRICES[priceName] ?? (() => { throw new Error(`unknown --prices=${priceName}; known: ${Object.keys(PRICES).join(", ")}`); })();

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

// When a task-run was interrupted and run again, count only the attempt that produced the result.
const attemptStart = new Map<string, number>(results.filter((r) => r.startedAt).map((r) => [`${r.agent}__${r.lang}__${r.name}`, r.startedAt]));

const usage = (agent: string, filter?: (tag: string) => boolean) => {
  const u = { requests: 0, prompt: 0, hit: 0, write: 0, out: 0, reasoning: 0, errors: 0, cost: 0 };
  for (const c of calls) {
    if (!c.tag?.startsWith(`${agent}__`)) continue;
    const [, lang, name] = c.tag.split("__");
    if (exclude.has(`${lang}/${name}`) || !inSplit(`${lang}/${name}`)) continue;
    if (c.t !== undefined && c.t < (attemptStart.get(c.tag) ?? 0) - 2000) continue;
    if (filter && !filter(c.tag)) continue;
    u.requests++;
    if (c.status !== 200) u.errors++;
    const x = c.usage ?? {};
    // Price each request by the model it actually used (e.g. OpenCode titles sessions with a small model).
    const P = PRICES[c.req?.model] ?? PRICE;
    if (x.input_tokens !== undefined) {
      // Anthropic: input_tokens excludes cache reads and writes.
      const read = x.cache_read_input_tokens ?? 0;
      const write = x.cache_creation_input_tokens ?? 0;
      u.prompt += x.input_tokens + read + write;
      u.hit += read;
      u.write += write;
      u.out += x.output_tokens ?? 0;
      u.cost += (x.input_tokens * P.miss + read * P.hit + write * P.write + (x.output_tokens ?? 0) * P.out) / 1e6;
      continue;
    }
    const prompt = x.prompt_tokens ?? 0;
    const hit = x.prompt_cache_hit_tokens ?? x.prompt_tokens_details?.cached_tokens ?? 0;
    u.prompt += prompt;
    u.hit += hit;
    u.out += x.completion_tokens ?? 0;
    u.cost += ((prompt - hit) * P.miss + hit * P.hit + (x.completion_tokens ?? 0) * P.out) / 1e6;
    u.reasoning += x.completion_tokens_details?.reasoning_tokens ?? 0;
  }
  return u;
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
  return `${a}: ${k(u.prompt / Math.max(u.requests, 1))} input tokens per request, ${pct(u.hit, u.prompt)} served from the provider's prompt cache, ${u.errors} API errors`;
});
out.push(`### Token profile\n`);
for (const p of perReq) out.push(`- ${p}`);
console.log(out.join("\n"));
