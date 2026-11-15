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

---

## Second pass (gaps closed)

Label key as before. Quotes are what the fetch tool returned from the page; where a figure came back only as a tool summary I say so.

### 1. Salesforce audit, identification
- "The Illusion of Multi-Agent Advantage", Jwalapuram, Lin, Li, Jiao, Wang, Ming, Ke, Qin, Carenini, Joty (Salesforce Research, HKUST-GZ, UBC, NTU). arXiv 2606.13003; v1 11 Jun 2026, v2 13 Jun 2026; preprint. [read abstract page + html] https://arxiv.org/abs/2606.13003
- Main-conclusion sentence (abstract): "we demonstrate that automatic MAS consistently underperform CoT-SC despite being up to 10x more expensive." Also: "current automated design paradigms produce architectural bloat that prioritizes superficial complexity". [read]
- Systems: DyLAN, MAS-Zero, ADAS, AFlow, MaAS, MAS-Orchestra vs CoT-SC (5 votes). Backbones: GPT-4o, GPT-OSS-120B, GPT-5, Gemini-2.5-Pro (GPT-OSS not run on SWE-Bench Lite; Gemini incomplete). Benchmarks: GPQA-Diamond, HLE-Maths, SWE-Bench Lite, BrowseComp-Plus, SMFR (authors' synthetic set). 3 runs averaged. Covers ADAS, AFlow, MaAS, DyLAN. Does NOT cover SICA, Archon, AgentSquare, EvoMAC, or the model-per-role methods (X-MAS, LLMSelector, MasRouter).
- Caution: the abstract's "up to 10x" understates its own table (MAS-Zero on SMFR/GPT-5 about 19x). The audit uses generic reasoning tasks plus one SWE benchmark; the SWE-Bench Lite rows I saw were only CoT-SC and DyLAN.

### 2. SWE-Serve: claim CONFIRMED with figures
- SWE-Serve: Benchmarking Agentic Engineering For Production Inference Serving, Williams, Farris, Farris, Jiao; arXiv 2609.26777 (Sep 2026); preprint. [read, arxiv.org/html, section 5.3] https://arxiv.org/html/2609.26777
- Quote: "Switching to model-specific harnesses does not improve mean pass@1 in either evaluated configuration." Figure 3 caption: "Model-specific harness sensitivity on 53 SWE-Serve tasks, with three runs per harness." Models: GPT-5.6 Sol and Claude Opus 5, both at maximum reasoning effort. Shared mini-SWE-agent: 75.5% mean pass@1 for both; model-specific: GPT-5.6 Sol with Codex 73.6%, Claude Opus 5 with Claude Code 69.8%.
- Limits: 53 tasks, 3 runs, a serving/infrastructure benchmark (not issue resolution), two models, no variance given in what I read. The sentence is about vendor harnesses vs a generic harness, not about automatic per-model tuning. Only first 100k of 168k chars read.

### 3. MASRouter and 2026 follow-ups
- MasRouter (Yue et al., ACL 2025, arXiv 2502.11133). [read, html] https://arxiv.org/html/2502.11133 Pool: gpt-4o-mini, claude-3.5-haiku, gemini-1.5-flash, llama-3.1-70b (DeepSeek-V3 only as unseen-model test). Pass@1 (Table 1/11): MasRouter HumanEval 90.62 (Table 11 says 90.52), MBPP 84.00; AFlow (gpt-4o-mini) 90.15 and 82.20; SC(CoT) 88.19 and 75.80; LLM-Debate 86.28 and 75.40; RouterDC 87.75 and 75.20; FrugalGPT 87.31 / 74.40; single gpt-4o-mini IO 85.71 / 72.20. So the gain over the AFlow row is about +0.5 HumanEval and +1.8 MBPP; over the best router +2.9 / +8.8. Cost per whole dataset (USD): MasRouter 0.185 HumanEval / 1.039 MBPP vs AFlow 0.363 / 1.723, LLM-Debate 0.624 / 4.427, SC(CoT) 0.218 / 0.449; RouterDC is cheaper at 0.023 / 0.145. Headline quote: "reducing overhead by up to 52.07% compared to SOTA methods on HumanEval" (table figures give about 49% vs AFlow, per the fetch tool). Inconsistent values between tables noted. Preprint-grade caveat: 2024-era small models, per-query routing of whole pipeline; no repeated runs seen.
- 2026 follow-ups found only as search snippets (not opened, titles and venues from snippets): "Bias-Aware Orchestration: Role-Specialized Multi-Agent Collaboration of Heterogeneous LLMs" (Findings of EMNLP 2026, https://aclanthology.org/2026.findings-emnlp.2055/); "MetaGen: Self-Evolving Roles and Topologies for Multi-Agent LLM Reasoning" (Findings of EMNLP 2026, claims gains on code generation, https://aclanthology.org/2026.findings-emnlp.2005/); "MARS: Multi-Specialist LLM Relay System for Competitive Programming" (arXiv 2608.23918). [secondary] No numbers confirmed.
- Closest measured evidence for splitting strong and weak models on code:
  - ManagerWorker, arXiv 2603.26458 (Mar 2026, preprint) [read, html], SWE-bench Lite, 200 instances: Sonnet 4.6 manager + GPT-5-mini worker 124/200 (62%); Sonnet 4.6 alone 120/200 (60%); GPT-5-mini alone 101/200 (51%); simple loop 106/199 (53%); weak-manager+weak-worker 21/50 (42%). Token estimate per instance: about 6.6K strong + 60K weak vs 30K strong for strong-direct; paper says it "shifts ~90% of tokens" to the worker (estimated, not billed). Quote: "splitting reasoning from execution is only productive when each model operates close to its training distribution." The full pipeline beats the strong model alone by 2 points (4 tasks), within noise, while moving tokens to the cheap model. https://arxiv.org/html/2603.26458v1
  - DCAS, Thangarajah, Chen, Hassan, arXiv 2608.06113 (6 Aug 2026, preprint). Abstract [read]: "controlled plan-source intervention confirms planning quality is a high-leverage component". PDF undecodable; html 404. Figures from a blog write-up [secondary, https://codex.danielvaughan.com/2026/08/08/dcas-decoupling-cli-agent-scaffolding-internalize-planning-codex-cli-cross-scaffold-transfer-plan-mode/ via search]: Qwen3-Coder-30B-A3B executor under Claude Code on SWE-bench Verified, 100-turn cap: no planning 42.8%, self-plan 48.2%, open-weight Qwen3-Coder-480B planner 49.2%. CONFLICT: an earlier search snippet claimed a frontier planner gave about +15 points and that Sonnet 4.5 (57.8%) beat Opus 4.5 (54.2-56.0%) as planner; the later write-up found no closed frontier planner condition. I could not resolve this; do not use the frontier/Sonnet-vs-Opus numbers.
  - Blackbox AI blog (vendor claim, secondary): Opus orchestrator over GLM-5.2 executor 69.7 vs 58.4 for GLM-5.2 alone on Terminal-Bench 2.0. Not verified.

### 4. Optimiser strength and prompt transfer
- GEPA own paper (arXiv 2507.19457, ICLR 2026) [read first 100k of 181k chars]: no reflection-model-strength ablation visible (appendices on reflection model were cut off, so unconfirmed). Observation 6 quote: "Despite originating from a weaker model in a different family, these prompts transfer effectively" (Qwen3 8B-optimised prompts on GPT-4.1 mini: 62.03 vs 53.03 baseline, +9.00 aggregate; HotpotQA up to +27.67). Vs MIPROv2: GPT-4.1 mini MIPROv2 +5.64, GEPA +12.19, GEPA+Merge +13.33; Qwen3 8B MIPROv2 +2.61, GEPA +9.62. Rollouts 1,839-7,051 vs 24,000 for GRPO. Code: NPUEval mean vector utilisation 30.52% vs 4.25% (GPT-4o with up to 10 refinements); authors: "These are early results and warrant further systematic study." https://arxiv.org/html/2507.19457
- MIPRO / DSPy (Opsahl-Ong et al., arXiv 2406.11695) [read, 100k of 141k]: no proposer-strength ablation. Proposer GPT-3.5 by default, GPT-4 for ScoNe/HoVer/Iris; task model Llama-3-8B; authors say future work should test "when employing different models". Gains: ScoNe 69.1 -> 79.4, HotPotQA 36.1 -> 46.4, HoVer 25.3 -> 39.0; abstract "by as much as 13% accuracy". Confounds proposer and task effects. https://arxiv.org/html/2406.11695
- OPRO (Yang et al., arXiv 2309.03409) [read, 100k of 171k]: optimizer LLM matters but not monotonically with strength. GSM8K with PaLM 2-L scorer: PaLM 2-L-IT best instruction 80.2%, pre-trained PaLM 2-L 79.9%, gpt-3.5-turbo 78.5%, gpt-4 74.5%. BBH: PaLM 2-L-IT beat gpt-3.5-turbo with a text-bison scorer (e.g. movie_recommendation 91.6 vs 70.8) but gaps were small with a PaLM 2-L scorer (90.8 vs 88.0). Quote: "The styles of instructions found by different optimizer LLMs vary a lot". No test of moving a prompt between scorer models; only dataset transfer (GSM8K -> MultiArith/AQuA). So a stronger (GPT-4) optimiser did NOT give the best prompts here. https://arxiv.org/html/2309.03409
- MAS-PromptBench (Bai and Shi, arXiv 2606.23664, 23 Jun 2026, preprint) [read, html]: task model Qwen3.5-9B (thinking off), reflection model Qwen3.5-122B-A10B (thinking on); GEPA and MIPRO, 25 train + 25 validation examples per dataset-topology pair. Findings: prompt optimisation gains up to +24.0 points and drops up to -16.0 points depending on configuration; single agent +4.2 on average vs at most +2.3 for the four MAS topologies; coding benchmarks +3.7 on average, LiveCodeBench +3.2, SWE-Bench Verified -2.0, APPS +10.0; team size gains fall from +2.4 (n=2) to -2.1 (n=10). It does NOT vary reflection model strength and does NOT test cross-model transfer (confirmed by the fetch). Small validation sets. https://arxiv.org/html/2606.23664
- Other (secondary, search snippets only, not opened): GREATER (ICLR 2025) reports prompts optimised with a small model matched or beat prompts from GPT-4 and PaLM-2-L; PromptTailor (arXiv 2511.21725) with an 8B optimiser still helps a Llama-3 70B target; "Rethinking Prompt Optimizers" (arXiv 2505.09930) says stronger target models benefit; the two disagree on direction. https://arxiv.org/pdf/2511.21725
- TextGrad paper not opened.
- Transfer summary: positive in GEPA (weak->strong family, 6 tasks, but on QA-style tasks), mixed/negative in the March 2026 study (DeepSeek-V3.2 -> Sonnet 4.6 and GLM 5). No direct controlled study of optimiser strength was found; the little evidence (OPRO, GREATER) says a stronger optimiser is not reliably better.

### 5. Rankings by role (judge, planner)
- CodeJudgeBench (Jiang et al., arXiv 2507.10535, Jul 2025; ACL 2026) [read, html]: 26 judge models; 5,352 pairs over code generation, code repair, unit test generation. Top overall accuracy: Gemini-2.5-Pro 81.98 (generation) / 84.93 (repair) / 79.46 (test), avg 82.12; Claude-4-Sonnet 79.93 avg; Claude-4-Opus 76.36 avg (below Sonnet); Gemini-2.5-Flash 74.66; Claude-3.7-Sonnet 67.64. Intro quote: "strong code generation ability does not necessarily translate into strong code judgment capability" (cited from prior benchmarks, not shown by a paired solve-vs-judge table in this paper). Small thinking models (Qwen3-8B) beat much larger non-reasoning models up to 70B as judges [abstract-level]. Models are mid-2025; no later frontier models. https://arxiv.org/html/2507.10535
- Planner: only ManagerWorker (Sonnet 4.6 as manager works, same-model weak manager fails: 42% vs 62%), DCAS (secondary), X-MAS planning rankings, and Cursor (vendor) were found. No benchmark pairing the same frontier models as planner, worker and judge.

### 6. ADAS, SICA, Archon, AgentSquare, EvoMAC
- ADAS (Hu, Lu, Clune; arXiv 2408.08435) [abstract only]: quote "agents invented by Meta Agent Search maintain superior performance even when transferred across domains and models"; domains "coding, science, and math". No numbers seen. Audited by the Salesforce paper (no robust gain vs CoT-SC; search non-monotonic on GPQA, 832 USD on GPQA/GPT-5 vs 46 for CoT-SC). MetaAgent-X (below) found ADAS below the single agent on Qwen3-8B. Original transfer claim stands only on its own authors' tasks.
- SICA (Robeyns et al.; arXiv 2504.15228) [abstract only]: quote "performance gains from 17% to 53% on a random subset of SWE Bench Verified"; no cost in abstract. HGM's comparison: on SWE-Verified-60, 50.0% vs HGM 56.7% and DGM 53.3%, and SICA hit a context-length error after 360 evaluations; Polyglot 25.4%, 572 CPU-hours (HGM paper, [read]). Not covered by the Salesforce audit.
- Archon (Saad-Falcon et al.; arXiv 2409.15254) [abstract only]: "outperform frontier models such as OpenAI's o1, GPT-4o, and Claude 3.5 Sonnet by an average of 15.1%" across instruction-following, reasoning and coding; configures LLM pool and inference-time techniques under a compute budget. No code-specific number or cost seen. Not covered by the audit. Note this is a model-and-technique selection method, the closest relative of LLMSelector.
- AgentSquare (Shang et al.; ICLR 2025; arXiv 2410.06153) [read html]: modular space (planning, reasoning, tool use, memory); quote "achieving an average performance gain of 17.2% against best-known human designs"; tasks ALFWorld, SciWorld, PDDL, WebShop, TravelPlanner, M3ToolEval (no SWE/code-editing); GPT-3.5-turbo and GPT-4o; search cost $10.51 to $42.14 per iteration (GPT-4o); no transfer evaluation. Not covered by the audit.
- EvoMAC (Hu et al.; ICLR 2025; arXiv 2410.16946) [read html]: GPT-4o-Mini: Website Basic 89.38, Game Basic 77.54, HumanEval 94.51 vs single-agent 62.90 / 42.76 / 88.41; quote "EvoMAC significantly outperforms previous SOTAs by 26.48%, 34.78%, and 6.10%". A Claude-3.5-Sonnet variant "consistently outperforms the other" but only shown in a figure. Cost not reported. Not covered by the audit; its single-agent baseline is the weak GPT-4o-Mini.
- MetaAgent-X (arXiv 2605.14212, May 2026, preprint) [read html]: Qwen3-4B/8B (no-thinking), code: APPS, LiveCodeBench-v6, CodeContests; math AIME24/25, OlympiadBench. Six-benchmark average Qwen3-8B: single agent 27.16, AFlow 24.10, ADAS 20.35, MaAS 32.22, MetaAgent-X (RL, needs weights) 38.33. This is an independent small-model data point where search methods ADAS/AFlow were below the single agent. Search cost not reported. RL needs weights, so not usable by an API-only harness. https://arxiv.org/html/2605.14212

### 7. What still could not be confirmed
- DCAS figures (PDF undecodable, html 404): frontier-planner gain and Sonnet vs Opus claim unverified and contradictory.
- GEPA appendix on reflection model choice; TextGrad, PromptAgent, GREATER, PromptTailor not opened.
- The three 2026 role-assignment papers (Bias-Aware Orchestration, MetaGen, MARS) were not opened.
- Remaining text beyond 100k chars in several papers; Archon/ADAS/SICA full results; any SWE-bench-class test of per-role frontier model assignment.

### Updated closing lists

(1) Strongest evidence for an API-only coding harness
1. Strong manager/planner with a cheaper worker, with a gating check: ManagerWorker (+2 points over strong alone on SWE-bench Lite, about 90% of tokens moved to cheap model; within noise) and Cursor (vendor, one task). Same-model weak planner failed (42%).
2. Greedy per-role model search by end-to-end measurement (LLMSelector, +6 LiveCodeBench; also Archon-style budgeted search). Small samples, 2024 models.
3. Run-time tool creation (Live-SWE-agent; +3 to +5 on Verified for four strong models; negative for the two smallest GPT-5 models on 50 tasks).
4. Strong-proposer harness search read from traces (Meta-Harness; tuned on same tasks for TerminalBench; held-out gain on math +4.7).
5. Plan step with self-generated plan as a cheap lever (DCAS secondary figures: 42.8 -> 48.2 on a 30B executor); needs primary-source confirmation.
6. Use CoT-SC-style resampling as the control that every topology change must beat.

(2) Did not survive replication, held-out evaluation or stronger models
- ADAS, AFlow, MaAS, MAS-Zero, DyLAN: audit (Salesforce, 2606.13003) and MetaAgent-X both found them at or below single-agent/CoT-SC; AFlow workflows collapse to repeated sampling.
- Model-specific harnesses per model: SWE-Serve found no gain (53 tasks).
- GEPA prompt transfer across model families: failed to Sonnet 4.6 and GLM 5 in one 2026 study (small), worked in GEPA's own paper; and "stronger optimiser = better prompt" was not supported by OPRO (GPT-4 optimiser gave lower accuracy than PaLM 2-L-IT).
- Prompt optimisation inside multi-agent/coding setups: MAS-PromptBench found SWE-Bench Verified -2.0 on average and up to -16 points in some configurations.
- HGM/DGM cross-model gains collapse to parity with the best human scaffold when evaluated on GPT-5 / held-out Lite.

(3) Open questions
- Does planner/worker/judge assignment of current frontier models beat the best single model on SWE-bench-class tasks at equal cost, with repeats?
- Does a stronger reflection model help? No controlled ablation found (GEPA appendix not confirmed).
- Is a frontier plan worth about +15 points for a small executor (DCAS) or only +6 (open-weight planner)? Primary text needed.
- Are CodeJudgeBench rankings (Gemini-2.5-Pro first, Sonnet above Opus) still true for late-2026 models, and do they predict reviewer usefulness inside an agent loop?
- Any automatic per-model choice of tool set / planning on-off: still no verified method.
