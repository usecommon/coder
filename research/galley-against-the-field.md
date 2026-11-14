# Galley against other harnesses: measured performance, missing features, and what a substantial improvement would be

*Researched on 14 November 2026. Companion to [coding-harnesses.md](coding-harnesses.md) (what each harness is), [model-switching.md](model-switching.md) (using more than one model) and [beating-opencode.md](beating-opencode.md) (evidence for each way of raising a pass rate). Figures marked "our analysis" come from public data and the scripts in [`tools/`](tools/).*

## Bottom line

- **The best evidence on harness performance is a public board that ran ten harnesses on the model this project uses.** With DeepSeek V4.1 Flash, OpenCode solves 70.0% of 198 hard tasks and shares first place with DeepSeek's own harness.
- **Among competent harnesses the harness adds little on this model.** The best six lie within 2.3 points of each other, and one of them is a 100-line agent with a single tool. A bad harness costs 9 to 17 points.
- **Our win rule asks for more than any harness on that board has over OpenCode.** A 5-point lead over the leader would be larger than every gap between two competent harnesses measured there.
- **Galley has never been run on tasks of that kind.** On small Exercism tasks it is 1 to 8 points ahead of OpenCode 1.19.5 and, since its fixes, 11 to 22% cheaper.
- **Galley lacks many features the large harnesses have. Few of those features are known to raise a pass rate.** Section 2 sorts them.
- **Two things have large measured effects and Galley does neither by itself:** giving the agent test results it did not have (+24 to +49 points in our own runs) and several attempts with a selector (+12 to +27 points on the Terminal-Bench board). A third, the right reasoning effort for each model, it leaves to the user.
- **My recommendation:** measure Galley where harnesses can differ at all (hard tasks, with cost per solved task counted), and build the test-feedback loop and several attempts. Each is the user's decision; costs are in section 4.

## 1. Measured performance: how much the harness matters on one model

### The Harness Leaderboard

An independent board by Joël Niklaus (Hugging Face), version 0.1.6, data of 14 November 2026. Only the harness changes; model, provider and reasoning effort are held fixed.

- **Tasks:** 198: 87 from Terminal-Bench 2.1 (build, debug, configure) and 111 from DeepSWE v1.1 (features and fixes in real Go, Python, TypeScript and Rust repositories).
- **Runs:** three attempts per task, at low and at high effort: 1,188 scored runs for each harness on DeepSeek V4.1 Flash, and as many on GLM-5.3-Flash.
- **Honest about its own flaws:** a third benchmark is unscored because its task images held the hidden tests and "most earlier … trials accessed them". We found the same behaviour in our own harness.

**DeepSeek V4.1 Flash, both effort levels together** (our analysis):

| Harness | Solved | Terminal-Bench 2.1 | DeepSWE | Cost per run | Cost per solved task | Tokens per run |
|---|---|---|---|---|---|---|
| DeepSeek Harness 0.2.2 | 70.1% | 73.4% | 67.6% | $0.125 | $0.178 | 10.0M |
| **OpenCode 2.2.6** | **70.0%** | 75.3% | 65.9% | $0.107 | $0.153 | 8.8M |
| Claude Code 2.1.300 | 68.9% | 73.9% | 65.0% | $0.107 | $0.155 | 6.7M |
| Kimi Code 2.2.0 | 68.4% | 77.8% | 61.0% | $0.106 | $0.156 | 8.2M |
| Codex 0.162.1 | 68.1% | 75.1% | 62.6% | $0.094 | $0.138 | 7.5M |
| mini-swe-agent 2.4.6 (one tool: the shell) | 67.8% | 74.3% | 62.8% | $0.128 | $0.188 | 9.8M |
| Pi 1.2.0 | 65.0% | 73.0% | 58.7% | $0.096 | $0.147 | 5.6M |
| Qwen Code 0.25.2 | 65.0% | 72.6% | 59.0% | $0.106 | $0.164 | 6.9M |
| Hermes Agent 0.22.1 | 61.4% | 65.9% | 58.0% | $0.100 | $0.162 | 7.5M |
| OpenClaw 2026.11.1 | 53.5% | 56.5% | 51.1% | $0.199 | $0.372 | 10.1M |

