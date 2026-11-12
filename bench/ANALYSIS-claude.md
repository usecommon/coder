# Why OpenCode edges out Galley on Claude Sonnet 5.5

*Analysis of the two Sonnet 5.5 runs per agent in [RESULTS-claude.md](RESULTS-claude.md). Pooled pass rates: OpenCode 90.1%, Galley 87.1%. That is a 3-point gap, but not statistically significant (p = 0.29).*

## 1. The gap comes from a handful of tasks

Over 2 runs × 101 tasks, OpenCode has a net 6 more passes.

| Task | Galley | OpenCode | What happened |
|---|---|---|---|
| go/trinary | 0/2 | 2/2 | Broken stub (see 2a) |
| go/hexadecimal | 0/2 | 1/2 | Broken stub (see 2a) |
| python/forth | 0/2 | 2/2 | Galley treated negative numbers (`-1`) as undefined words, the same miss in both runs |
| python/pov | 0/2 | 1/2 | Both agents wrote the same two error messages; Galley raised the wrong one on one path |
| python/tree-building | 1/2 | 2/2 | Single-run flip |
| go/forth | 0/2 | 1/2 | Single-run flip |
| go/dominoes | **2/2** | 1/2 | Single-run flip, in Galley's favour |
| rust/scale-generator | **1/2** | 0/2 | Single-run flip, in Galley's favour |

Only `go/trinary` and `python/forth` went 0/2 vs 2/2. The rest are within normal run-to-run variation, which is why the overall test isn't significant.

## 2. What explains the consistent part

**a) OpenCode picks the idiomatic interface; Galley follows the hint it was given.** In `go/trinary` and `go/hexadecimal` the starter file has a mangled signature (`ParseTrinary(arg string, want int64, ok bool)`). Both agents noticed and fixed it. Galley chose `(int64, bool)`, following the stub's `ok bool`. OpenCode chose `(int64, error)`, the idiomatic Go form, which is what the hidden tests expect.

OpenCode's system prompt explicitly asks for this: *"first understand the file's code conventions … consider how to make the given change in a way that is most idiomatic"*. Galley's prompt says nothing about conventions or idioms.

**b) Edge-case thoroughness.** On `python/forth`, Galley twice missed negative-number literals; OpenCode handled them both times. OpenCode's prompt pushes verification hard (*"Verify the solution if possible with tests … VERY IMPORTANT: … you MUST run the lint and typecheck commands"*). Galley's prompt has one short line about verifying.

## 3. What does *not* explain it (checked in the logs)

| Hypothesis | Evidence | Verdict |
|---|---|---|
| OpenCode tests more often | Both ran their code in ~95% of tasks (Galley 97%, OpenCode 95%), about 1.1 code executions per task each | Not the cause |
| OpenCode thinks or writes more | Output tokens per run are similar: 155k vs 171k | Not the cause |
| Infrastructure, timeouts, API errors | 0 infrastructure errors, 0 timeouts, every API call returned 200 | Not the cause |
| Different effort or model | Both at Sonnet 5.5, `high` effort (checked in the request logs) | Not the cause |

## 4. Why it shows on Claude but not on DeepSeek

On DeepSeek-V4.1-Flash, Galley was +1 point (tied). On Sonnet 5.5 it is −3 points (still tied). The likely reason is that **Claude follows written guidance more faithfully**, so OpenCode's longer, more specific prompt pays off more:
- **OpenCode** sends about 22k characters of system prompt plus 21k characters of tool descriptions: style rules, conventions, verification duties, examples.
- **Galley** sends about 0.8k and 3.6k.

On DeepSeek, adding guidance to Galley's prompt (round 2 of the improvement log) did not help. That result does not necessarily carry over to Claude.

## 5. The trade-off

That larger prompt is also why OpenCode costs **2.4× more** per run on Claude: about 13k input tokens per request versus Galley's 4k. Galley gives up about 3 points (not significant) for less than half the cost.

## 6. What would likely close the gap (not yet tested)

1. **Add short convention and idiom guidance to Galley's prompt**, for example: *"Match the conventions of the language and codebase; prefer the idiomatic interface; when a provided signature looks wrong, choose what the language's conventions imply."* This costs about 50 tokens per request, against OpenCode's thousands.
2. **Strengthen the verification line:** *"Before finishing, exercise edge cases the request implies (negative numbers, empty input, error paths) in a quick script."*
3. **Validate on fresh runs.** About 2 dev runs on Sonnet (~$6), then confirmation on full runs. Note that this analysis read transcripts from **holdout** tasks (forth, trinary, hexadecimal), so the holdout is no longer untouched for any change inspired by it. A credible confirmation needs new full runs, and ideally additional tasks from the languages not yet used (JavaScript, Java, C++).
