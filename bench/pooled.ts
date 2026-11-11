// Pooled comparison over repeated runs.
// Usage: bun pooled.ts --a galley:<results1>,<results2> --b opencode:<results1>,<results2> [--proxies <p1>,<p2>,...]
// For each task, count passes per agent across its runs; compare with a sign test on per-task differences
// and a bootstrap 95% CI of the pass-rate difference (resampling tasks). Reported for all tasks, dev and holdout.
import { readFileSync } from "node:fs";

const arg = (k: string) => process.argv[process.argv.indexOf(`--${k}`) + 1]!;
const parse = (s: string) => {
  const [name, files] = s.split(":") as [string, string];
  return { name, files: files.split(",") };
};
const A = parse(arg("a"));
const B = parse(arg("b"));
const EXCLUDE = new Set(["rust/macros", "go/octal"]);
const splitOf = (key: string) => (BigInt("0x" + new Bun.CryptoHasher("sha256").update(key).digest("hex")) % 2n === 0n ? "dev" : "holdout");

function load(agent: { name: string; files: string[] }) {
  const runs = agent.files.map((f) => {
    const m = new Map<string, boolean>();
    for (const l of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(l);
      if (r.agent === agent.name) m.set(`${r.lang}/${r.name}`, r.pass);
    }
    return m;
  });
  return runs;
}
const ra = load(A);
const rb = load(B);
const tasks = [...ra[0]!.keys()].filter((k) => !EXCLUDE.has(k) && ra.every((m) => m.has(k)) && rb.every((m) => m.has(k))).sort();

function binomTwoSided(k: number, n: number): number {
  if (!n) return 1;
  const pmf = (i: number) => {
    let c = 1;
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
    return c / 2 ** n;
  };
  const m = Math.min(k, n - k);
  let p = 0;
  for (let i = 0; i <= m; i++) p += pmf(i);
  return Math.min(1, 2 * p);
}

function analyze(label: string, keys: string[]) {
  const rate = (runs: Map<string, boolean>[]) => runs.map((m) => keys.filter((k) => m.get(k)).length);
  const pa = rate(ra);
  const pb = rate(rb);
  const meanA = pa.reduce((x, y) => x + y, 0) / pa.length / keys.length;
  const meanB = pb.reduce((x, y) => x + y, 0) / pb.length / keys.length;
  // Per-task pass fractions and their difference.
  const fa = keys.map((k) => ra.filter((m) => m.get(k)).length / ra.length);
  const fb = keys.map((k) => rb.filter((m) => m.get(k)).length / rb.length);
  const d = fa.map((x, i) => x - fb[i]!);
  const pos = d.filter((x) => x > 0).length;
  const neg = d.filter((x) => x < 0).length;
  const p = binomTwoSided(pos, pos + neg);
  // Bootstrap CI over tasks.
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const boots: number[] = [];
  for (let b = 0; b < 5000; b++) {
    let s = 0;
    for (let i = 0; i < keys.length; i++) s += d[Math.floor(rnd() * keys.length)]!;
    boots.push(s / keys.length);
  }
  boots.sort((x, y) => x - y);
  const lo = boots[Math.floor(0.025 * boots.length)]!;
  const hi = boots[Math.floor(0.975 * boots.length)]!;
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  return `| ${label} | ${keys.length} | ${pa.join(", ")} → **${pct(meanA)}** | ${pb.join(", ")} → **${pct(meanB)}** | **${(100 * (meanA - meanB)).toFixed(1)} pts** [${(100 * lo).toFixed(1)}, ${(100 * hi).toFixed(1)}] | ${pos} / ${neg} | **${p.toFixed(3)}** |`;
}

console.log(`| Tasks | n | ${A.name} passes per run → mean | ${B.name} passes per run → mean | Difference [95% CI] | Tasks better for ${A.name} / ${B.name} | Sign test p |`);
console.log(`|---|---|---|---|---|---|---|`);
console.log(analyze("All", tasks));
console.log(analyze("Dev", tasks.filter((k) => splitOf(k) === "dev")));
console.log(analyze("Holdout", tasks.filter((k) => splitOf(k) === "holdout")));