What this shows:

- **OpenCode is the harness to beat on this model, and it is at the top.** It is OpenCode 2.2.6; our comparisons used 1.19.5.
- **The best six are within 2.3 points.** With 198 tasks behind each figure, gaps of that size are not distinguishable.
- **A minimal harness loses nothing.** mini-swe-agent has no file tools, no sub-agents, no code index and no plan mode.
- **Cost differs little among the good ones on this model:** $0.138 to $0.188 per solved task. Pi sends the fewest tokens.
- **Effort does nothing for this model on these tasks:** 65.6% of runs solved at low effort and 66.1% at high, for about a quarter more money.

**The same board on GLM-5.3-Flash** tells the same story with one addition:

- **The best five are within 1.8 points** (mini-swe-agent and OpenCode 61.8%, Claude Code and Pi 61.4%, DeepSeek Harness 60.0%).
- **Effort matters for this model:** 53.1% at low and 59.0% at high.
- **A harness that does not fit the model loses badly.** Codex solves 30.9% of the DeepSWE tasks with GLM-5.3-Flash where the best five solve 57 to 59%. With DeepSeek V4.1 Flash the same Codex is level with the rest.
- **Cost differs more here:** Pi $0.159 per solved task, OpenCode $0.211, mini-swe-agent $0.300.

### Other same-model comparisons

| Source | Model | Spread between harnesses | Caution |
|---|---|---|---|
| Terminal-Bench 2.0 board, as compiled in a Stanford paper | Claude Opus 4.6 | 58.0% (Claude Code) to 74.7%; 76.4% for a harness found by automated search | Secondary; the searched harness was tuned on the tasks it is scored on |
| A harness vendor's test, Terminal-Bench 2.1 | GLM-5.2 | 59.8% (OpenCode) to 72.6% (the vendor's own) | Vendor; the OpenCode figure comes from other runs |
| A cloud vendor's test, Terminal-Bench 2.1 | DeepSeek V4 Flash | 69.2% and 70.3% in two harnesses | Vendor |
| This project, Exercism tasks | DeepSeek V4.1 Flash | Galley ahead of OpenCode 1.19.5 by 1.0 to 7.6 points | Small tasks, hidden tests |
| Noise alone | | About 6 points from machine resources (Anthropic, secondary); about 9 across five identical runs (one vendor) | |

### What moves a result, by measured size

| Lever | Size | Measured where |
|---|---|---|
| Which model | 6.7% to 65.8% in one harness | Terminal-Bench 4.1 board |
| The output of tests the agent could not see, fed back for one more attempt | +24 to +49 points | Our pilot and fourth confirmation |
| Five runs instead of one, if something picks the run that worked | +12 to +27 points | Terminal-Bench 4.1 board |
| A harness that does not fit the model | −26 points | Harness Leaderboard (Codex with GLM-5.3-Flash on DeepSWE) |
| A poor harness instead of a good one | −9 to −17 points | Harness Leaderboard, DeepSeek V4.1 Flash |
| Reasoning effort, low to high | +9 to +15 on frontier models, +5.9 on GLM-5.3-Flash, +0.5 on DeepSeek V4.1 Flash | Terminal-Bench 4.1 board, Harness Leaderboard |
| A second model as advisor | +2.7 points | Anthropic |
| One good harness instead of another | 0 to 2.3 points | Harness Leaderboard, DeepSeek V4.1 Flash |

- **The harness effects that are large are losses:** misfit and poor design. Nothing on these boards shows a feature that lifts a good harness well above the others.
- **The large gains come from information and repetition:** test results, and more than one try.

## 2. Features: Galley against OpenCode and the field

