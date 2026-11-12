# Beating OpenCode: what the evidence says to try next

*Research compiled 12 November 2026. It combines Galley's own benchmark data ([`bench/`](../bench/)) with research papers, vendor documentation and engineering write-ups. Each source is marked by how it was checked: **[read]** means the primary page was read (fully or in large part); **[search]** means only the abstract or a search summary was seen, so the numbers are unverified.*

> **Reviewed 12 November 2026.** A review of the plan in section 4 found that the benchmark itself had leaked hidden tests to OpenCode on DeepSeek, that our own data contradicts the expected gain from the plan's main step, and that the win rule was harder to meet than this report said. Section 4 now holds the review and the revised plan; the points it overturns are marked where they appear.

## Bottom line

1. **Galley and OpenCode are tied on pass rate, and the easy fixes have not changed that.** Prompt wording, self-review and extra verification did not move Galley's score in our tests. The literature agrees: automated prompt and harness tuning mostly fails to generalise to new tasks.
2. **The one method with strong, repeated evidence in the literature is to make several independent attempts and choose between them by running code.** Our own data puts the ceiling at **+12 points on DeepSeek** with three attempts and about +2 on Claude. Published systems capture a third to a half of that ceiling. Simple majority voting captures almost none. *Review: on this benchmark the choosing step has little to go on. Tests written without sight of the hidden tests passed 82 to 91% of the solutions that then failed them (section 4), so the realistic gain here is +1 to +2 points, at three times the cost.*
3. **This research turned up two real gaps in Galley and one flaw in the benchmark.** Galley does not pass DeepSeek's reasoning back between tool calls, which DeepSeek's documentation requires and OpenCode does. Galley's default effort setting for Claude is higher than Anthropic's suggested starting point for this kind of task. And OpenCode's costs in our benchmark were inflated by unrelated skills it picked up from this machine.
4. **On the current Claude benchmark a clear win is not possible.** OpenCode already scores 90% and the best achievable is about 94%. Proving a win needs harder tasks, a weaker model, or many more runs.
5. **Recommended order (revised after review):** fix the benchmark's sandbox first, then re-measure both agents on DeepSeek side by side with the reasoning hand-off as a third arm (about $7), then check `medium` effort on Claude (about $7). Attempt-and-select gets a cheap offline test before any build. See section 4.
6. **The DeepSeek baseline was contaminated, in OpenCode's favour.** OpenCode read hidden tests through holes in the benchmark sandbox in 22 task-runs; Galley in none. With those removed the comparison is 68.8% vs 65.5% (+3.3 points, 95% interval −2.0 to +8.6): still a tie, but Galley may already be slightly ahead.

## 1. What we know now

### Results so far

| | DeepSeek-V4.1-Flash | Claude Sonnet 5.5 |
|---|---|---|
| Galley pass rate | 68.8% (2 runs) | 87.1% (2 runs) |
| OpenCode pass rate | 67.8% (4 runs) | 90.1% (2 runs) |
| Difference, 95% interval | +1.0 points, −5.7 to +5.9 | −3.0 points, −6.9 to 0.0 |
| Cost per run, as measured | $0.67 vs $0.76 | $2.78 vs $6.70 |

*Review, 12 November: the DeepSeek pass rate for OpenCode in this table is inflated by a leak in the benchmark sandbox. With the 22 affected task-runs removed it is 65.5%, and the difference is +3.3 points (−2.0 to +8.6). The Sonnet runs were not affected. See section 4 and [`bench/RESULTS.md`](../bench/RESULTS.md).*

### Three corrections from this research pass

**OpenCode's costs were inflated by this machine's setup.** OpenCode automatically loads "skills" from the user's `~/.claude/skills` folder. This machine has 14 unrelated ones (Word, Excel, PDF, browser control and so on), and OpenCode listed all of them in its system prompt on every request: about 13,000 of 21,800 characters. On a clean machine they would not be there. The estimated effect:

| | As measured | Estimated on a clean machine |
|---|---|---|
| OpenCode cost per Sonnet run | $6.70 | about $5.5 |
| Galley's cost advantage on Sonnet | 2.4× | about 2.0× |
| Galley's cost advantage on DeepSeek | 12% | about 6% |

