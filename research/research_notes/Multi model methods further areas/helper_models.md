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