| Capability | OpenCode | Others worth naming | Galley | What is known about its effect |
|---|---|---|---|---|
| Sandbox for commands | None by default | Codex: built in. Claude Code: optional | **Built in, network off, plan mode read-only at the operating-system level** | Safety. No effect on pass rate |
| Permission rules, undo | Yes; undo and redo, session revert | Claude Code and Cline: checkpoints | Rules yes. Undo restores, turn by turn, the files its edit tools changed, not what commands changed | Safety and convenience |
| Sessions: resume, fork, headless, server, background, worktrees | Yes, plus sharing and a web client | | Yes, without sharing | Convenience |
| Providers | 75+ and a curated model list | Aider: 100+ | Anthropic and any OpenAI-compatible API | Reach |
| More than one model | A model per agent | Claude Code: advisor, fallback. Cursor, Copilot, Factory: routers | Advisor, takeover on signals, plan model, fallback, model profiles (new, unmeasured) | Mostly cost; +2.7 points at best ([model-switching.md](model-switching.md)) |
| Sub-agents | General and explore agents, custom agents that can write | Claude Code: teams, workflows. Codex: sub-agents | Read-only helpers for searching | More tokens; pays only for bulk parallel work (Anthropic's and OpenAI's own guidance) |
| Task list or plan tool | `todowrite` | Claude Code, Codex | None | No public ablation found |
| Code intelligence | Language-server tool (experimental), formatters | Aider: repository map. Cursor, Windsurf: trained search models | grep and glob | Not needed for pass rate: the shell-only agent is in the leading group above. Speed is claimed by vendors |
| Web search and fetch | Both | Claude Code, Codex, Gemini CLI | None; a command may ask for network access | Nothing on offline benchmarks. Needed in practice for documentation |
| Edit tools | Exact replace, patch, write | Codex: patch. Aider: several formats | Exact replace, write | Fit to the model matters more than the choice: see Codex with GLM above |
| Loop guard | Asks the user after three identical calls | Gemini CLI; a vendor's guard that tells the model to change approach | Signals exist since today; acted on only when a second model is configured | Vendor claims only |
| Check before finishing | No | Aider: lint and test after each edit. Claude Code: hooks | Optional self-review and verifier | On Exercism: no gain at 2 to 3 times the cost (our runs) |
| Test output fed back automatically | No | Aider | No | Large when it brings information the agent lacked (+24 to +49 points with hidden tests in our runs). Where the agent can run the tests itself the gain is what it fails to do unprompted: unmeasured |
| Several attempts | No | Codex cloud: up to four attempts, chosen by hand (secondary) | No; possible by hand with worktrees | Large if something can pick the right run |
| Extensions | MCP, skills, plug-ins, custom tools and commands | Claude Code: also hooks | MCP only | Reach |
| Project memory | `AGENTS.md` | Claude Code: also memory across sessions | `AGENTS.md` | Convenience |
| Prompt size and caching | A longer prompt and tool list | Pi: under 1,000 tokens | **Short prompt, identical across projects, built for the cache** | Cost: Galley's requests cost under half of OpenCode's in our runs |
| Interfaces | Terminal app, desktop, editor, web, GitHub | | Plain terminal, HTTP server | Convenience |
| Image input | Yes | Most | No | Reach |
| Its own measured benchmark | No | | **Yes: sandboxed, audited, paired statistics** | The reason this project knows what does not work |

Where Galley stands:

- **Ahead:** safety by default, cost per request, and, on paper, the handling of a second model.
- **Level:** the core loop, on the small tasks we measured.
- **Behind:** everything that makes a product (interfaces, extensions, web access, images) and three things that affect results (test feedback, several attempts, a guard against loops on one model).

## 3. What would count as a substantial improvement

Ordered by the size of the measured effect behind each.