Whether the extra text affected OpenCode's pass rate is unknown. The benchmark now hides the host's agent configuration from both agents; I confirmed OpenCode's prompt drops from 21,800 to 9,400 characters. A clean OpenCode re-run is needed to replace the estimates.

**My earlier explanation of OpenCode's edge on Claude was wrong.** I had said its system prompt tells the model to write idiomatic code and verify its work. Those lines are in the prompt OpenCode sends to DeepSeek-type models. The prompt it actually sends to Claude has no such guidance; it is mostly about tone and keeping a todo list. The 3-point gap on Claude has no established cause and may be chance. [`bench/ANALYSIS-claude.md`](../bench/ANALYSIS-claude.md) is corrected.

**Galley skips a step DeepSeek's documentation requires.** DeepSeek's thinking-mode guide says that when tools are in use, the model's reasoning text "must be fully passed back to the API in all subsequent requests", "allowing the model to continue its previous reasoning" **[read]**. I tested both agents against a local fake server. OpenCode passes the reasoning back. Galley drops it, though a config option (`sendReasoning`) already exists to turn it on. Every DeepSeek run so far had Galley working without its own earlier reasoning. DeepSeek did not reject the requests, so the effect on results is unknown.

### What our own data says about headroom

Each task was run several times, so we can see how often each one passes.

| | Galley on DeepSeek (3 runs) | Galley on Sonnet (2 runs) |
|---|---|---|
| Single run, average | 69.3% | 87.1% |
| Tasks that always pass | 56.4% | 85.1% |
| Tasks that never pass | 18.8% | 10.9% |
| Tasks that pass only sometimes | **24.8%** | 4.0% |
| If the best of 2 attempts could be picked perfectly | 77.6% | 89.1% |
| If the best of 3 attempts could be picked perfectly | **81.2%** | not measured |
| Majority vote of 3 attempts | 70.3% | not measured |

The three DeepSeek runs here include the original baseline run, so the average differs slightly from the two-run figure above.

- **On DeepSeek, a quarter of tasks pass or fail by luck.** Picking the right attempt out of three would be worth up to 12 points. Blind voting is worth 1.
- **On Sonnet there is little luck to exploit.** The limit is the tasks nobody solves: across all four Sonnet runs by both agents, only 94.1% of tasks were ever solved by anyone.
- **On Sonnet both agents finish a typical task in about three model calls**, almost all through the shell. The harness barely gets exercised, which is why the two score alike.

### How many runs it takes to prove a gain

Computed from how often the two agents disagree on a task (16% of tasks per run on DeepSeek, 5% on Sonnet), for 80% power at p < 0.05:

| Gain to detect | Task-runs needed per agent, DeepSeek | Task-runs needed per agent, Sonnet |
|---|---|---|
| +3 points | about 1,380 | about 430 |
| +5 points | about 500 | about 150 |
| +8 points | about 190 | about 60 |
| +10 points | about 120 | about 40 |

One full run is 101 task-runs. Our improvement rounds used 47 to 94 per variant, enough to detect only gains of 10 points or more. That explains why nothing "worked": a real 3-point gain would have been invisible.

*Review, 12 November: this table is too optimistic. It treats every task-run as independent, but repeated runs of the same task are not, and it covers only the significance half of the win rule. A simulation from our per-task data is in section 4: detecting a true +5 at p < 0.05 takes about 8 runs of 122 tasks (close to 1,000 task-runs per agent), and the full rule is met only about half the time when the true gain is exactly +5.*

## 2. Methods, ranked by strength of evidence

### A. Several attempts, selected by running code

**The idea.** Run the task N times independently. Then choose which result to keep by executing the candidates, not by asking the model which looks best.

**Evidence.**

