# Automatic design of multi-model systems, role assignment, and model-tuned prompts/harnesses (2023 to Nov 2026)

Label key: [read] = seen in fetched full text of the paper; [abstract] = abstract page only; [secondary] = third-party account or search snippet. All items are preprints unless a venue is given. Research budget was about 15 tool calls, so coverage is partial: ADAS, GPTSwarm, MaAS, G-Designer, AgentPrune, FlowReasoner, MAS-GPT, ScoreFlow, EvoMAC, AgentSquare, Archon, SICA, OPRO, TextGrad, PromptAgent, MIPROv2 were NOT opened individually (only seen through other papers' evaluations). Not covered here is not the same as absent.

## (a) Assigning different models to different roles or modules: gain over best single model

### Takeaway
Per-module model choice gives measurable gains in controlled studies, but the evidence is thin for coding agents: the only coding-related numbers are small (LiveCodeBench self-refine, MBPP in multi-agent frameworks), come from 2024-era models, and use no repeated runs. Search over allocations is cheap (calls linear in modules). No paper found tests planner/coder/reviewer/tester assignment inside a real SWE-bench-style tool-using agent.

### Cited Findings
- LLMSelector (Chen et al., Feb 2025, ICML 2025, preprint arXiv 2502.14815). [read] 10 models (GPT-4o, 4o-mini, GPT-4-Turbo, Claude 3.5 Sonnet/Haiku, Gemini 1.5 Pro/Flash, Llama 3.1 405B/70B, Qwen2.5 72B). Systems: self-refine, 2-debater debate, locate-solve. Best single model for all modules vs LLMSelector: LiveCodeBench (self-refine, 479 q) 89% (Claude 3.5 Sonnet) -> 95%; CommonGenHard 75 -> 84; SimpleQA 20 -> 28; FEVER 64 -> 70; TableArithmetic 30 -> 100 and TableBias 44 -> 100 (100 synthetic questions each, very small). DSPy MIPROv2 (GPT-4o) was at or below the best single model on several (LiveCodeBench 87%). Cost: calls scale linearly with modules; dollar cost not reported; no variance or repeats; the paper's own gain figures are inconsistent with its table in three places (e.g. CommonGenHard 84-75 = 9, listed as 11); the module scores come from an LLM diagnoser whose accuracy is not quantified. Static systems only; 50/50 train/eval split. [https://arxiv.org/html/2502.14815v1](https://arxiv.org/html/2502.14815v1). Abstract-level claim (ICML version): 4-73% gains with general models, 3-21% with frontier reasoning models [secondary, search snippet, https://icml.cc/virtual/2025/47988].
- X-MAS (Ye et al., Shanghai AI Lab/SJTU, 22 May 2025, preprint arXiv 2505.16997). [read] X-MAS-Bench: 27 LLMs x 5 functions (QA, revise, aggregation, planning, evaluation) x 5 domains. Rankings differ by function: e.g. coding domain best for QA Qwen2.5-32B (80.3), revise Qwen2.5-Coder-32B (77.7), aggregation Qwen2.5-72B (85.5), planning Llama-3.1-70B (71.0), evaluation Qwen2.5-14B (55.4). Paper concludes no single LLM is best everywhere. X-MAS-Design (swap models per function inside AgentVerse, LLM-Debate, DyLAN, X-MAS-Proto; 4 candidate models): average 65.9-67.3 vs best homogeneous 60.1-64.3; MBPP 77.5-79.9 vs 75.5-78.3 (gains of about 0.4-4 points on coding); MATH +4 to +8.4. Mixed chatbot+reasoner (Qwen2.5-72B + R1-Distill-32B): AIME-2024 up to 70.0 vs 23.3 chatbot / 0 to 40 reasoner alone. Arbitrary (not benchmark-guided) assignment can fall below the homogeneous baseline (one config 24.8%). Small open models only; MBPP (not SWE) for code; selection used a benchmark on the same domain. [https://arxiv.org/html/2505.16997v1](https://arxiv.org/html/2505.16997v1)
- MasRouter (Yue et al., ACL 2025, arXiv 2502.11133). [secondary] Jointly routes collaboration mode, roles and LLM per query; evaluated on MMLU, GSM8K, MATH, HumanEval, MBPP; reported up to 52.07% overhead reduction on HumanEval and 40-44% on MBPP vs dynamic MAS baselines, +1.8 to 8.2 on MBPP vs SOTA (unit unclear), 3.51% average over RouterDC. I could not open the paper; numbers from search snippets only. [https://arxiv.org/abs/2502.11133](https://arxiv.org/abs/2502.11133)
- Cursor planner/worker split (vendor claim, blog by Wilson Lin, 14 Jan 2026). [read] "GPT-5.2 is a better planner than GPT-5.1-Codex, even though the latter is trained specifically for coding"; "we now use the model best suited for each role rather than one universal model"; Opus 4.5 reported to stop early and take shortcuts on long runs. No benchmark numbers for the role comparison. [https://cursor.com/blog/scaling-agents](https://cursor.com/blog/scaling-agents)
- Cursor later swarm experiment, as reported by The Decoder, 26 Jul 2026 (secondary, vendor experiment, single task: rebuild SQLite in Rust from the manual, graded by sqllogictest). [read of the news article only] Total cost: Opus 4.8 planner + Composer 2.5 worker $1,339; Fable 5 planner + Composer 2.5 worker $2,234; Grok 4.5 solo $1,928; GPT-5.5 solo $10,565. Workers consumed at least 69% of tokens in every run. All new-swarm configurations eventually reached 100%. One task, one run each, no quality difference reported between configurations, so it supports "frontier planner + cheap worker is much cheaper" but not "equal quality". [https://the-decoder.com/cursors-agent-swarm-suggests-cheaper-models-can-handle-most-coding-when-frontier-models-plan-the-work/](https://the-decoder.com/cursors-agent-swarm-suggests-cheaper-models-can-handle-most-coding-when-frontier-models-plan-the-work/)

### Inferences
- The LLMSelector-style loop (change one module's model, measure end-to-end, keep if better) needs only API access and fits a harness with named roles; the gain it reports is largest when modules have complementary failure modes (e.g. critic that agrees with its own mistakes).
- The strongest cost evidence for role split in coding is vendor-reported (Cursor): strong planner, cheap worker.

### Gaps
- No peer-reviewed or independent measurement of planner/coder/reviewer/tester assignment on SWE-bench with frontier 2025-26 models was found. MASRouter, and any 2025-26 follow-ups to LLMSelector, were not read in full.

## (b) Which model is better at which role

### Takeaway
Rankings do differ by role in X-MAS-Bench and in Cursor's report, but both are weak for the harness question (small open models; vendor anecdote). I found no measurement ranking frontier models as planner vs worker vs judge on coding tasks.

### Cited Findings
- X-MAS-Bench rankings differ per function (see above); the best "evaluation" (judge) model in coding was Qwen2.5-14B at 55.4 vs QA leader Qwen2.5-32B at 80.3, i.e. judging was much weaker than solving for the same models. [read] [https://arxiv.org/html/2505.16997v1](https://arxiv.org/html/2505.16997v1)
- LLMSelector locate-solve case study: Claude 3.5 Sonnet perfect on the locate module, Gemini 1.5 Pro perfect on solve; self-critic of the same model repeated its own error in LiveCodeBench. [read] [https://arxiv.org/html/2502.14815v1](https://arxiv.org/html/2502.14815v1)
- Cursor (vendor): planner quality not predicted by coding specialisation (GPT-5.2 over GPT-5.1-Codex). [read] [https://cursor.com/blog/scaling-agents](https://cursor.com/blog/scaling-agents)

### Gaps
- Judge-vs-solver ability benchmarks (e.g. judge benches, reasoning models as planners) were not searched specifically; no result to report.

## (c) Automatic workflow / topology search

### Takeaway
Original papers report gains over hand-designed baselines, but a 2026 independent audit finds that a 5-sample self-consistency baseline usually matches them at a fraction of the cost, and that found workflows often collapse to self-consistency or debate. Search cost is large.

### Cited Findings
- "The Illusion of Multi-Agent Advantage" (Jwalapuram et al., Salesforce Research/HKUST/UBC/NTU, 13 Jun 2026, preprint arXiv 2606.13003v2). [read, first 100k of 106k chars] Evaluates DyLAN, MAS-Zero, ADAS, AFlow, MaAS, MAS-Orchestra vs CoT-SC (5-vote) on GPQA-Diamond, HLE-Maths, SWE-Bench Lite, BrowseComp-Plus and a synthetic SMFR benchmark; backbones GPT-4o, GPT-OSS-120B, GPT-5, Gemini-2.5-Pro; 3 runs averaged; costs include search/validation. SWE-Bench Lite, GPT-5: CoT-SC 57.09% ($286.40) vs DyLAN 55.97% ($227.40) (only methods shown in the pages I read; ADAS/AFlow SWE numbers not seen). GPQA GPT-5: CoT-SC 87.35 ($46) vs MAS-Zero 86.75 ($637), ADAS 85.23 ($832). HLE-Maths GPT-5: CoT-SC 33.92 vs MAS-Zero 38.20 ($1,288 vs $116). Only a few significant gains (SMFR: DyLAN +6.6pp on GPT-OSS at about 5x cost; MAS-Orchestra +6.0pp on GPT-5 at about 1.9x). Deconstruction: 7 of 14 final AFlow workflows reduce to "iterate one prompt 3 times and aggregate"; MaAS 74.2% single-call operator on BrowseComp-Plus with GPT-5; MAS-Orchestra picks Debate 84.9% of the time on GPQA. A hand-built expert MAS reached 96.51% on SMFR (GPT-5) at CoT-SC-like cost, so structure helps when designed for the task. Same-lab synthetic benchmark; Gemini runs incomplete. [https://arxiv.org/html/2606.13003](https://arxiv.org/html/2606.13003)
- AFlow (Zhang et al., Oct 2024, ICLR 2025). [abstract] 5.7% average improvement over SOTA baselines on six benchmarks; smaller models beating GPT-4o on specific tasks at 4.55% of its inference cost. Benchmark list not confirmed from the page. [https://arxiv.org/abs/2410.10762](https://arxiv.org/abs/2410.10762)
- EvoMAS (arXiv 2602.06511). [secondary snippet] 40.4% vs single agent 36.6% and peer review 39.8%; claims the gap holds across Claude generations. Not opened; benchmark unknown. [https://arxiv.org/html/2602.06511v3](https://arxiv.org/html/2602.06511v3)
- MetaAgent-X (arXiv 2605.14212) re-runs ADAS and AFlow on its own held-out split with budget matching [secondary snippet]; PDF too large to fetch, results unread. [https://arxiv.org/pdf/2605.14212](https://arxiv.org/pdf/2605.14212)

### Inferences
- For a harness with API-only access, topology search over general "agent graphs" has the weakest evidence: independent audit says no robust gain and large search cost; any gain on SWE-style tasks is within noise (DyLAN -1.1 on SWE-Bench Lite).

### Gaps
- Not read: ADAS, MaAS, GPTSwarm, G-Designer, AgentPrune, FlowReasoner, MAS-GPT, ScoreFlow, EvoMAC, AgentSquare, Archon (no per-paper numbers; Archon and EvoMAC are the code-relevant ones). No search-cost figures for them.

## (d) Strong model optimising prompts for a weaker one; transfer

### Takeaway
Optimised prompts transfer inconsistently; no study found that isolates optimiser strength. Evidence on agent/coding tasks is nearly absent.

### Cited Findings
- GEPA (Agrawal et al., ICLR 2026). Per the brief, already covered. [secondary] The paper reports prompts optimised on a weaker model of another family still gave about +9% aggregate on GPT-4.1 mini, ahead of MIPROv2/TextGrad/Trace optimised directly on it; search snippet only. [https://arxiv.org/pdf/2507.19457](https://arxiv.org/pdf/2507.19457)
- "Beyond the Answer" (Pandey, Ye, Li; UW/CMU; 30 Mar 2026; preprint arXiv 2603.28038). [read] GEPA variant with DeepSeek-V3.2 as optimiser, 2 tasks (Lean algebra from MiniF2F, GPQA Diamond), transfer to GPT-5.4-mini, GLM 5, Claude Sonnet 4.6. Optimiser model itself 100% algebra, 94.44% GPQA. GPT-5.4-mini algebra 50.00 -> 61.11; GLM 5 hand CoT 97.22 beat GEPA 94.44; Claude Sonnet 4.6 hand CoT beat GEPA on both (52.78 vs 50.00; 83.33 vs 80.56). Authors conclude gains are model-specific; their cause (optimiser model) is untested. Small, preliminary, 2 benchmarks, no coding. [https://arxiv.org/html/2603.28038](https://arxiv.org/html/2603.28038)
- TextGrad-based study with stronger model feedback improving gpt-3.5-turbo [secondary snippet; reasoning tasks, not agents]; MAS-PromptBench (Bai and Shi, 23 Jun 2026, arXiv 2606.23664) uses Qwen3.5-9B task model with Qwen3.5-122B reflection model on multi-agent systems [secondary]; the PDF could not be read so no result is reported. [https://arxiv.org/pdf/2606.23664](https://arxiv.org/pdf/2606.23664)
- Critical study "Textual Gradients are a Flawed Metaphor" (arXiv 2512.13598) [secondary snippet only]. [https://www.arxiv.org/pdf/2512.13598](https://www.arxiv.org/pdf/2512.13598)

### Gaps
- No ablation of reflection-model strength found; OPRO, PromptAgent, MIPROv2 papers not read; no coding-agent system-prompt optimisation result with transfer across models.

## (e) Self-improving coding agents and transfer

### Takeaway
Self-modifying agents show real gains on the benchmark they were searched on and some transfer to other models, but searches are expensive (DGM about 2 weeks per run) and gains were measured against weak starting scaffolds. The cheapest design (Live-SWE-agent, no offline search) gives modest consistent gains over a minimal scaffold.

### Cited Findings
- Darwin Gödel Machine (Zhang et al., 2025; arXiv 2505.22954). [read, first 100k chars] SWE-bench 20.0 -> 50.0%; Polyglot 14.2 -> 30.7% (abstract). Transfer (200 SWE tasks): o3-mini 23.0 -> 33.0; Claude 3.7 Sonnet 19.0 -> 59.5. Cross-benchmark: SWE-evolved agent 28.9% on Polyglot (base 14.2). Run took about 2 weeks and significant API cost (dollar figure not seen). [https://arxiv.org/html/2505.22954](https://arxiv.org/html/2505.22954)
- Huxley-Gödel Machine (Wang, Piekos, ..., Schmidhuber; 24 Oct 2025; ICLR per search snippet; arXiv 2510.21614). [read, first 100k of 153k chars] SWE-Verified-60: initial 40%; SICA 50.0, DGM 53.3, HGM 56.7, CPU-hours 1231 (DGM) vs 517 (HGM). Polyglot: initial 20.3; SICA 25.4, DGM 27.1, HGM 30.5. Full SWE-bench Verified 53.2 -> 61.4 (8,000 evaluations). Held-out: SWE-bench Lite, GPT-5-mini, tasks not overlapping Verified ("filtered", 207 tasks): HGM agent 40.1 vs SWE-agent 39.6 vs HGM initial 34.8, i.e. +0.5 over a human-built scaffold. Transfer to GPT-5 on Lite: filtered 47.8 vs SWE-agent 48.3; standard 57.0 vs 56.7, i.e. parity, not gain. Optimisation used GPT-5 to expand and GPT-5-mini to evaluate. [https://arxiv.org/html/2510.21614](https://arxiv.org/html/2510.21614)
- Live-SWE-agent (Xia et al., Nov 2025, arXiv 2511.13646). [read] No offline training; agent writes its own tools at run time. SWE-bench Verified single attempt, mini-SWE-agent vs Live-SWE-agent: GPT-5-Mini 59.8 -> 63.0 ($0.04 -> $0.05); GPT-5 65.0 -> 68.4; Claude 4.5 Sonnet 70.6 -> 75.4 ($0.56 -> $0.68); Gemini 3 Pro 74.2 -> 77.4. SWE-Bench Pro (Claude 4.5 Sonnet, 731 tasks) 43.6 -> 45.8. Multilingual 50-task subset 40.0 -> 46.0. Ablation (50 tasks): no tool creation 62.0, full 76.0. Transfer table (same 50 tasks): GPT-5-Nano 44 -> 14 (worse), GPT-5-Mini 60 -> 58 (worse), GPT-5 60 -> 68, Claude 4.5 Sonnet 62 -> 76. The 50-task subsets are small (1 task = 2 points). Gain is zero or negative for weakest models. [https://arxiv.org/html/2511.13646v3](https://arxiv.org/html/2511.13646v3)
- Meta-Harness (Lee et al., 2026-03; arXiv 2603.28052). [read, first 100k of 114k chars] Proposer: Claude Code with Opus 4.6, reading prior harness code, traces and scores. TerminalBench-2 (89 tasks; search and final eval on the same set, so not held out): Opus 4.6 76.4% (Claude Code 58.0, Terminus 2 62.9, Terminus-KIRA 74.7); Haiku 4.5 37.6% (Claude Code 27.5, Mini-SWE-Agent 29.8, Goose 35.5). About 60 harnesses over 20 iterations, "a few hours", dollar cost not reported. Held-out/other models: retrieval-augmented math, harness searched with GPT-OSS-20B, tested on 5 held-out models: no retriever 34.1 avg -> 38.8 (+4.7; per model +1.6 to +8.7). Text classification: 48.6 vs ACE 40.9; OOD 9 unseen datasets 73.1 vs 70.2. [https://arxiv.org/html/2603.28052v1](https://arxiv.org/html/2603.28052v1)
- Agentic Harness Engineering and its re-evaluation: already covered by earlier survey. Snippet (secondary) says AHE reaches 71.9% on Verified with +5.1 to +10.1pp on three other model families; the re-evaluation found +0.6 held-out, so treat transfer claims with caution. [https://alphaxiv.org/abs/2604.25850](https://alphaxiv.org/abs/2604.25850)

### Inferences
- A cross-model result common across DGM, HGM and Live-SWE-agent: improvements are largest on models similar to or stronger than the search model and shrink to zero (or reverse) on weaker ones.
- Compared with DGM/HGM, Live-SWE-agent-style on-the-fly tool creation costs no offline search and could be tried in a harness; its transfer table shows risk for small models.

### Gaps
- SICA paper not read directly. HGM full-text sections after 100k chars not read. No independent replication of DGM/HGM found.

## Automatic choice of harness configuration per model

### Takeaway
No published method found that picks tool set, prompt or planning on/off per model from measurements; closest are Meta-Harness (search per model/benchmark) and LLMSelector (per module model choice). One 2026 preprint reports model-specific harnesses did not beat a shared one.

### Cited Findings
- SWE-Serve (Williams et al., arXiv 2609.26777, Sep 2026). [secondary snippet] Reports that model-specific harnesses did not improve mean pass@1 (75.5% in both configurations). The PDF was unreadable; I could not confirm numbers or setup. [https://arxiv.org/pdf/2609.26777](https://arxiv.org/pdf/2609.26777)
- Scaffold-only variation up to 15pp on SWE-bench Verified; same Opus 4.5 45.9% (standardised scaffold) vs 55.4% (Claude Code) on SWE-bench Pro [secondary snippets, unverified]. [https://codex.danielvaughan.com/2026/06/16/harness-outweighs-model-claw-swe-bench-harness-bench-utboost-codex-cli-configuration-strategy/](https://codex.danielvaughan.com/2026/06/16/harness-outweighs-model-claw-swe-bench-harness-bench-utboost-codex-cli-configuration-strategy/)
- Survey "Self-Improvements in Modern Agentic Systems" (arXiv 2607.13104): not opened. Snippet warns of benchmark-specific search and verifier overfitting. [https://arxiv.org/pdf/2607.13104](https://arxiv.org/pdf/2607.13104)

### Gaps
- Nothing verified on automatic per-model tool/prompt/planning selection.

---

## Final lists

### (1) Methods with the strongest evidence for an API-only coding harness
1. Frontier planner + cheap worker split (Cursor; vendor, one task, cost evidence only: $1,339 to $2,234 vs $10,565 solo; quality not compared).
2. LLMSelector-style greedy per-role model search with end-to-end measurement (read; +6 on LiveCodeBench self-refine; linear calls; small, no variance, 2024 models). Adopt as a measurement procedure, not as a promised gain.
3. Benchmark-guided (not arbitrary) role assignment, and warning on arbitrary assignment (X-MAS: arbitrary can drop far below homogeneous).
4. Live-SWE-agent-style run-time tool creation (read; +3 to +5 pp on Verified for 3 of 4 strong models at about same cost; negative on weak models; no offline search).
5. Meta-Harness-style proposer-reads-traces harness search with a strong proposer (read; strong on TerminalBench-2 but same-task tuning; held-out transfer only shown on math/classification).
6. Self-consistency / simple baselines as the control to beat (Illusion paper).

### (2) Promising but did not survive scrutiny
- Automated topology/workflow search (ADAS, AFlow, MaAS, MAS-Zero, DyLAN): 2026 audit shows CoT-SC matches or beats them at lower cost; AFlow workflows often collapse to self-consistency; SWE-Bench Lite shows no gain.
- GEPA-style optimised prompts transferring to other models: DeepSeek-optimised prompts lost to hand CoT on Claude Sonnet 4.6 and GLM 5 (preliminary, small).
- DGM/HGM transfer: HGM-to-GPT-5 on SWE-bench Lite was parity with the best human scaffold; Live-SWE-agent made GPT-5-Nano and GPT-5-Mini worse on 50 tasks.
- Per-model harness specialisation: single unverified report of no gain (SWE-Serve).
- Agentic Harness Engineering: re-evaluation found +0.6 held out (earlier survey).

### (3) Open questions
- Does assigning different frontier models to planner/coder/reviewer/tester in a real tool-using coding agent beat the best single model on SWE-bench-class tasks at equal cost, with repeated runs?
- Does a stronger optimiser/reflection model produce better prompts for a weaker coding agent, holding the target fixed?
- What do ADAS/AFlow/MaAS/Archon/EvoMAC gain on code tasks versus a self-consistency baseline with frontier 2026 models? (only SWE-Bench Lite DyLAN seen)
- How much do harness changes found for one model transfer to another when search and test tasks are disjoint?
- Per-model automatic selection of tool set and planning on/off: no verified method.
- Items I could not open (MAS-PromptBench, SWE-Serve, MetaAgent-X, MASRouter, EvoMAS, GEPA full text) are the first to read next.