| # | Improvement | Evidence | What it takes | How to measure |
|---|---|---|---|---|
| 1 | **Test feedback built in:** run the project's test command after changes and feed failures back until they pass or a budget runs out | +24 to +49 points when a failed attempt was given the output of tests the agent could not see. Where it can run the tests itself the gain is smaller and unmeasured | A setting for the command and a few dozen lines; no extra model cost when tests pass | Tasks with visible tests (DeepSWE style). Not Exercism, where the tests are hidden |
| 2 | **Several attempts with a selector:** `--attempts N` in separate worktrees; pick by the project's tests, otherwise by a judge | +12 to +27 points for five runs with a perfect selector; +4 to +7 for two | Worktrees and background runs exist. The selector is the hard part. Cost times N | Any benchmark, at N times the cost |
| 3 | **A place on a hard-task board** | The only place where harnesses are compared on our model | An adapter for the Harbor framework and a container runtime. Docker is installed on this machine but not running; starting it, and running agents in containers instead of the present sandbox, is the user's decision | Terminal-Bench 2.1, three attempts: about $9 a harness at the board's prices |
| 4 | **A loop guard on one model:** on a signal, tell the model to stop, say what is failing and change approach | A vendor's claim; common in other harnesses | The signals exist; one message | Hard tasks; Exercism runs are too short to loop |
| 5 | **Effort chosen per model** | +5.9 points for one model, +0.5 for another, on the same tasks | A profile field and a default | Cheap sweep per model |
| 6 | **A second model** | +2.7 points at best; needs a clearly stronger model | Built | See [model-switching.md](model-switching.md) |

**What not to expect:** a 5-point lead over OpenCode on DeepSeek V4.1 Flash from harness work of the usual kind. Six harnesses built by six teams land within 2.3 points of each other on that model.

## 4. What this means for the goal, and what each next step costs

**The present rule cannot tell a substantial improvement from none.** It measures first attempts on small tasks with hidden tests, where most failures are details the model has to remember ([`bench/RESULTS-fresh3.md`](../bench/RESULTS-fresh3.md)). Test feedback, several attempts, a loop guard and a second model all do nothing there by design.

Three ways forward. They can be combined.

| Option | What would be shown | Cost | Needs |
|---|---|---|---|
| **A. Keep the rule and the benchmark** | Whether small changes add up. Four confirmations say the lead is about 4 points, short of 5 | $6 to $12 a confirmation | Nothing new |
| **B. Measure on hard tasks, with cost per solved task in the rule** | Whether Galley belongs in the leading group, and whether it is the cheapest there | Terminal-Bench 2.1 with three attempts: about $9 a harness at the board's prices; DeepSWE about $55 | A container runtime, a Harbor adapter, a rule written before the first run |
| **C. Build improvements 1 and 2, then measure them where they can show** | Gains of the size this project has not seen from prompt and tool changes | Building is free; measuring as in B, times the number of attempts | B's setup |

Whatever is chosen, **the statement "Galley beats OpenCode" will mean something different from the present rule**: on this model OpenCode is tied for first of ten, so a win is more likely to read "the same pass rate for clearly less money, and safe by default" than "five points more".

## Sources

- [Harness Leaderboard](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) and its [data](https://joelniklaus-harness-leaderboard.hf.space/api/index), read 14 November 2026
- [Terminal-Bench 4.1 board](https://www.tbench.ai/), [SWE-bench boards](https://www.swebench.com/)
- [Same Model, 18 Points Apart](https://dev.to/justinpennington/same-model-18-points-apart-your-agent-harness-is-the-real-product-2eia) (secondary account of the Stanford paper and of Anthropic's noise study)
- [Same Model, Different Results](https://kimchi.dev/blog/same-model-different-harness-terminal-bench) (a harness vendor's test)
- [Dynamic Model Escalation for Coding Agents](https://www.gmicloud.ai/en/blog/dynamic-model-escalation-for-coding-agents-a-gmi-router-experiment-across-two-harnesses) (a cloud vendor's test)
- [From Question Answering to Task Completion: A Survey on Agent System and Harness Design](https://arxiv.org/abs/2606.20683)
- OpenCode's loop permission: [issue 18108](https://github.com/anomalyco/opencode/issues/18108); Codex cloud attempts: [a third-party guide](https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/)
- Feature facts for the other harnesses: [coding-harnesses.md](coding-harnesses.md) and the documentation linked from [model-switching.md](model-switching.md)
- This project's results: [`bench/`](../bench/)