| Source | Setting | Result |
|---|---|---|
| Wang et al., *Rethinking the Evaluation of Harness Evolution* (AI2 / Univ. of Washington, 2026) **[read]** | Terminal-Bench 2.1, 5 attempts, no tests available, model judges its own attempts | 68.2% → 72.3% averaged over three models (Opus 4.6: 69.9 → 74.7). Automated harness tuning at the same budget: 67.4%. |
| Same paper | Same, but with tests available to check attempts | 72.9% → 86.0% |
| Trae Agent (ByteDance, 2025) **[read in part]** | SWE-bench Verified; candidates pruned by existing tests, then a selector agent writes and runs its own tests | 75.2%, first on the leaderboard at the time. With 3 Claude attempts: 66.4% selected, against 70.0% if selection were perfect. Selection by a model reading the patches without running them beat random choice by only 1 to 3%. |
| S* (Berkeley, 2025) **[read in part]** | LiveCodeBench, 16 attempts; selection by generating inputs on which two candidates differ, running both, and judging the real outputs | GPT-4o-mini: 40.9% alone, 46.6% with majority vote, **61.3%** with S*. A 32B open model: 69.1% → 75.8% → 85.7%. |
| CodeMonkeys (Stanford, 2025) **[search]** | SWE-bench Verified | Perfect selection 69.8%, their selection 57.4%, random 45.8%: about half the gap closed |
| CodeT (Microsoft, 2022) **[search]** | HumanEval | +18.8 points from selecting by agreement between generated code and generated tests |
| Cursor 3 `/best-of-n` **[search]** | Commercial product | Runs a task in several git worktrees and has a parent agent compare the results |

**How it fits our findings.** It targets exactly the luck we measured: 25% of DeepSeek tasks pass only sometimes. Majority voting gave +1 point in our data and +6 against S*'s +20 in theirs.

*Review, 12 November: I wrote here that our verifier was a different mechanism from selection by execution. That was too kind to the plan. The verifier did execute: a fresh helper wrote its own tests and ran them against the solution. Its verdicts did not track the hidden tests (section 4). A selector that scores attempts with self-written tests would rest on the same weak signal. The published gains come from benchmarks where some real tests or reproducible bug reports are visible; here none are.*

**Expected gain (my estimate).** Published systems capture roughly a third to a half of the perfect-selection ceiling. That suggested +4 to +6 points on DeepSeek with three attempts and about +1 on Sonnet. *Revised after review: +1 to +2 points on DeepSeek on this benchmark, because the hidden-test failures are mostly invisible to self-written tests. It may do better on real repositories that have tests of their own.*

**Cost.** About N times a single attempt, plus selection. On DeepSeek three attempts would cost about $2.30 per run against OpenCode's $0.76: a better pass rate at three times the price. On Sonnet two attempts would cost about $6, similar to OpenCode.

**Design points from the papers.**
- Select by execution. Reading patches and voting does not work.
- Remove duplicates, and drop any candidate that breaks existing tests, before selecting.
- Stop early when the first attempts agree. On Sonnet two attempts reached the same outcome on 96% of tasks, so a third would rarely be needed.
- Variety helps: Trae's perfect-selection rate rose from 70.0% to 73.4% when attempts came from different models.

**Fit with Galley.** Good. Git worktrees, the sandbox and read-only helper agents already exist; the missing piece is the selector.

### B. Fit the harness to each model

**The idea.** The best settings, prompt and tools differ by model. Tune per model family instead of using one configuration everywhere.

**Evidence.**
- *An Empirical Study of Harness Design for Coding Agents* (2026) **[read]**: 176 controlled configurations on four models. A planning step raised the weakest model's SWE-bench score from 13.6% to 25.2%. On the stronger models it changed the score by −0.4 to −2.6 points, and on the two strongest it also cut cost by about 30%. Dedicated tools against shell-only flipped by model: 25.2% vs 10.2% for the weakest; 65.8% vs 69.4% for the strongest, at half the cost. The authors conclude the best harness depends on model, task and budget. Each configuration was run once.
- *Harness Engineering* source-code study of eleven agents (2026) **[read in part]**: OpenCode ships nine different system prompts, one per model family.
- **DeepSeek's thinking-mode guide [read]**: reasoning must be passed back during tool use (see section 1). Galley does not do this.
- **Anthropic's prompting guide for Sonnet 5.5 [read]**, with the same guidance in the local Anthropic docs **[read]**:
  - Effort levels were recalibrated. "Start at `medium` for well-specified tasks and move to `high` for harder or longer ones." Reserve `xhigh` and `max` for a measured gain.
  - The model follows instructions literally. Remove wording that discourages tool use.
  - Accept near-miss tool calls (a parameter under a slightly different name) instead of failing them.
  - At `low` effort the model can skip verification; the guide supplies a paragraph to add in that case.

