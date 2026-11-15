# Using more than one model in a coding harness: who does what, what it buys, and what Galley should do

*Researched on 14 November 2026. This document compares how coding harnesses use several models in one session, what the published results say that buys, what current data says each model is good at, and where Galley falls short. It extends [coding-harnesses.md](coding-harnesses.md), which compares the harnesses on everything else.*

*For the academic research on these methods (reviewers, observers, committees, debate, several attempts), see [multi-model-methods.md](multi-model-methods.md).*

**How to read the evidence labels.** *Official board* means numbers read from a benchmark's own leaderboard. *Vendor* means a company's figures about its own product. *Our analysis* means numbers I computed from public per-task results; the scripts are in [`tools/`](tools/). *Secondary* means a third party's account that I could not check against the original.

## Bottom line

- **Every serious harness lets you use different models for different jobs. Few switch on their own, and almost none publish evidence that switching raises the pass rate.**
- **Where a gain over the best single model was measured, it is small:** +2.7 points for Anthropic's advisor, about +1.6 for alternating two equally strong models in SWE-bench's bash-only agent. Several pairs scored *below* their stronger member.
- **The large, repeatable effect is on cost.** Routing easy work to cheap models is reported to cut cost by 30 to 63% at about the same quality (Cursor, Factory; vendor figures). Public per-task data supports that direction.
- **Three things decide whether a switch helps:** a real gap in ability between the models, a cheap and reliable signal for *when* to switch, and the price of the switch itself, because the new model re-reads the whole conversation at the uncached price.
- **"Each model is good at different things" is mostly run-to-run chance** in the data that exists. A second try by the *same* model fixes 14 to 29% of failed tasks; a different model of equal strength fixes 22 to 25%; only a stronger model does better (29 to 53%, rising with the gap).
- **On the DeepSeek account this project uses, there is no stronger model to switch to.** In the same harness on the same benchmark, `deepseek-flash` scores 38.5% and `deepseek-v4-pro` 6.7%, and the second costs 3.3 to 7.3 times as much per token.
- **Galley had only a manual `/model` command and one cheaper model for helpers.** It now has model profiles, a guarded switch, a second-opinion model, switching on signals, a fallback and per-mode models ([section 5](#5-where-galley-stood-and-what-changed)). None of it is measured yet.
- **For the goal of beating OpenCode by our rule, model switching is not a route on this benchmark** ([section 6](#6-what-this-means-for-beating-opencode)). It can be shown to pay on longer tasks and against a strong model used alone; that needs a second provider and a larger budget.

## 1. What each harness does with more than one model

There are six distinct things a harness can do. The table says which harness does which.

| Harness | Switch by hand in a session | A model per role | Switches on its own | Second-opinion model | Fallback when a model fails |
|---|---|---|---|---|---|
| **Claude Code** | `/model`, `/effort`; asks first while the cache is warm | Sub-agents by definition or `CLAUDE_CODE_SUBAGENT_MODEL`; Haiku for background work | `opusplan`: Opus while planning, Sonnet while building | **Advisor tool** (`/advisor opus`): the model decides when to ask | `--fallback-model`, for the current turn only |
| **Codex CLI** | `/model [model] --reasoning=<level>` | Sub-agents and custom agents with their own model and effort | No | No | No |
| **OpenCode** | Model picker; Tab between Build and Plan | `model` per agent; hidden agents for titles, summaries and compaction; sub-agents inherit unless set | No | No | No |
| **Aider** | `/model`, `/editor-model`, `/weak-model` | **Architect and editor**; a weak model for commit messages and summaries | No | The architect is in effect a planner for the editor | No |
| **Cline, Roo Code, Kilo Code** | Model picker | **A model per mode** (Plan and Act; Architect, Code, Debug); the model changes with the mode | Only with the mode | No | No |
| **Goose** | `/model` | Sub-agents | **Removed.** Lead and worker (lead for the first 3 turns, lead again after 2 failures) and the planning mode that replaced it are both gone | No | No |
| **Amp** | Model selector | Sub-agents follow the thread's model; supporting models for titles, images, compaction | No | **Oracle**, now an optional plug-in with its own model; invoked by asking | No |
| **Gemini CLI, Antigravity** | `/model` | Flash-Lite for internal calls | **Auto**: a classifier sends simple prompts to Flash and complex ones to Pro | No | Yes, asks before switching |
| **Cursor** | Model picker | Sub-agents | **Cursor Router**: classifies every request; three settings (Intelligence, Balance, Cost) | No | Not stated |
| **GitHub Copilot** | Model picker | No | **Auto**: picks per prompt; three tiers (efficiency, balance, intelligence) | No | Part of Auto |
| **Factory Droid** | `/model` | A model and effort for specification mode; three tiers of sub-agent model | **Factory Router**: picks per task | No | `modelFallbacks` |
| **OpenHands** | Settings | A router class you can extend; built in: text to a cheaper model, images to the main one | Only by input type | No | No |
| **Pi** | `/model`, model cycling; hand-over between providers is a design goal | No | No (a community add-on switches from a dear model to a cheap one with a hand-over note) | No | No |
| **mini-SWE-agent** | n/a | No | **Roulette**: a random model at every step (an experiment, not a product feature) | No | No |
| **Galley, before** | `/model` (unchecked) | One smaller model for helpers and compaction | No | No | No |
| **Galley, now** | `/model`, `/effort`, checked, with the price of the switch | Helpers, plan mode, advisor | **On signals**: a repeated failing check, a loop, a run of tool errors, a long run | **Advisor**, any provider | `fallbackModels` |

Sources: each product's documentation, read on 14 November 2026 and linked at the end. Codex, Pi and Kilo entries rest partly on secondary sources.

What stands out:

- **Role split is universal; automatic switching is rare.** The common pattern is a strong model to plan and a cheaper one to carry out, chosen by the user in advance.
- **The automatic routers are built to save money.** Cursor, Copilot, Factory and Gemini CLI all describe their routers as matching each request to the cheapest model that will do. None claims a higher pass rate than the best model alone.
- **Routers avoid switching inside a conversation.** Cursor keeps one setting for a whole session and names the reason: a switch "invalidates cached context and adds latency". Claude Code asks for confirmation before a switch while the cache is warm, for the same reason.
- **Two harnesses walked a built-in second model back.** Goose removed its lead-and-worker mode, which switched by itself, and then the planning mode that replaced it. Amp's oracle started as a fixed stronger model (OpenAI's o3 beside Claude Sonnet 4) and is now an optional plug-in; by default its sub-agents run on the thread's own model.
- **The one design in which the model itself decides when to consult** is Anthropic's advisor, in Claude Code and the API. It leaves the main model's cache intact, because the advisor reads the conversation and only its short answer comes back.

## 2. What it buys: the measured results

### Results that compare a multi-model setup with its best single model

| Setup | Result against the best single model | Cost | Evidence |
|---|---|---|---|
| **Anthropic advisor**: Sonnet 4.6 with Opus 4.6 as advisor, SWE-bench Multilingual | **+2.7 points** | 11.9% lower per task | Vendor, April 2026. The two arms also differed in thinking setting and system prompt |
| **Anthropic advisor**: Haiku 4.5 with Opus 4.6, BrowseComp | 41.2% against 19.7% alone; still 29% below Sonnet alone | 85% below Sonnet alone | Vendor |
| **Anthropic's later guidance on the advisor** | "The flagship pairing landed about on the executor model's own effort curve": it bought roughly what a higher effort setting did | | Vendor, cost guide, November 2026 |
| **Roulette**: GPT-5 and Claude Sonnet 4 alternating at every step, SWE-bench Verified, bash-only agent | **66.6%** against 65.0% and 64.9% alone | Between the two | Official board and its blog, August 2025 |
| Roulette with unequal pairs, 50 tasks | GPT-5 with GPT-5 mini: 31, **below both** (32 and 32). GPT-5 with Gemini 2.5 Pro: 31, below GPT-5. Three models: 33, equal to the best one | Between | Same blog: "the only case where we got a higher score than with either model separately" was the equal pair |
| **Aider architect and editor**, September 2024: o1-preview plans, another model edits | 85.0% against 79.7% alone | Slower, dearer | Aider. The planner could not write edits in the required format; the editor fixed that |
| Aider, January 2025: DeepSeek R1 plans, Sonnet edits (Polyglot) | 64.0% against 56.9% and 51.6% alone | $13.29 against $5.42 and $14.41 | Aider |
| Aider, same post | o1 with Sonnet "didn't produce better results than just using o1 alone" | | Aider |
| Aider leaderboard: o3 (high) plans, GPT-4.1 edits | 78.2% against **81.3%** for o3 (high) alone | $17.55 against $21.23 | Aider |
| **Several models each write a fix, then a selector picks one** (Trae Agent, SWE-bench Verified, June 2025) | 75.2%, when its single models scored 59 to 66% | Several times a single run | Official board; per-model figures secondary |
| The best entries on that board that list "multiple" models, 2025 | 75 to 77% | | Official board |
| The same board, February 2026 | One newer model in a 100-line bash-only agent: **76.8%** | $0.75 a task | Official board |

### Results about cost at about the same quality

| Setup | Claim | Evidence |
|---|---|---|
| **Cursor Router** | "Frontier-quality performance at 60% savings"; the Balance setting above Opus 4.8 on user satisfaction at 36% lower cost; $4.63 a commit against $7.34 | Vendor, tests on live traffic, July 2026 |
| **Factory Router** | 63% lower cost than pricing the same work at frontier rates, "while holding frontier-level performance in Factory evaluations" | Vendor; no named evaluation |
| **SWE-Router** (research): a cheap model runs 1 to 4 turns, a small trained model predicts whether it will succeed, and a strong model starts over if not | Clearly better than routing on the task text alone. The strong model **restarts from the task**, because "conditioning [it] on [the cheap model's] reasoning has been seen to bias [it] toward [the cheap model's] mistakes" | Preprint, workshop paper, July 2026 |
| **Scrouting** (research): a small model scouts the repository, then a router picks one model for the whole task | 159 of 266 tasks at $0.23 a solve, against 158 at $1.27 for the strongest model alone. The cheapest model alone solved 149 at $0.19. The authors: the hand-over "appears to redistribute rather than add solving ability" | Preprint, August 2026 |
| **A cloud vendor's escalation test**: DeepSeek V4 Flash with Claude Fable 5 as the escalation target, Terminal-Bench 2.1 | Flash alone 69 to 70% at $0.04 to $0.07 a run; Fable alone 81 to 84% at $1.15 to $1.97. Flash is enough for about two thirds of the tasks; live escalation rescued 3 of 9 tasks Flash always failed | Vendor blog, September 2026; small sample |
| **Model swapped mid-run** (research) | A swap rewrote 61 to 94% of the later actions, against a same-model control. Conclusion: switching must be tested in live runs, not by replaying recorded ones | Preprint, August 2026; small models |

### What public per-task results show (our analysis)

The SWE-bench site publishes, for every model run in its bash-only agent, which tasks were solved and what each cost. All runs use the same agent, so differences are the model's. The runs are from February 2026 and the models are a generation old; the structure is what matters.

**Verified, 500 tasks, 11 models:**

| Question | Answer |
|---|---|
| Best single model | 384 solved (76.8%), Claude Opus 4.5, $0.75 a task. A model ten times cheaper solved 379 (MiniMax M2.5, $0.07) |
| Solved by at least one of the 11 | 441 (88.2%): **11 points above the best model** |
| Two different models together, against the better of the two | +11 to +32 tasks (2 to 6 points) |
| **The same model run twice**, against its better run | **+19 to +33 tasks** (four models that have two runs on the board) |

- **Two runs of one model differ as much as two different models do.** The "complementary strengths" that a pair of models seems to show in single runs is no larger than the variation between two runs of one model.
- **So the value is in the second try, and in knowing that the first one failed.** Which model makes the second try matters less.
- **A caution:** most of the repeated runs used an earlier version of the same agent, so they overstate pure chance somewhat. Terminal-Bench, which repeats every run five times, shows the same thing (section 3).

**How many of a model's failures a second run fixes:**

| Second run by | Share of the first run's failed tasks fixed |
|---|---|
| The same model again | 14 to 29%, typically about a fifth |
| A different model of the same strength (MiniMax M2.5 and Claude Opus 4.5, either way round) | 22 to 25% |
| A model 6 to 10 points stronger (Kimi K2.5, DeepSeek V3.2 or Haiku 4.5, then Opus 4.5) | 29 to 37% |
| A model 17 to 21 points stronger (GPT-5 mini, then GPT-5.2 or Opus 4.5) | 47 to 53% |

**A cheap model first, then a strong one on the failures.** This assumes a perfect signal that the first try failed, which on this benchmark only the hidden tests give.

| | Solved | Cost per task |
|---|---|---|
| MiniMax M2.5 alone | 75.8% | $0.07 |
| Claude Opus 4.5 alone | 76.8% | $0.75 |
| MiniMax first, Opus on its failures | **81.8%** | $0.33 |

- **With a perfect failure signal, a cheap-then-strong cascade beats the strong model at under half its cost.** That is the best case for model switching in public data.
- **Against the cheap model alone, the same cascade costs 4.5 times as much for 6 points.** Whether that is worth it depends on what a solved task is worth.
- **Without a failure signal there is no cascade.** Everything turns on the signal.

## 3. What each model is good at

### Hard terminal tasks: the official board, November 2026

Terminal-Bench 4.1, read from the official board on 14 November 2026. Each row is 330 runs; the interval is the board's 95% interval. Almost every row is a vendor's own harness with its own models, or third-party models inside Claude Code.

| Model | Harness, effort | Solved | Cost per run | Solved at least once in five runs |
|---|---|---|---|---|
| Claude Opus 5.5 | Claude Code, max | 65.8% ± 3.1 | $14.30 | 80.3% |
| Claude Fable 5.2 | Claude Code, max | 65.8% ± 2.8 | $49.98 | 78.8% |
| Gemini 4 Carbon | Antigravity CLI, high | 64.5% ± 3.2 | $4.12 | 78.8% |
| Claude Sonnet 5.5 | Claude Code, max | 63.9% ± 3.0 | $22.22 | 80.3% |
| GPT-6.1 Sol | Codex, max | 60.9% ± 3.0 | $1.92 | 74.2% |
| GPT-6 Astra | Codex, max | 60.3% ± 2.8 | $9.90 | 72.7% |
| Kimi K3.1 Pro | Claude Code, max | 59.7% ± 4.2 | $3.29 | 84.9% |
| GLM-5.3 | Claude Code, max | 41.2% ± 3.3 | $8.27 | 57.6% |
| Claude Haiku 5.5 | Claude Code, max | 40.0% ± 3.6 | $2.89 | 60.6% |
| **DeepSeek V4.1 Flash** (`deepseek-flash`) | Claude Code, max | **38.5% ± 3.8** | **$0.56** | 65.1% |
| GLM-5.3-Flash | Claude Code, max | 37.0% ± 3.6 | $1.14 | 62.1% |
| **DeepSeek V4 Pro** (`deepseek-v4-pro`) | Claude Code, max | **6.7% ± 2.5** | $2.20 | 22.7% |

What the board shows:

- **The model decides far more than the harness.** Inside one harness the range is 6.7% to 65.8%. On an independent board that ran ten harnesses on DeepSeek V4.1 Flash, the best six are within 2.3 points of each other ([galley-against-the-field.md](galley-against-the-field.md)); our own Galley-against-OpenCode differences are 1 to 8 points.
- **Price per token does not predict cost per task.** Sonnet 5.5 costs half of Opus 5.5 per token and cost 55% *more* per run here, because it wrote twice as much. GPT-6.1 Sol reached 60.9% at $1.92 a run.
- **`deepseek-flash` is the cheapest capable model on the board:** level with Claude Haiku 5.5 at a fifth of the cost per run, and 26 times cheaper per run than Opus 5.5, which solves 27 points more.
- **`deepseek-v4-pro` is the weaker model, not the stronger one.** It is an older generation (August 2026). DeepSeek's own release notes agree: on every agentic benchmark both models report, V4.1 Flash is ahead (for example 90.6 against 87.9 on Terminal-Bench 2.1).
- **Repeating a run is worth 12 to 27 points** if something can tell which run succeeded. That is as much as a step between model tiers.

**Reasoning effort is a second dial on the same model**, and the board measures it:

| Model, harness | low | medium | high | xhigh | max |
|---|---|---|---|---|---|
| GPT-6 Astra, Codex | 50.9% ($4.72) | 55.2% ($5.80) | 60.0% ($6.88) | 59.7% ($7.12) | 60.3% ($9.90) |
| Claude Fable 5.1, Claude Code | 43.3% ($7.15) | 53.9% ($8.58) | 54.9% ($12.08) | 57.6% ($14.76) | 57.3% ($18.92) |
| Claude Opus 5, Claude Code | 34.9% ($7.25) | 45.2% ($9.67) | 49.7% ($14.13) | 53.3% ($18.44) | 52.1% ($18.09) |

- **From low to high effort is worth 9 to 15 points on hard tasks, for 46 to 95% more money.** That is as much as stepping up a model tier.
- **Above high there is little:** between −0.3 and +3.6 points, about the size of the board's intervals, for up to 57% more money.
- **On easy tasks effort matters less.** Our own measurement on Exercism tasks: `low` on `deepseek-flash` cost 44% less and scored about 3 points lower.

### By programming language

SWE-bench Multilingual, the ten strongest models of February 2026 in the bash-only agent (our analysis; 40 to 44 tasks per language):

| Language | Best | Worst of the ten |
|---|---|---|
| JavaScript and TypeScript | 82% (Claude Opus 4.6) | 60% (Kimi K2.5) |
| Java | 86% (GLM 5) | 63% (GPT-5.2) |
| C and C++ | 81% (Gemini 3 Flash) | 64% (Claude Opus 4.5) |
| Rust | 81% (Gemini 3 Flash, Claude Opus 4.6) | 67% (GLM 5) |
| PHP | 79% (GLM 5) | 63% (MiniMax M2.5) |
| Ruby | 68% (Gemini 3 Flash, Kimi K2.5) | 61% (Claude Sonnet 4.5, GPT-5.2 Codex) |
| Go | 62% (Gemini 3 Flash) | 48% (GPT-5.2 Codex) |

- **The winner changes from language to language, and most of that is noise.** With about 42 tasks, one figure is uncertain by about 14 points either way.
- **One large gap looks like an environment fault.** GPT-5.2 solved 0 of 9 tasks in one Java repository where the best models solved 8; that repository accounts for its whole Java deficit.
- **Nobody publishes a reliable table of "this model for debugging, that one for front-end work".** The routers that act on such knowledge (Cursor, Copilot, Factory) learned it from private traffic and do not publish it. Review sites repeat vendor figures.

### What a harness can honestly know about a model

1. **How strong it is on agentic coding**, from an official board, with a date.
2. **What it costs per task**, which is not what its price list suggests.
3. **How it responds to effort.**
4. **Anything finer, only by measuring on one's own tasks.**

Galley's model profiles hold the first three, with sources and dates, and the code refuses to treat an unprofiled claim as knowledge ([section 5](#5-where-galley-stood-and-what-changed)).

## 4. When to switch: the rules the evidence supports

1. **Do not switch inside a session without a reason.** The new model reads the whole conversation at its uncached price. For a 30,000-token conversation that is $0.0045 on `deepseek-flash` (50 times the cached price), $0.02 on `deepseek-v4-pro`, $0.06 on Claude Sonnet 5.5 and $0.12 on Claude Opus 5.5. The new model also inherits the old one's mistaken framing.
2. **Try more effort on the same model before another model.** From low to high it is worth as much as a model tier, and Anthropic's own guidance says to price this first. It is not free: each effort level has a cache of its own. On DeepSeek the first request after a change of effort was read uncached (measured for this note); Claude Code avoids that on the current Claude models with a newer API feature.
3. **Consult, do not hand over.** An advisor reads the conversation once and returns a short answer; the main model keeps its cache and its context.
4. **Switch on signals the harness can see, not on the model's feeling.** Anthropic's guidance on its advisor: asking the cheaper model to recognise the hard cases "demands the very judgment it's missing". Signals that exist: the same check failing repeatedly, the same call repeated, a run of tool errors, a run much longer than usual, a failing test suite.
5. **Switch only to a model that is known to be stronger at the job.** To a model of equal strength, a plain second try does about as much. To a weaker one it does harm at extra cost.
6. **Split roles to save money:** the cheapest model for searches, summaries and titles; a strong model for the plan when the plan is the hard part.
7. **Keep a fallback for outages.** This is about availability, not quality.
8. **Measure in live runs and count cost per task.** Replaying recorded runs gives wrong answers for this question.

## 5. Where Galley stood and what changed

| Capability | The field | Galley before | Galley now |
|---|---|---|---|
| Switch model by hand | Everyone | `/model`, unchecked; a mistyped name ended the session at the next message | Checked; shows what is known about the model and the price of the switch; warns before a switch to a weaker model |
| Change effort in a session | Claude Code, Codex | No | `/effort`, `--effort` |
| A model per role | Everyone | One smaller model for helpers and compaction | Also `planModel` for plan mode |
| Second-opinion model | Claude Code (Anthropic models only), Amp | No | `advisor`: any provider. The model can ask; Galley asks for it on the signals below; optionally before finishing |
| A worker and a reviewer on small steps | Aider plans with one model and edits with another; no harness found that reviews each step with a second model | No | `--reviewer` and `--steps`: the worker plans, each step is a turn of its own, and the reviewer checks that step's diff before the next one starts (added 15 November) |
| Automatic switch | Routers at Cursor, Copilot, Factory, Gemini CLI | No | `escalateModel`: after the signals fire again, the stronger model takes over for the rest of the turn |
| Signals for "when" | Not published by anyone | None | The same command failing three times, the same call repeated three times, four tool errors in a row, two thirds of the step limit used |
| Knowledge of the models | Private at the routers | A price table | Profiles with strength, cost per task, effort levels, source and date; `galley models` prints them and suggests roles for the keys you have |
| Refuses a pointless switch | Not stated anywhere | n/a | Yes: no escalation to a model profiled as weaker |
| Fallback on outage | Claude Code, Gemini CLI, Factory | No | `fallbackModels`, for the current turn |
| Cost per model | Claude Code, Codex | Session total | `/cost` lists each model |

How to use it is in [`galley/README.md`](../galley/README.md#using-more-than-one-model).

**What is deliberately not built:**

- **A router that classifies each request.** It needs training data from real traffic, which this project does not have. The published routers are cost tools.
- **Random or step-by-step alternation.** It helped only for two equally strong models, and by 1.6 points.
- **Several attempts with a selector.** This remains the best-supported way to raise the pass rate ([beating-opencode.md](beating-opencode.md), method A). It is a separate feature from switching, and it multiplies cost.

**Status: built and tested; not measured on a benchmark.**

- **Tests:** 45 new tests with scripted providers cover the profiles, the signals, the advisor, the takeover, the refusal to hand over to a weaker model, the fallback, the plan model, and work in reviewed steps.
- **Two smoke runs with real models** inside the benchmark sandbox, five Lua task-runs, about $0.06 in all. The advisor's review ran and was billed in all five. In one the model asked the advisor of its own accord. One consult of `deepseek-v4-pro` cost $0.0094, seven times the rest of that task ($0.0013). One dropped connection showed that the advisor request had no retry; it now has.
- **What the smoke runs do not show:** any effect on the pass rate. Five task-runs say nothing about that.
- **What to expect from a second look by the *same* model** on Exercism tasks is known from earlier measurements: self-review doubled cost for no gain, and an independent verifier tripled cost for a gain that did not hold at scale ([`bench/IMPROVEMENT_LOG.md`](../bench/IMPROVEMENT_LOG.md)). In the smoke runs the same-model review passed a solution that then failed the hidden tests.

## 6. What this means for beating OpenCode

**On the DeepSeek account alone, switching cannot produce the win.** The rule asks for 5 points more than OpenCode at lower cost. The account's only other model is weaker and dearer, so there is nothing to switch up to.

**With a second provider, the pass rate can rise, but not at lower cost than OpenCode on the cheap model.** The numbers for an Exercism-sized task:

| | Cost |
|---|---|
| Whole task, Galley on `deepseek-flash` | $0.005 to $0.009 |
| Whole task, OpenCode on `deepseek-flash` | $0.0055 to $0.012 |
| One consult of Claude Sonnet 5.5 (8,000 tokens read, 1,500 written) | about $0.03 |
| One consult of Claude Opus 5.5 | about $0.06 |
| Whole task, Galley on Claude Sonnet 5.5 (measured earlier: 87 to 88% solved) | $0.028 |

- **One consult of a strong model costs three to twelve times the whole task on the cheap one.** Galley's cost lead over OpenCode is 11 to 22%, which pays for no consults.
- **On tasks this small, a consult costs as much as doing the whole task on the strong model.** Anthropic's guidance says the same: price the stronger model alone first.
- **There is no failure signal on a first attempt.** The agent's own tests pass; the hidden tests then disagree. The signals that make switching work fire on visible failure.

**Where switching can be shown to pay:**

1. **Against a strong model used alone, on cost.** Target: the pass rate of Claude Sonnet 5.5 alone at well under its cost, with `deepseek-flash` doing the work and the strong model consulted on signals.
2. **On longer tasks**, where a session runs to dozens of steps, the cheap model's cached context dominates the bill and a consult is a small share of it.
3. **On second attempts**, where the failing test output is the signal. Our pilot showed both agents reach the same level there on one model; whether a stronger model for the retry adds to that is unmeasured.

**What a fair measurement would need**, none of it run:

- Both agents get the same pool of models; each uses it as its design allows. OpenCode would run once on the cheap model and once on the strong one, Galley in its mixed configuration.
- The benchmark's cost script prices every request as the benchmark's model. It must price each request by the model that answered before any mixed round counts.
- The leak audit flags every answer from a second model as contamination, which is right for single-model rounds. It must learn which models a round allows.
- The proxy that adds the API key serves one provider. A round with models of two providers needs it to serve two.
- A written rule before the first run, as for every confirmation so far.
- Budget: three arms on 200 fresh tasks cost roughly $15 to $25 a round, most of it the strong-model arm, against $2 to $6 a round until now. It also needs the Anthropic key, which so far has only been used for single-model rounds.

## Sources

**Official boards and data**
- [Terminal-Bench 4.1 leaderboard](https://www.tbench.ai/), read 14 November 2026
- [SWE-bench leaderboards](https://www.swebench.com/), with per-task results of the bash-only agent, read 14 November 2026
- [Aider leaderboards](https://aider.chat/docs/leaderboards/)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) and [change log](https://api-docs.deepseek.com/updates)

**Harness documentation**
- Claude Code: [model configuration](https://code.claude.com/docs/en/model-config), [advisor](https://code.claude.com/docs/en/advisor), [prompt caching](https://code.claude.com/docs/en/prompt-caching)
- Anthropic: [The advisor strategy](https://claude.com/blog/the-advisor-strategy), [optimising for cost and intelligence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence.md)
- Codex: [models](https://learn.chatgpt.com/docs/models), [commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [sub-agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- OpenCode: [agents](https://opencode.ai/docs/agents/), [configuration](https://opencode.ai/docs/config/)
- Aider: [Separating code reasoning and editing](https://aider.chat/2024/09/26/architect.html), [R1 and Sonnet](https://aider.chat/2025/01/24/r1-sonnet.html)
- Cline: [Plan and Act](https://docs.cline.bot/core-workflows/plan-and-act); Roo Code: [using modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes)
- Goose: [multi-model in Goose](https://goose-docs.ai/blog/2025/06/16/multi-model-in-goose) (marked outdated), [multi-model configuration](https://goose-docs.ai/docs/guides/multi-model/)
- Amp: [models and sub-agents](https://ampcode.com/docs/models-and-subagents), [the oracle](https://ampcode.com/news/oracle)
- Gemini CLI: [model routing](https://geminicli.com/docs/cli/model-routing/)
- Cursor: [Router](https://cursor.com/changelog/router), [blog](https://cursor.com/blog/router)
- GitHub Copilot: [cost and quality in auto model selection](https://github.blog/changelog/2026-09-15-configure-cost-and-quality-in-copilot-auto-model-selection)
- Factory: [settings](https://docs.factory.com/cli/configuration/mixed-models.md), [Factory Router](https://docs.factory.com/web/factory-router)
- OpenHands: [LLM routing](https://docs.openhands.dev/sdk/guides/llm-routing)
- Pi: [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/), [pi-downshift](https://github.com/boadij/pi-downshift)
- mini-SWE-agent: [Roulette mode](https://www.swebench.com/post-250820-mini-roulette.html)

**Research and experiments**
- [SWE-Router: Routing in Multi-turn Agentic Software Engineering Tasks](https://arxiv.org/abs/2607.00053)
- [Scrouting: Cost-Aware Routing of Coding Agents by Scouting the Repository First](https://arxiv.org/abs/2608.04804)
- [The Replay Gap: Static Evaluation of Model Switching in LLM Agents Scores the Wrong World](https://arxiv.org/abs/2608.08239)
- [Trae Agent: An LLM-based Agent for Software Engineering with Test-time Scaling](https://arxiv.org/abs/2507.23370)
- [Dynamic Model Escalation for Coding Agents](https://www.gmicloud.ai/en/blog/dynamic-model-escalation-for-coding-agents-a-gmi-router-experiment-across-two-harnesses) (GMI Cloud)
- [A replay study of routing granularity](https://github.com/dshakes/firstpass/pull/259) (found no step-level cascade cheaper than the top model; its conclusions were revised several times, and replay is the method the paper above warns against)

**Not used as evidence:** a withdrawn preprint on recovery routing (arXiv 2607.19338), review sites that repeat vendor figures, and one article I could not open.
