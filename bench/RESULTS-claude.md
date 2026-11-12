# Results: Galley vs OpenCode on Claude Sonnet 5.5

*Run on 12 November 2026. Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`) for both agents, both at **high** reasoning effort. Tasks: the same 101 scored Aider Polyglot exercises (Python, Go, Rust) as the DeepSeek comparison. Protocol: [README.md](README.md): no internet access, hidden tests, sandboxed grading, token usage as reported by Anthropic. Two full runs per agent.*

> **Correction, 12 November 2026 (cost figures).** In these runs OpenCode auto-loaded 14 unrelated skills from this machine's `~/.claude/skills` folder (document, spreadsheet and browser skills) and listed them in its system prompt: about 13,000 of its 21,800 system-prompt characters, roughly 4,400 extra tokens on every request. On a clean machine that listing would not be there. It cost OpenCode an estimated **$1.25 per run**, so its clean cost is about **$5.5 per run** and Galley's advantage is about **2.0×**, not the 2.4× measured below. Pass rates are reported as measured; whether the extra text affected them is unknown. The harness now hides the host's agent configuration from both agents, and a clean OpenCode re-run is needed to replace the estimate.

> **Audit, 12 November 2026.** The DeepSeek runs were found to be affected by holes in the benchmark sandbox (see [RESULTS.md](RESULTS.md)). The same audit of every transcript in these Sonnet runs found nothing: neither agent read hidden tests, other tasks' folders or files outside its workspace. The pass rates below stand as measured.

## Headline

| | Galley | OpenCode 1.19.5 |
|---|---|---|
| **Pass rate** (run 1, run 2 → mean) | 89, 87 → **87.1%** | 94, 88 → **90.1%** |
| Holdout tasks (54) | 82.4% | 88.0% |
| **Cost per full run** | **$2.78** | $6.70 |
| **Cost per solved task** | **$0.032** | $0.074 |
| Median time per task | **15 s** | 20 s |
| Input tokens per request | **~4k** | ~13k |
| Model requests per run | ~330 | ~437 (incl. ~100 Claude Haiku 5.5 calls for session titles) |

**Pass rate: OpenCode is ahead, but not significantly.** The pooled difference is −3.0 points for Galley (95% CI [−6.9, 0.0]; sign test over tasks p = 0.29). On the dev half the two are identical (92.6% each); the gap is on the holdout half (−5.6 points, p = 0.22).

**Cost: Galley is 2.4× cheaper**, $2.78 against $6.70 per full run, and about 57% cheaper per solved task. The saving is larger than on DeepSeek because Claude's input tokens cost more relative to output, and Galley sends about a third of the input tokens per request. It is also about 25% faster per task.

Model spend for this comparison was **$19.52** (Galley $5.71, OpenCode $13.81, including the smoke test), under the ~$50 estimate.

## Where OpenCode wins

Across both runs, OpenCode solved 6 tasks more often than Galley and Galley solved 2 more often than OpenCode. Two of OpenCode's wins, `go/hexadecimal` and `go/trinary`, come from a defect in the benchmark: the starter file declares a function signature that the hidden tests don't use (the same defect as the excluded `go/octal`). **Galley kept the given signature; OpenCode changed it to the conventional one the tests expect.** These tasks are counted, because removing them only after seeing who won would bias the result. They are a real difference in behaviour: Galley follows the code it was given more literally.

The remaining differences (for example `python/forth` and `python/pov`) are exact-behaviour misses: an error message or an error case the hidden tests check.

## Compared with DeepSeek

| | DeepSeek-V4.1-Flash | Claude Sonnet 5.5 |
|---|---|---|
| Galley pass rate | 68.8% | 87.1% |
| OpenCode pass rate | 67.8% | 90.1% |
| Difference (Galley − OpenCode) | +1.0 pts (p = 0.63) | −3.0 pts (p = 0.29) |
| Galley cost advantage per run | 12% cheaper | **58% cheaper** (2.4×) |

On both models, **the pass rates are statistically tied, and Galley is cheaper**. The stronger model widens Galley's cost advantage considerably. On Sonnet, OpenCode's point estimate is 3 points higher, so Galley is not better on pass rate, and may be slightly worse.

## Verdict

By the criteria fixed in advance (a lead of at least 5 points with p < 0.05), **Galley is not better than OpenCode on either model. Pass rates are tied within noise. Galley delivers that roughly equal success at much lower cost: 2.4× cheaper on Claude Sonnet 5.5.**

Raw per-task results and per-request usage are in [`data/sonnet-5-5/`](data/sonnet-5-5/).