**How it fits our findings.**
- Galley is missing DeepSeek's reasoning hand-off, and still tied OpenCode on DeepSeek.
- We ran both agents on Sonnet at `high`. On Galley, output tokens (mostly thinking) are 56% of the Sonnet bill; on OpenCode they are 25%. So effort is Galley's main cost dial: `medium` should cut its cost further, and `xhigh` could buy quality while staying under OpenCode's price. Both are untested.
- Galley's prompt says "keep changes focused" and "be concise". Given how literally Sonnet 5.5 follows instructions, these may hold it back on tasks that need a broken starter file repaired. Untested.

**Expected gain.** Unknown for each item; all are cheap to test. A fair comparison must then also run OpenCode at its own defaults, since we forced it to `high` as well.

### C. Verification at the finish line

**Evidence.**
- Stechly, Valmeekam and Kambhampati (ICLR 2025) **[search]**: when a model critiques its own answers, accuracy falls with each round, because it rejects correct answers. A sound external checker helps.
- *Agentic Harness Engineering* (2026) **[read in part]**: a hook that forces one final check before the agent stops was worth +2.2 points on Terminal-Bench 2. In the same breakdown, system-prompt changes alone were worth **−2.3**. Both numbers were measured on the tasks used for tuning.
- ForgeCode's Terminal-Bench write-ups **[search]** and the Hermes agent **[read in part]** both enforce a verification step before finishing.
- Anthropic **[read]**: Sonnet 5.5 generally checks its work before reporting done, except at `low` effort.

**How it fits our findings.** Our self-review and verifier experiments found no gain, and both agents already ran their code in about 95% of Sonnet tasks. On short tasks this is done already. It may matter on long tasks, where agents drift.

**Verdict.** Low priority now. Revisit if Galley moves to long-horizon benchmarks.

### D. Tool and interface design

**Evidence.**
- SWE-agent (Princeton, 2024) **[search]**: a purpose-built interface with a linter-checked edit command scored 18.0% against 11.0% for a bare shell, on a 2024-era model.
- The harness-design study above **[read]**: dedicated tools matter most for weak models; the strongest did better with the shell alone.
- *The Devil Is in the Interface* (2026) **[search]**: 11,700 trajectories across six tool layouts; a code-writing interface reportedly matched task performance with 42% fewer steps.
- *Harness Engineering* **[read in part]**: "The file-editing strategy is one of the most important determinants of code-modification accuracy." OpenCode's edit tool tries nine matching strategies in turn.
- Darwin Gödel Machine (2025) **[search]**: an agent that rewrote its own tools went from 14.2% to 30.7% on this same Polyglot benchmark, at very high cost and from a weak 2025 starting point.

**How it fits our findings.** On Sonnet both agents bypass the file tools for the shell, and Galley's tool errors were rare. There is little to gain on the current benchmark. This matters for small local models, which Galley wants to serve well.

**Verdict.** Cheap insurance for weak models: report syntax errors straight after an edit, and accept near-miss parameter names. Measure on a small model, not on Sonnet.

### E. Handling ambiguity

**Evidence.**
- ClarifyGPT (2023) **[search]**: asking clarifying questions on ambiguous requirements raised GPT-4 from 71% to 81% on one benchmark.
- TiCoder (Microsoft, 2024) **[search]**: confirming generated tests with the user raised pass rates by about 46 points within five questions (simulated users).
- Vijayvargiya et al. (2025) **[search]**: agents rarely ask unprompted. When they do ask on under-specified tasks, results improve by up to 74%.

**How it fits our findings.** This is the largest category of Galley's persistent failures: hidden tests expect a convention the instructions never state (a list or a string, which error message). A benchmark with no user to ask cannot reward it.

**Verdict.** Valuable for the product: an "ask the user" tool in interactive mode, and a list of assumptions in headless mode. It will not move a headless benchmark.

### F. Automated prompt and harness optimisation

**Evidence.**
- GEPA (2025) **[search]**: evolves prompts by reading failures; +13% across its benchmarks.
- *Agentic Harness Engineering* **[read in part]**: 69.7% → 77.0% on Terminal-Bench 2 over ten automated rounds, but tuned and scored on the same 89 tasks.
- Wang et al. **[read]**: reran that approach with separate tuning and test tasks. The gain was **+0.6 points**, and it lost to simple multiple attempts at equal budget.

