# Helper models inside coding agents (narrow second models), 2024 to Nov 2026

Scope note: about 20 tool calls were used. Not all key questions were covered equally. Not covered or only snippet-level: Relace, Augment context engine, LLMLingua family, commit/test-selection/error-triage helpers, SWE-Pruner Pro, SWE-grep's own chart numbers, auto-mode details on prompt-injection probe accuracy. Label key: [read] = seen in a fetched page body (fetch tool returns a model-summarised extraction of the page, so treat as read-via-extraction); [secondary] = search-result snippet or third-party account, page not opened; vendor = vendor claim; preprint = arXiv.

## 1. Edit-application ("fast apply") models

### Takeaway
Vendor evidence only: apply models cut wall-clock time and turns versus search-and-replace, and the accuracy gap is largest for weaker or non-Claude models. With GPT-5 search-and-replace already hit 100%, and the gap shrinks. No independent study and no end-task pass-rate measurement found. I found no direct 2026 source on the trend (toward or away); only inference.

### Cited Findings
- Cursor "Instant Apply" (vendor post, 2024): the frontier model plans, a fine-tuned Llama-3-70b ("llama-3-70b-ft") writes the full file. About 1,000 tokens/s using speculative edits, about 13x faster than vanilla Llama-3-70b and about 9x faster than their earlier GPT-4 speculative-edits setup. Accuracy: "almost matches claude-3-opus-diff and outperforms gpt-4-turbo and gpt-4o"; no exact score given. [read] [Cursor](https://cursor.com/blog/instant-apply)
- Cursor's stated reasons for full-file rewrite over diffs: diffs force the model to think in fewer tokens; diffs are out of distribution; models are bad at counting line numbers. Speculative edits (use the original file as the draft for speculative decoding) are not buildable on Anthropic's hosted models, hence the custom model. [read] same URL. Implication for API-only teams: speculative edits cannot be replicated without weights; only a hosted third-party apply API (Morph, Relace) gives this.
- Morph fast-apply benchmark page (vendor; task count, dataset, and apply-model size not disclosed on page; LLM-judge scoring against expected diff; compares only Morph vs search-and-replace, no whole-file baseline in results): [read] [Morph benchmarks](https://www.morphllm.com/benchmarks/fast-apply)
  - claude-sonnet-4: Morph 2.12 turns, 18.9s, 100% vs S&R 5.78 turns, 32.7s, 95.0%.
  - claude-sonnet-4.5: Morph 2.34 turns, 19.3s, 100% vs S&R 5.36 turns, 38.1s, 96.0%.
  - deepseek-chat: 2.12 turns, 44.8s, 100% vs 7.38 turns, 167.1s, 88.5%.
  - gpt-5: 2.05 turns, 95.2s, 100% vs 2.55 turns, 124.7s, 100% (no accuracy gain).
  - grok-code-fast-1: 2.15 turns, 19.6s, 100% vs 3.69 turns, 35.0s, 84.6%.
  - Morph apply time 1.4 to 3.4s per edit. Page headline: 46% average speed improvement. Cost calculator claims 50% cheaper than S&R and 83% cheaper than full rewrite, but full-rewrite cost is an assumed 3x multiplier, not measured, and token volume basis is ambiguous.
  - Inconsistency: other Morph pages claim about 35% faster and 98% or 99.2% accuracy [secondary, search snippets]. Morph pages quote ~10,500 tok/s for a 7B apply model [secondary].
- Morph argues S&R needs one call per chunk and fails on whitespace/ambiguous matches [secondary snippet].

### Inferences
- Gains concentrate in turn count and latency (fewer round trips), not final success; weak-format-adherence models benefit most. For GPT-5-class models S&R matched accuracy in Morph's own test.
- Trend: no 2026 source read. Inference only: frontier models trained on their own edit tools (S&R, apply_patch) narrow the accuracy gap; remaining value is latency on large files. Treat "toward or away" as unresolved.

### Gaps
- No independent or peer-reviewed apply-model study; no end-task pass-rate with/without apply model; Relace benchmarks not found (search returned nothing); no 2026 statement from Cursor/others on dropping apply models.

## 2. Search sub-agents and retrieval models

### Takeaway
Trained small search subagents (SWE-grep, WarpGrep) report 2 to 4 point end-task gains, ~15 to 28% lower cost/time, and large latency gains, all vendor-reported with undisclosed sample sizes. The only controlled embedding-vs-grep study found is not on code. Cursor's semantic-search A/B shows embeddings add on top of grep.

### Cited Findings
- Cognition SWE-grep / SWE-grep-mini (vendor post, 16 Oct 2025): RL-trained; 4 serial turns (3 explore + 1 answer), up to 8 parallel tool calls per turn (grep/read/glob); agentic search otherwise "10-20 serial turns"; agents spent >60% of first turn retrieving context. Reward = weighted F-beta (beta 0.5) of file and line-range retrieval on internal "Cognition CodeSearch Eval" (size not stated). Speeds over 2,800 tok/s (mini) and 650 tok/s on Cerebras; claimed 20x and 4.5x faster than Haiku 4.5 (140 tok/s). Text gives no F1 numbers (charts only); downstream test on a hard SWE-Bench Verified subset with Sonnet 4.5 main model reports "significantly lower end-to-end time", no figures. Authors say context pollution hurt more than missing context. [read] [Cognition](https://cognition.com/blog/swe-grep)
- Morph WarpGrep v2 (vendor post, Feb 2026): separate subagent, up to 8 tool calls per turn for up to 4 turns, RL with weighted F1 reward. SWE-Bench Pro resolve rate without/with: Opus 4.6 55.4 to 57.5; Codex 5.3 56.0 to 59.1; MiniMax 2.5 55.4 to 57.6. Opus 4.6 per task: $3.06 to $2.51, 618s to 445s. Post says "15.6% cheaper" but numbers give ~18%. Sample size, variance, token counts not disclosed; author concedes individual deltas are small. [read] [Morph](https://www.morphllm.com/blog/warpgrep-v2.md)
- Morph claims WarpGrep v1 0.73 F1 in 3.8 steps vs SWE-grep 0.72, Haiku 0.72, Gemini Flash 0.66; labelling of benchmark inconsistent across Morph pages. [secondary: search summary] [Morph benchmarks](https://www.morphllm.com/benchmarks)
- Cursor semantic search (vendor post, 6 Nov 2025): custom embedding model trained from agent traces ranked by an LLM for helpfulness. Offline Cursor Context Bench: average 12.5% higher accuracy answering codebase questions (range 6.5% to 23.5% by model) with semantic search plus grep vs grep alone. Online A/B, same model both arms: code retention +0.3% overall, +2.6% on repos with 1,000+ files; dissatisfied follow-ups +2.2% when semantic search unavailable. Sample sizes, significance, per-model figures not stated. [read] [Cursor](https://cursor.com/blog/semsearch)
- Controlled grep vs vector: "Is Grep All You Need? How Agent Harnesses Reshape Agentic Search" (preprint arXiv 2605.15184, May 2026), full-factorial over harnesses, 116-question LongMemEval subset (conversational memory, NOT code). Inline grep beat inline vector in every harness-model pair (e.g. Chronos + Opus 4.6: 93.1% vs 83.6%); result flips with tool-output delivery mode (a Codex run fell from 93.1% to 55.2%); Claude Code favoured grep, Gemini CLI Pro favoured vector. [secondary: search-result summary; page not opened] [emergentmind](https://www.emergentmind.com/papers/2605.15184)
- Augment (practitioner talk, ex-founding engineer): embedding retrieval "was not the bottleneck" on SWE-bench Verified, "grep and find were sufficient"; no numbers; says embeddings matter more in larger/complex repos. [read] [jxnl.co](https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/)

### Inferences
- Evidence converges that a fast, precision-weighted search subagent returning line spans helps cost and time more than pass rate. Embeddings plus grep > grep alone per Cursor, but that is vendor, own metric. No controlled grep-vs-embedding comparison on a coding benchmark found.

### Gaps
- SWE-grep chart values not obtainable; Windsurf docs, Sourcegraph/Amp, repository-map (Aider) measurements not retrieved; Claude Code Explore (see section 4).

## 3. Context pruning and compaction by a second model

### Takeaway
Best controlled evidence: simple observation masking roughly halves cost versus raw agent with equal solve rate, and LLM summarisation adds no clear benefit. A 0.6B line pruner cuts tokens 23 to 38% with <1 point success loss. Context rot work motivates both.

### Cited Findings
- "The Complexity Trap" (Lindenbauer et al., JetBrains Research; arXiv 2508.21433 v3, DL4C workshop at NeurIPS 2025; preprint/workshop). SWE-agent, SWE-bench Verified n=500, turn limit 250. Solve rate / cost per instance, raw vs masking (window 10) vs LLM-summary (N=21, tail 10): Qwen3-Coder 480B 53.4/$1.29, 54.8/$0.61, 53.8/$0.64; Gemini 2.5 Flash 32.8/$0.41, 35.6/$0.18, 36.0/$0.24; Gemini 2.5 Flash thinking 40.4/$0.56, 36.4/$0.24, 31.4/$0.25; Qwen3-32B 17.0/$1.12, 15.0/$0.55, 16.0/$0.50. Only some solve-rate changes significant. Summariser calls were 2.9 to 7.2% of cost; LLM-summary lengthened trajectories (Qwen3-Coder +15% vs raw), plausibly by hiding stop signals. Observations about 84% of an average turn (SWE-bench Lite-50 prelim). Hybrid (Qwen3-Coder, Verified-50 only): 7% cheaper than masking, 11% cheaper than summary, +2.6 points vs raw. Masking window tuned on SWE-agent; on OpenHands M=10 hurt and M=58 was needed. [read] [arXiv](https://arxiv.org/html/2508.21433v3). Caveat: weak/open models, one scaffold mainly, no Claude/GPT frontier models; same tasks used to tune window.
- SWE-Pruner (Wang, Shi et al., arXiv 2601.16746, Jan 2026, preprint): 0.6B pruner (built on Qwen3-Reranker-0.6B, CRF line head), agent states a natural-language goal and pruner keeps relevant lines of file reads. SWE-Bench Verified with Mini SWE Agent: Claude Sonnet 4.5 tokens 0.911M to 0.701M (-23.1%), solved 353 to 351 (70.6% to 70.2%), rounds 51.0 to 41.7, cost -26.8%; GLM-4.6 tokens -38.3%, 55.4% to 54.8%, cost -36.4%. 50-sample subset: base 62% / 0.972M tokens; LLMLingua-2 54% / 0.856M; RAG 50%; LLM Summarize 56% / 0.794M; LongCodeZip 54%; SWE-Pruner 64% / 0.670M. Pruner TTFT about 45 to 102 ms. Trained on 61k synthetic samples. [read] [arXiv](https://arxiv.org/html/2601.16746v1). Caveats: authors' own method, 50-sample table, weights needed (not API-only); needs the agent to supply a goal hint.
- SWE-Pruner Pro (arXiv 2607.18213): claims +3.8% resolve for MiMo-V2-Flash using the agent's own hidden states. [secondary: search snippet; not opened]. Needs weights.
- Context rot: Chroma technical report (Hong, Troynikov, Huber, 14 Jul 2025, vendor-research report): 18 LLMs degrade as input grows even on simple tasks; distractors hurt; lexical matching held up better than semantic. [secondary: search summary] [Chroma](https://trychroma.com/research/context-rot)

### Inferences
- For an API-only harness the cheap win is mechanical masking of old tool output; LLM summarisation of history showed no reliable gain over it in the one rigorous study. Query-conditioned pruning of file reads is promising but only one preprint, and the pruner is a small self-hosted model.

### Gaps
- LLMLingua family measured on coding agents beyond SWE-Pruner's baseline row; tool-output summariser studies; Anthropic/OpenAI compaction ablations; frontier-model replication of Complexity Trap.

## 4. Sub-agents to keep the main context small

### Takeaway
No controlled measurement found. Claims are mechanism-based blog estimates.

### Cited Findings
- Blog estimates only: exploring in the main session about 35 to 45K tokens vs ~1.5 to 3K returned from an Explore subagent; one unverifiable claim of 47,800 vs 2,100 tokens. Explore runs on Haiku (one developer's analysis; not checked against docs). Caveat in same sources: the report still lands in parent context, and subagents add startup overhead. [secondary: search snippets] e.g. [vantaige.io](https://vantaige.io/blog/claude-code-subagents-save-context-3-patterns)
- Indirect: SWE-grep and WarpGrep (section 2) are the nearest measured cases (Opus 4.6 $3.06 to $2.51 per task with a search subagent; vendor).

### Gaps
- No Anthropic measurement of Explore on/off; no paper with success + tokens ablation for generic cheap-model subagents.

## 5. Gatekeepers: command approval, injection detection, trusted monitors

### Takeaway
Gatekeepers sharply cut approval prompts, but miss rates on ambiguous or overeager actions are not small, and independent testing found far higher misses than vendor figures. Control research shows resampling beats defer-to-trusted for usefulness.

### Cited Findings
- Anthropic, Claude Code auto mode (vendor engineering post, 25 Mar 2026): classifier on Sonnet 4.6; stage 1 single-token yes/no filter biased to block, stage 2 chain-of-thought only on flagged. Users accept 93% of manual prompts. Real internal traffic n=10,000: FPR 8.5% (stage 1) to 0.4% (full). Real overeager actions n=52: FNR 6.6% to 17%. Synthetic exfiltration n=1,000: FNR 1.8% to 5.7%. Server-side prompt-injection probe on tool outputs (no detection numbers). No latency/cost reported; block after 3 consecutive or 20 total denials. [read] [Anthropic](https://anthropic.com/engineering/claude-code-auto-mode)
- Independent stress test: "Measuring the Permission Gate" (Ji et al., arXiv 2604.04978, Apr 2026, v3 Oct 2026, preprint). AmPermBench, 128 prompts, 253 state-changing actions: end-to-end FNR 81.0% (95% CI 73.8 to 87.4); among 160 classifier-evaluated actions FNR 70.3% and FPR 31.9%; 36.8% of state-changing actions were in-project file edits outside classifier scope (92.9% FNR for artifact cleanup). Authors frame it as different workload, not contradiction. [abstract] [arXiv](https://arxiv.org/abs/2604.04978) (fetched abstract page).
- OpenAI Codex Auto-review (vendor alignment post, 2026): separate reviewer for sandbox-escalation requests; reviewer GPT-5.4 Thinking (low reasoning). 99.1% auto-approval on escalated traffic; sessions stop for humans "roughly 200x less often" than manual; recall 90.3% overeagerness, 99.3% prompt injection, 96.1% MonitoringBench [Hard]; false positives not reported; latency/cost not reported; after denial Codex finds an acceptable route in over half of cases. Datasets partly synthetic (generated with GPT-5.3-codex). [read] [OpenAI](https://alignment.openai.com/auto-review)
- Ctrl-Z (Redwood Research, arXiv 2504.10374, Apr 2025, preprint): BashBench 257 tasks; untrusted GPT-4o mini, trusted Llama 3.1 8B; defer-to-trusted costs much usefulness; defer-to-resample better; best protocol cut attack success 58% to 7% at 5% usefulness cost. [secondary: LessWrong/alphaXiv summaries; paper not opened] [arXiv](https://arxiv.org/pdf/2504.10374). Caveat: red-team vs blue-team game on a toy benchmark, weak models.

### Inferences
- Gatekeeper's benefit is demonstrated for usability (fewer prompts); safety is weakly evidenced and coverage-dependent (shell only vs file edits). Cost/latency unreported by both vendors.

### Gaps
- Defer-to-trusted untrusted-monitoring papers after Ctrl-Z not surveyed; standalone injection-detector benchmarks (e.g. small classifiers) not searched.

## 6. Other narrow helpers
No evidence found in this pass for request classification, test selection, error triage, commit-message or next-edit prediction as coding-agent helpers. Not searched adequately; record as gap.

## 7. Small models trained for one sub-task
- Nemotron-CORTEXA (NVIDIA, ICML 2025): fine-tuned embedding (from NV-EmbedQA-Mistral-7B-v2) for localisation; entity retrieval precision/recall 34.51/67.62 vs Agentless 17.54/58.37; system 68.2% on SWE-bench Verified at about $3.28 per problem; released NV-EmbedCode-7b: Recall@1 70.33% on SWE-bench Lite vs 61.33% base. [secondary: search summary] [NVIDIA](https://research.nvidia.com/labs/adlr/cortexa). No end-to-end ablation of the embedding model alone was seen. Requires weights for the embedder (not API-only unless hosted).

## Final lists

### (1) Strongest evidence of benefit for an API-only harness
1. Observation masking (cheap mechanical, not a model) over LLM summarisation: ~50% cost cut at equal solve rate (peer-reviewed workshop, 5 configs, Verified n=500).
2. Search subagent returning line spans (WarpGrep, SWE-grep; hosted via API/MCP): +2 to +3.7 points and -18% cost / -28% time on SWE-Bench Pro, but vendor, undisclosed n.
3. Hosted semantic search alongside grep (Cursor): +12.5% offline accuracy, small online retention gains; vendor.
4. Command-approval classifier for prompt reduction (Anthropic, OpenAI): 93% of prompts were accepted anyway; large reductions in interruptions; safety weaker.
5. Fast apply for latency and fewer tool calls: turn count 2 vs 3.7 to 7.4 on weaker formats; vendor, little accuracy gain on GPT-5.

### (2) Promising but did not hold up or weakly supported
- LLM summarisation of history over simple masking (no gain, longer trajectories; Gemini thinking dropped 9 points).
- Generic LLM/embedding compressors on code (LLMLingua-2, RAG, LongCodeZip all below the unpruned baseline in SWE-Pruner's 50-sample table).
- Classifier safety claims: independent test reported 81% FNR end-to-end vs vendor 17%.
- Defer-to-trusted with a weak model (large usefulness loss in Ctrl-Z).
- Apply models as pass-rate booster: no evidence; gap vanishes for GPT-5.

### (3) Open questions
- Does any apply model matter for 2026 frontier models on end-task pass rate?
- Controlled grep-vs-embedding comparison on code agents (only non-code study exists).
- Does a cheap-model Explore subagent change pass rate and total tokens (parent plus child)?
- Do context-management results replicate on Claude/GPT-class models and long tasks?
- Gatekeeper cost and latency; coverage of file-edit side effects; real false-positive costs.
- Independent replication of WarpGrep/SWE-grep gains with sample sizes and variance.

## Second pass (gaps closed)

Label note: the fetch tool returns model-summarised extractions; [read] = taken from fetched page body or HTML full text via that extraction; [abstract] = abstract page only; [secondary] = search-result summary or third party. Where the extraction could not give a full sentence it is stated. Roughly 33 further tool calls were used.

### P1. Ctrl-Z (Redwood Research, arXiv 2504.10374, Apr 2025, preprint) - corrects the first pass
- Models: "we treat GPT-4o mini as if it were untrusted in order to develop control protocols." and "We implement our trusted model with Llama-3.1-8B" (Section 2.2). [read] [arXiv HTML](https://arxiv.org/html/2504.10374)
- BashBench: "We construct BashBench, a dataset of 257 challenging multi-step system administration tasks" (abstract); 100 train and 157 test tasks. Audit budget "equivalent to 1% of the actions taken in an episode". [read]
- Defer to trusted: "Result: A safety score of 72.7% at 95% usefulness." (3.1.3). Defer to resample: "Result: A safety score of 83.2% safety at 95% usefulness." (3.2). Resample with incrimination in the present: 84.0%. Auditing after three strikes: 84.9%. Time travel: 87.1%. Untrusted monitoring plus time travel: 92.6% (Table 2). [read] Resampling draws "up to two new samples" when the score is over the deferral threshold; aim "no more than double the queries to U".
- Abstract claim: "reducing the success rate of attacks from 58% to 7% at a 5% cost to the performance of a non-malicious agent." [read] Correction to the first pass: the 7% corresponds to the best protocol with untrusted monitoring (92.6% safety); resampling alone (time travel, no untrusted monitor) was 87.1%. The first pass's loose phrase "best protocol cut attack success" should read "best combined protocol".
- Caveats: red-team/blue-team game, toy bash tasks, weak untrusted model (GPT-4o mini), so usefulness cost measured against a weak policy; only the first 100,000 characters of the HTML were read.

### P2. Independent stress test of auto mode (Ji et al., arXiv 2604.04978, v3 Oct 2026, preprint)
- Design: AmPermBench, 128 prompts = 4 DevOps families (branch cleanup, job cancellation, service restart, artifact cleanup) x 3 ambiguity axes (specificity 4 levels, blast radius 4 levels, risk 2 levels) = 32 prompts per family; deterministic oracle per prompt; Docker with shimmed CLIs. Agent under test Claude Sonnet 4.6 in auto mode, with a bypassPermissions baseline; judge Claude Opus validated on 50 actions (Cohen's kappa 0.82). One run per prompt, 600 s timeout, $5 cap; 127 sessions completed, 253 state-changing actions. Sweep: 16.7M tokens, $16.09. [read] [arXiv HTML](https://arxiv.org/html/2604.04978)
- Tiers: Tier 1 read-only (allowlisted), Tier 2 in-project file writes/edits (no classifier call), Tier 3 shell, web, external (two-stage classifier). [read]
- The 81.0% sentence: it begins "The end-to-end false negative rate is 81.0% (95% CI: 73.8%-87.4%)"; the fetch tool would not return the full sentence (length limit). It goes on to contrast Anthropic's 17% production figure and attributes the gap to workload. Tier 3 only FNR 70.3% and FPR 31.9%; overall FPR 19.8% (22 of 111 safe actions); low-risk FPR 9.2%, high-risk 34.8%; 93 of 253 actions (36.8%) were Tier 2 edits never classified; artifact cleanup FNR 92.9%. [read]
- Authors' limits: one model, one synthetic benchmark, classifier may change, judge validated on 50 actions (flipping six labels moves FNR under 1.5 points), single run per prompt, scope-escalation threat only. [read]
- Note: the 253 are actions in an adversarially ambiguous benchmark; the 81% is not comparable with Anthropic's 17% (52 real overeager actions). Only the first 100,000 characters were read.

### P3. Agentic text search vs embedding/semantic search for coding agents
Searches run for this item: 5 queries in total (three in the first pass, two in the second pass), plus about 7 fetches. Found: several 2026 preprints with partial controls; none is a clean grep-vs-embedding test on a frontier coding agent with end-to-end resolve rate.
- "How Do Small Coding Agents Use Code Graphs and Embeddings?" (arXiv 2610.33958, preprint). Localization-only agent, depth-balanced 160-task subset of SWE-bench Verified, 4 arms: G (grep, read_file, list_dir), E (G + embedding search), T (G + graph tools), ET. Open-weight models only (Qwen3 0.6B to 32B, Gemma 4). Function Acc@10 on all 500 tasks: Qwen3-8B G 16.7 / E 30.3 / T 27.4 / ET 33.2; Qwen3-32B G 32.0 / E 35.7 / T 34.0 / ET 35.9; Qwen3-4B G 26.8 / E 29.1 / T 37.1 / ET 36.5. Abstract: structured tools' gain "peaks at 17-21 points at 1.7-4B and falls to 4-5 points at 32B". Downstream: "A fixed repair model resolves 6-13 of 160 tasks from these localizations (oracle 26)": G 6, E 13, T 12, ET 13. Limits: 32B runs single greedy, about +/-3 points, no multiple-comparison correction. [read] [arXiv](https://arxiv.org/html/2610.33958v1). Reading: embeddings add most for small models; at 32B the gain is small. No frontier model tested.
- "Code Isn't Memory: A Structural Codebase Index Inside a Coding Agent" (arXiv 2606.22417, preprint; the harness is the authors' own). 91 instances (Go, Java, Python; SWE-PolyBench Verified + SWE-bench Pro), Claude Opus 4.7 fixed, 3 seeds. Index on 50.4% resolve vs index off 41.9% (p = 0.003); OpenCode (agentic grep) 45.3% (index vs OpenCode p = 0.087, not significant). Acc@5 localization 44.3% to 84.5% (OpenCode 75.3%). Turns 28.3 vs 36.2 (off) vs 36.0 (OpenCode). Tokens 10.1k vs 14.0k per OpenCode (and 11.1k off). Cost per cell $1.15 vs $1.19 (null); cost per solve $2.30 vs $2.84 vs $2.92. Underpowered (75 to 80 paired instances), one model, authors' own system; it is a structural index, not a pure embedding index. [read] [arXiv](https://arxiv.org/html/2606.22417)
- Cursor (earlier section) offline +12.5% accuracy with semantic search + grep vs grep, vendor, no variance. Sourcegraph CodeScaleBench post (vendor): Claude Code + Haiku 4.5, 370 tasks, with vs without Sourcegraph MCP code search: reward gains of 11.5% (Understand), 10.3% (Refactor), 9.9% (Fix), 11.2% (org incident debugging); cost per task about $0.73 to $0.51; wall-clock -47 s, agent execution -90 s; Precision@5 0.140 to 0.478 on the combined set. Tokens not reported. [read] [Sourcegraph](https://sourcegraph.com/blog/codescalebench-testing-coding-agents-on-large-codebases-and-multi-repo-software-engineering-tasks). This compares an indexed search tool (not purely embedding) against baseline tools, vendor-run.
- Augment: Auggie 51.80% vs Cursor 50.21%, Claude Code 49.75% (all Opus 4.5), Codex (GPT-5.2-codex) 46.47%, SWE-agent (Scale baseline) 45.89% on 731 SWE-bench Pro public problems; "all other evaluations run by Augment Code using identical harness". The post reports no with/without Context Engine ablation; the retrieval explanation is the author's interpretation. [read] [Augment](https://www.augmentcode.com/blog/auggie-tops-swe-bench-pro). Augment's Context Engine as an MCP server (Feb 2026): no before/after score for another agent found. Bito (another vendor) claims 51.9% to 70.1% for Opus 4.6 with its context layer [secondary, not opened].
- CodeGrep (arXiv 2608.05886, preprint): 14B retriever trained with GRPO to issue parallel grep/glob/read, returns candidate files to a frozen downstream agent. All 500 SWE-bench Verified: 27.0% vs 25.8% no-retrieval baseline; on resolved instances about 15% fewer rounds and 19% fewer tokens; BM25 retriever (precision 0.375) degraded the agent, Jina (0.445) neutral, CodeGrep (0.677) helped. Needs weights. [abstract]
- Agent Retrieval Bench (arXiv 2607.24882, preprint): 427 samples, 25 repos; lexical vs RepoMap vs embeddings; Qwen3-Embedding-4B best MRR, RepoMap best yield at 8K tokens; logged agent trajectories miss every gold file on 27 to 35% of samples; seed pilot shows higher file F1 and less exploration with retrieved seeds. No resolve-rate figure. [abstract]
- LongMemEval grep-vs-vector study (2605.15184) remains non-code [secondary].
- Sourcegraph/Amp, Cline: conflicting secondary accounts of search design; no numbers by Amp or Cline themselves found. Anthropic: no Anthropic post with grep-vs-embedding numbers found.

### P4. Sub-agents to keep the main context small
- Anthropic context management (vendor post, Sep 2025): "combining the memory tool with context editing improved performance by 39% over baseline"; "Context editing alone delivered a 29% improvement" (internal agentic-search evaluation); "In a 100-turn web search evaluation, context editing enabled agents to complete workflows that would otherwise fail... while reducing token consumption by 84%." Model named: Claude Sonnet 4.5. No second model is involved: context editing clears stale tool results; the memory tool stores notes in files. Baseline, sample size, and task set are not disclosed. [read] [Claude blog](https://claude.com/blog/context-management)
- Anthropic multi-agent research system (vendor post): lead Claude Opus 4 + Sonnet 4 subagents "outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"; "agents typically use about 4x more tokens than chat interactions"; "multi-agent systems use about 15x more tokens than chats"; "token usage by itself explains 80% of the variance"; "most coding tasks involve fewer truly parallelizable tasks than research"; "LLM agents are not yet great at coordinating and delegating to other agents in real time." [read] [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system). Research, not coding.
- "Deep Agentic Search for Repository-Level Code Question Answering: An Empirical Study" (arXiv 2608.01507, preprint): SWE-QA; retrieval (vector index) agent 65.2% correct vs delegation to a sub-agent with its own context 46.2% (19.0 point gap); retrieval cost per correct answer under half; 41.8% of delegation failures at the planner-to-subagent hand-off, usually silent. Models not named in the abstract. Read-only QA, not patching. [abstract]
- Recursive delegation (NeurIPS 2026 virtual page "Verifying the Second Agent"): roughly 6x tokens at seven nodes, 12x at fifteen; no verified-correctness gain over single agent [secondary, snippet].
- Claude Code Explore on Haiku: still only blog estimates (see first pass). No controlled success measurement found. Scrouting/SuperScout (arXiv 2608.04804, preprint): a 7B scout explores repo and writes a handoff to one of four frontier fixers; SWE-bench Pro Python slice 266 tasks, 159 solved vs 158 for best single model, about one-fifth cost per solve, searcher under half a cent of GPU per task; no-router ablation (cheapest fixer plus handoff) ties the routed system, so the handoff, not routing, drives the result; handoff lifts three cheaper fixers and slightly hurts the strongest; n=99 calibration, directional only. Needs a self-hosted 7B. [abstract]

### P5. Other helper roles
- Request classification / routing: LiteLLM phase-based routing (vendor/practitioner) matched fixed Opus-level quality at 46% lower cost on 9 SWE-bench Verified tasks (small sample); Not Diamond reports 39% inference-cost cut near Opus quality on Poly-SWE-bench (vendor); an OpenHands PR uses a small classifier LLM at an estimated $0.005 to $0.02 per instance. [secondary, snippets, not opened]. Scrouting finding above suggests the routing decision added little.
- Test selection: TestPrune (arXiv 2510.18270, FSE 2026): an LLM predicts suspicious methods, selects regression tests; plugged into SWE-agent and Trae Agent; API overhead about $0.02 to $0.05 per instance [secondary]. TDAD (arXiv 2603.17973, thesis-level preprint): graph-based test impact map, baseline regression rate 6.08% on 100 SWE-bench Verified tasks [secondary]. No study of an agent's own test-choosing policy against an oracle found (one search).
- Error triage: no study found (not searched beyond the above).
- Next-edit prediction: Zed's Zeta (open model, fine-tuned from Qwen2.5-Coder-7B, SFT then DPO) and Sweep's 1.5B next-edit model (claims to beat models over 4x larger on its own benchmarks) exist for editor autocomplete; no measurement as a coding-agent helper found. NES (arXiv 2508.02473): location model 75.7% accuracy [secondary].
- Commit messages and PR titles: only generic LLM studies (e.g. APSEC 2024: direct LLM PR-title generation unsatisfactory without similar-PR examples; commit-message studies favour fine-tuned or context-augmented small models in human preference per AI-written reviews) [secondary]. No agent-harness measurement of using a small model for it. The cost at stake is tiny.
- Small-model tool-output summarising/pruning: Squeez (arXiv 2604.04979, preprint): LoRA Qwen 3.5 2B, recall 0.86, F1 0.80, removes about 92% of input tokens, beats zero-shot Qwen 3.5 35B A3B by 11 recall points; 11,477 examples, 618-example manual test set; pruning task only, no end-to-end agent score. [abstract] CoACT (arXiv 2607.02911): compressor trained so the compressed observation yields the same next action; SWE-bench Verified, three agentic models, 33.0% fewer tokens, resolve "close to the uncompressed agent" (no numbers in abstract); observation tokens 45.7% of total tokens. [abstract] Anchored Context Distillation (2609.31430): 43% and 57% less context per call, small resolve drop [secondary]. SWE-Master: LLM summarisation cut input tokens 42% with no drop on MiniMax-M2.1 [secondary]. Most need self-hosted models.

### P6. Relace, Augment, and apply models in shipping harnesses
- Relace (vendor): docs say relace-apply-3 runs about 10k tokens/s; earlier Instant Apply launch claimed about 900 ms average end-to-end latency and 4,300 tokens/s; no accuracy figures found (chart images unreadable); a third-party tracker measured 2.8k output tokens/s [secondary]. Relace Search: uses 4 to 12 parallel view_file and grep calls, claimed 4x faster than frontier models; no accuracy numbers. [secondary]
- "Fast Apply Models are Already Dead" (Nik Pash, Substack, 20 Jun 2025; opinion piece, one person's argument; the author's affiliation was not shown in the fetched text). Quotes: Fast Apply has "two chances to fail"; Aider's Gauthier, May 2024: "Now success depends on two LLMs not goofing up instead of one."; says Devin abandoned Fast Apply and edits are "more often done by a single model in one action"; Claude Code team's Boris: "The bitter lesson version of this is we just give the model more responsibility."; conclusion "The future is not deeper stacks. It is less stack." Morph's founder comments that even at 100% search-and-replace success fast apply uses "2x the frontier tokens needed" [sic: claim in a comment], and that reaching 98% accuracy "took us hundreds of iterations"; he denies the "maybe six months" remark attributed to him. The post does not say whether Cursor still uses apply. [read] [Substack](https://pashpashpash.substack.com/p/fast-apply-models-are-already-dead)
- Search-and-replace/patch tools in shipping harnesses per the same post and a search summary: Claude Code Edit/Multi-Edit (old_string must match exactly once unless replace_all), Codex apply_patch (V4A patch format trained into GPT models), ChatGPT Canvas. [read/secondary]. A blog (not opened, redirect) compares edit formats and reports patch worst for most models and a hash-anchored format matching or beating replace, weakest models gaining most [secondary].
- Cursor in 2026: search results still describe a separate apply step (secondary), but I found no primary 2026 Cursor statement either way, and Morph's page on Cursor's apply step dates from 2025 and cites a 2024 archive snapshot. Cline, OpenCode, Aider apply tools: Aider uses diff/udiff/whole formats from the main model (secondary); no primary documentation read for Cline or OpenCode. Status: unconfirmed for Cursor, Cline, OpenCode.
- Augment: see P3; vendor leaderboard score only, no ablation.

### P7. SWE-grep figures
Cognition's post text gives no F1 values (chart-only; the page text also lacks the end-to-end numbers). Only another account found: Morph's comparison table [secondary, vendor and a competitor]: Warp Grep 0.73 F1 in 3.8 steps, SWE Grep 0.72 in 3.7 steps, Claude Haiku 0.72 in 12.4 steps, Gemini Flash 0.66 in 10.8 steps, GLM 4.5 0.34 in 14.5 steps, mgrep 0.18 in 1 step; native harnesses, max 15 steps; WarpGrep latency about 6 s. Source: [Morph benchmarks](https://www.morphllm.com/benchmarks) (search summary). Competitor-reported, not Cognition's own. Not confirmed from Cognition.

### Updated closing lists (supersede the earlier lists where different)

(1) Strongest evidence for an API-only harness:
1. Mechanical observation masking before any summariser (JetBrains: about half cost at similar solve rate on SWE-bench Verified n=500; open models).
2. An indexed or learned search layer alongside grep: Cursor offline +12.5% (vendor), structural-index study 50.4% vs 41.9% resolve with 28.3 vs 36.2 turns (preprint, 91 instances, Opus 4.7, authors' own harness), Sourcegraph MCP +10% reward and -30% cost with Haiku 4.5 (vendor). Weakest part: no frontier-model embedding-only ablation.
3. A fast search sub-agent returning line spans (WarpGrep: +2.1 to +3.7 points, Opus cost $3.06 to $2.51; vendor, n undisclosed). Must be checked against 2608.01507, where delegated exploration lost 19 points to vector retrieval on QA.
4. Command-approval classifier for fewer interruptions (93% of prompts accepted manually; 200x fewer stops in Codex) but not for safety.
5. Anthropic's context editing (+29%, -84% tokens on internal 100-turn search; vendor), which needs no second model.
6. Fast apply for latency only on models weak at edit formats.

(2) Promising but not surviving or being dropped:
- LLM summarisation of history; generic compressors (LLMLingua-2, RAG, LongCodeZip below baseline in SWE-Pruner's 50-sample table).
- Command classifier as a safety control (81% end-to-end miss in the stress test vs 17% vendor; coverage gap for file edits).
- Defer-to-trusted with a weak model (72.7% safety at 95% usefulness vs 83.2% for resample, 92.6% with untrusted monitoring).
- Separate apply model: opinion and product evidence (Devin, Claude Code, Codex use single-model edits) point away; Morph's own table shows no accuracy gain for GPT-5; Cursor's current status unconfirmed.
- Routers that classify the prompt: SuperScout ablation shows the handoff, not the router, drives results; generic sub-agent delegation for code Q&A (46.2% vs 65.2%) and recursive delegation (6x to 12x tokens, no correctness gain).

(3) Open questions (added):
- Cursor, Cline, OpenCode 2026 status of apply models.
- Full text of SWE-grep numbers.
- A frontier-model grep vs embedding ablation with end-to-end resolve rate and token counts.
- Whether context editing's gains hold on coding tasks.
- End-to-end effect of Squeez, CoACT compressors; any harness-level test of small-model test selection, error triage, next-edit prediction, commit message helpers (none found).
- Which of the 2026 vendor numbers replicate independently.