**How it fits our findings.** It matches our three failed prompt rounds. Our benchmark also cannot detect gains under 10 points per round, so an optimiser would be fitting noise.

**Verdict.** Not now. If tried later: tune tools and structure rather than prompt text, keep a separate test set, and compare against multiple attempts at equal cost.

### G. Consulting a stronger model

**Evidence.** Anthropic's advisor tool lets a cheaper model consult a stronger one mid-task. Reported: Sonnet 4.6 with an Opus 4.6 advisor scored 74.8% against 72.1% alone on SWE-bench Multilingual **[search; vendor figures via secondary sources; independent tests are mixed]**. Aider's architect/editor split is the same idea **[search]**.

**Verdict.** A reasonable optional feature. It is not a fair way to win a same-model comparison.

### H. Caching and context (cost only)

**Evidence.** Manus's engineering notes call cache hit rate the most important production metric and recommend a stable prompt prefix **[search]**. The harness-design study found context management matters mainly when the context window is small **[read]**.

**How it fits our findings.** Galley's cached share on Sonnet was 61% against OpenCode's 67%. Galley's system prompt includes the workspace path, so the cached prefix cannot be shared between folders.

**Verdict.** Move the workspace path after the cached part of the prompt. A small, free saving; no effect on pass rate.

## 3. Where a win can actually be shown

| Arena | Headroom | Assessment |
|---|---|---|
| Polyglot (Python, Go, Rust) on Sonnet 5.5 | OpenCode 90%, ceiling about 94% | A 5-point win is impossible. Useful only for cost comparisons. |
| Polyglot on DeepSeek | 19% never solved, 25% luck | Room for +5 to +10. Needs about 500 task-runs per agent to prove +5. |
| Polyglot, unused languages (JavaScript, Java, C++; about 120 tasks) | Unknown | The natural fresh test set: nobody has tuned on it. Needs toolchain setup. |
| Terminal-Bench 2 (89 long terminal tasks) | Large gaps between harnesses on the same model | Most promising, least certain. See below. |

**Terminal-Bench.** Published results show large differences between harnesses using the same model:
- With Opus 4.6: Claude Code about 58%, Terminus 2 about 63%, Terminus-KIRA about 75% **[search]**.
- The *Agentic Harness Engineering* paper's own comparison table lists **OpenCode at 47.2%**, against 69.7% for a shell-only agent and 71.9% for Codex **[read; the text I could read does not say which model each baseline row used]**.
- Wang et al. note that on Terminal-Bench "a minimal setup consisting of a shell tool and a basic prompt already suffices for most solvable tasks" **[read]**.

Taken together: minimal harnesses do well there and heavier ones can do worse. Galley is minimal. That makes Terminal-Bench the most likely place for a clear win, but it is untested. It needs a container per task. My rough estimate is $100 or more per agent per run on Sonnet; DeepSeek would be much cheaper.

**Measurement rules to keep**, following Miller, *Adding Error Bars to Evals* (Anthropic, 2024) **[search]**: compare the same tasks pairwise, report an interval, fix the success rule in advance, and size the experiment from the table in section 1.

## 4. Review of the plan, and the revised plan

*Reviewed 12 November 2026 against the benchmark data already collected. No model calls were made for the review.*

### The plan as first proposed

| Step | What | Cost |
|---|---|---|
| 1 | DeepSeek reasoning hand-off, dev tasks, 3 runs | About $1 |
| 2 | Sonnet effort sweep (`medium`, `xhigh`), dev tasks, 2 runs each | About $7 |
| 3 | Build attempt-and-select, test 3 attempts on DeepSeek dev | Build time, about $4 |
| 4 | Clean OpenCode baselines | About $12.50 |
| 5 | Confirmation on fresh tasks (JavaScript, Java, C++) | $10 to $65 |
| 6 | Optional Terminal-Bench pilot | Unknown |

### What the review found

**1. The benchmark leaked hidden tests, and OpenCode used the leak on DeepSeek.** This is the most important finding, and it is a fault in my harness.
- Every agent's sandbox could read the run's whole output folder. Other tasks' workspaces sit there with the hidden tests copied in after grading, and the same exercise exists in several languages. An agent on the Go or Rust task could read the Python task's tests.
- Agents ran as root inside the sandbox. In two runs OpenCode undid the hiding of `/tmp` and read the benchmark's own files, once including the reference solution.
- The rest of the machine was readable: agents read my session log and this repository's notes.

| | Task-runs that read hidden tests or a graded solution for their own exercise |
|---|---|
| OpenCode on DeepSeek (4 runs, 404 task-runs) | **22** (1, 8, 6, 7 per run) |
| Galley on DeepSeek (every run in every round) | **0** |
| Either agent on Sonnet | **0** |

Galley's own sandbox hides `/tmp` from the commands it runs, so those folders were out of its reach, and its model never tried to undo that. On the 13 tasks involved, OpenCode passed 82% of the time when it had read the tests (18 of 22) and 53% in its other runs (16 of 30); Galley passed 51% on them.

| DeepSeek, all 101 tasks | Galley | OpenCode | Difference | 95% interval | Sign test |
|---|---|---|---|---|---|
| As published | 68.8% | 67.8% | +1.0 | −4.2 to +6.2 | p = 0.63 |
| Affected task-runs removed | 68.8% | 65.5% | **+3.3** | −2.0 to +8.6 | p = 0.31 |

It is still a tie statistically. Removing runs afterwards is an approximation, and agents go looking for tests when they are stuck, so the removed runs were probably harder than average. The audit tool is [`bench/audit_leaks.py`](../bench/audit_leaks.py); the flagged runs are in [`bench/data/leak-audit.json`](../bench/data/leak-audit.json).

**2. The DeepSeek API key was exposed to the agents.** It was in their environment, and in 9 OpenCode task-runs the agent printed it into local scratch logs. Nothing reached this repository or its history. I have redacted the scratch copies. The key should be rotated, and the harness should stop handing real keys to agents.

**3. Galley's own sandbox could be escaped when Galley ran as root.** A sandboxed command could run `mount -o remount,rw /` and then write anywhere, or unmount the private `/tmp`. I confirmed it with a harmless test file. It is now fixed: as root, sandboxed commands keep only the capabilities that ordinary file handling needs. Five new tests cover it. Non-root users were not affected.

**4. Our own data contradicts the expected gain from attempt-and-select (old step 3).** That step assumed that running self-written tests can tell good attempts from bad. The verifier runs already measured this, on dev tasks:

| | Full verifier (round 5) | Lean verifier (rounds 6 and 7) |
|---|---|---|
| Dev task-runs | 94 | 188 |
| Solutions that failed the hidden tests | 23 | 61 |
| Of those, the verifier's own tests had passed | **21 (91%)** | **50 (82%)** |
| Hidden pass rate when the verifier said PASS | 76% | 70% |
| Hidden pass rate overall | 76% | 68% |

A PASS from self-written tests carried almost no information. The reason shows in how the failing solutions failed (54 failed dev task-runs, default configuration): in 46% every hidden test failed or the tests did not compile against the solution, which is a mismatch of names, types or conventions that no self-written test can see. In the other 54% only some tests failed, typically 16% of them. My revised estimate for three attempts with selection is +1 to +2 points on this benchmark, not +4 to +6, at three times the cost.

**5. The win rule was harder to meet than the plan said, and the plan broke it anyway.**
- The rule fixed in advance is: a lead of 5 points or more, p < 0.05, **while staying cheaper**. Three attempts cost about $2.00 per run on DeepSeek against OpenCode's $0.75. The plan's main step could not have met the rule as written.
- "About 500 task-runs per agent" was too optimistic. Simulating from our per-task data:

| True gain | 101 tasks × 2 runs | 122 tasks × 4 runs | 122 tasks × 8 runs |
|---|---|---|---|
| +3 points | 12% | 12% | 8% |
| +5 points | 30% | 46% | 51% |
| +8 points | 63% | 90% | 97% |
| Selection that captures 20% of the ceiling (+2.4) | 10% | 7% | 2% |

*Chance of meeting the full rule. More runs do not help when the true gain sits at the 5-point line: the observed lead then falls short half the time.* A win under this rule needs a true lead of about 8 points.

**6. The Sonnet effort sweep (old step 2) could not answer its own question.** On the dev half both agents already score 92.6%, and Galley has failed only 4 of the 47 dev tasks even once. Nothing run on that half can show a gain from `xhigh`. The whole Sonnet gap is in the other half (Galley 82.4%, OpenCode 88.0%). The test is still useful for cost, which it measures precisely.

**7. The reasoning hand-off test (old step 1) was measuring the wrong thing.** On DeepSeek, output tokens are 82% of Galley's cost and about 60% of them are reasoning; Galley spent 0.57M reasoning tokens per run against OpenCode's 0.44M. Dropping the model's earlier reasoning may be making it think again from scratch at each step. Reasoning tokens and cost per task are measured on about a thousand requests per run, so they can show an effect that pass rate on 47 tasks cannot.

**8. Smaller points.**
- Old runs are not a fair baseline for new ones. `deepseek-flash` is an alias that can change, and the harness is changing. Every test needs its comparison arm run at the same time.
- Round 7 tested the lean verifier, not the round 5 one. The log said otherwise and is corrected. The round 5 verifier has only had two dev runs.
- "Galley already matches OpenCode at about half the cost" on Claude overstated it. The interval is −6.9 to 0.0 points; a 3-point deficit is as consistent with the data as a tie.
- The original holdout is spent for both models. Three holdout transcripts were read for the Sonnet analysis, and the audit read tool calls from all runs. All 101 tasks are now development data; only fresh tasks can confirm anything.
- Fresh tasks are feasible: 122 JavaScript, Java and C++ exercises are in the checkout and the compilers are installed. Whether their test dependencies work without internet is not checked yet.
- Terminal-Bench needs Docker. The client is installed here but no daemon is running; whether one can run in this environment is untested.
- If Galley's default effort changes, OpenCode must be run at its own default too, not forced to `high`.

### Revised plan

| Step | What | Cost | Decision rule |
|---|---|---|---|
| 0a | **Done:** Galley sandbox fix; corrected results; leak audit tool | Free | – |
| 0b | **Fix the benchmark sandbox:** mount only a socket folder, drop root capabilities, build the filesystem from a short list of folders, keep real keys in the proxy, clear the run folder before each attempt. Check it with the reference solutions and a fake model, and run the leak audit after every run. | Free | Reference solutions pass on all 101 tasks; audit finds nothing in a smoke run |
| 0c | **You:** rotate the DeepSeek key, and choose the win rule (below) | – | – |
| 1 | **Clean DeepSeek comparison, three arms at once:** OpenCode, Galley, Galley with reasoning hand-off. All 101 tasks, 3 runs each. | About $7 | Adopt the hand-off if cost per task does not rise and pass rate is not more than 2 points lower. Report the Galley–OpenCode difference with its interval. |
| 2 | **Claude effort for cost:** Galley at `medium`, all 101 tasks, 2 runs, plus 1 run at `high` as a same-day control | About $7 | Make `medium` the Claude default if cost falls and the pass rate is within 3 points of `high` |
| 3 | **Offline test of selection, before building anything:** write only the selector and run it on attempts already saved from earlier runs, where each attempt's hidden result is known | Under $1 | Build attempt-and-select only if the selector picks a passing attempt clearly more often than chance on tasks where attempts disagree. The verifier data predicts it will not. |
| 4 | **Confirmation on fresh tasks** (JavaScript, Java, C++), with Galley's configuration frozen first, both agents, 4 runs each | About $7 on DeepSeek | Whichever rule was chosen in step 0c |
| 5 | Optional: a benchmark of long tasks, if Docker can be made to run here | Unknown | Decide after steps 1 to 4 |

The saved attempts that step 3 needs are in this session's temporary storage. If that is lost, regenerating them costs about $1.50.

### The win rule needs a decision before step 1

| Option | Claim | Chance with what we know |
|---|---|---|
| A. Keep the rule: lead of 5 points or more, p < 0.05, cheaper | "Galley beats OpenCode" | Low on DeepSeek: it needs a true lead near 8 points and the corrected estimate is 3. None on these Sonnet tasks. |
| B. Add a second, weaker claim: not worse by more than 3 points (lower end of the 95% interval above −3) and cheaper per solved task | "Galley is as good and cheaper" | Plausible on DeepSeek if the corrected estimate holds up in clean runs. Not met on Sonnet today (lower end −6.9). |
| C. Pass rate at any cost, through several attempts | "Galley scores higher if you pay more" | Unlikely on this benchmark, given finding 4 |

My recommendation is to keep A as the bar for "beats" and add B as a separate claim, both fixed before step 1 and both judged on fresh tasks in step 4. B must not be read back onto the data that suggested it.

### What "beating OpenCode" realistically looks like now

- **DeepSeek:** possibly a small real lead already, once OpenCode can no longer read the tests. Clean runs will show whether it is nearer 0 or 5 points. A lead that meets rule A is unlikely.
- **Claude:** parity is not yet shown. The cost advantage is solid, and `medium` effort should widen it.
- **Long, multi-step benchmarks:** still the place where a harness can make a large difference, and still untested.

### What not to spend on

- Any further run before the benchmark sandbox is fixed.
- Building attempt-and-select before the offline test in step 3.
- An `xhigh` test on tasks the model already solves.
- More prompt wording changes without the run budget to measure them.
- Majority voting, self-review loops, or automated prompt evolution on this benchmark.

## Sources

**Read (fully or in large part)**
- Wang et al., *Rethinking the Evaluation of Harness Evolution for Agents*, arXiv 2607.12227: https://arxiv.org/abs/2607.12227
- *An Empirical Study of Harness Design for Coding Agents*, arXiv 2609.20804: https://arxiv.org/abs/2609.20804
- *Agentic Harness Engineering*, arXiv 2604.25850: https://arxiv.org/abs/2604.25850 (ablation and transfer numbers came from a summarised part of the page)
- *Trae Agent*, arXiv 2507.23370: https://arxiv.org/abs/2507.23370 (ablation tables from a summarised part)
- *S\*: Test Time Scaling for Code Generation*, arXiv 2502.14382: https://arxiv.org/abs/2502.14382 (Table 1 verbatim)
- *Harness Engineering: A Source-Code Study of Eleven Systems*, arXiv 2609.00006: https://arxiv.org/abs/2609.00006 (its list of 18 recommendations could not be retrieved)
- Anthropic, *Prompting Claude Sonnet 5.5*: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
- DeepSeek, *Thinking Mode* guide: https://api-docs.deepseek.com/guides/thinking_mode/
- Tensorlake write-up of ForgeCode: https://www.tensorlake.ai/blog/forgecode-terminal-bench (ForgeCode's own two posts returned "not found")
- Anthropic developer documentation bundled with this environment (model migration, agent design, prompt caching)

**Search summaries only (numbers unverified)**
- CodeT, arXiv 2207.10397 · CodeMonkeys, arXiv 2501.14723 · B4, arXiv 2409.08692
- Stechly et al., *On the Self-Verification Limitations of LLMs*, arXiv 2402.08115
- ClarifyGPT, arXiv 2310.10996 · TiCoder (IEEE TSE 2024) · Vijayvargiya et al., arXiv 2502.13069
- GEPA, arXiv 2507.19457 · Darwin Gödel Machine, arXiv 2505.22954 · SWE-agent, arXiv 2405.15793 · AlphaCodium, arXiv 2401.08500
- *The Devil Is in the Interface*, arXiv 2608.11386
- Miller, *Adding Error Bars to Evals*, arXiv 2411.00640
- Anthropic advisor tool coverage: https://www.builder.io/blog/the-claude-advisor-pattern · Aider architect mode: https://aider.chat/2024/09/26/architect.html
- Manus, *Context Engineering for AI Agents*: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- Terminal-Bench same-model comparisons: https://dev.to/gabrielanhaia/stop-comparing-models-same-claude-58-or-76-on-terminal-bench-depending-on-the-harness-16d1 · https://codex.danielvaughan.com/2026/04/09/harness-performance-terminal-bench/
- Cursor best-of-n: https://forum.cursor.com/t/cursor-3-worktrees-best-of-n/156507
- OpenCode issue on DeepSeek reasoning: https://github.com/anomalyco/opencode/issues/24130
