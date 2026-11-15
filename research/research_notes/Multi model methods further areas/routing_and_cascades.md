# Model routing and cascades (2023 to Nov 2026)

Labels: [read] = seen in the page full text fetched (note: the fetch tool returns a model-written extract of the page, so a few figures could be mis-extracted; figures in images/plots were NOT readable and are marked as not available). [abstract] = abstract page only. [secondary] = search-engine snippet or third-party account, page not opened. Vendor claims and preprints are marked. About 25 tool calls were used; several sources were not opened (listed under Gaps).

## (a) Main methods and what each needs

### Takeaway
Most learned routers need a labelled log of (query, model, quality, cost) over the model pool, plus an embedding model; cascades need an escalation signal (self-verification, sampled agreement, a scorer, or tests). Hosted-API-only is workable for all of them, since none need weights; only logprob-based cascades are excluded. Evidence base is mostly QA, math and chat benchmarks; code and agent evidence is thin and newer (2026).

### Cited Findings
- FrugalGPT (Chen, Zaharia, Zou; 9 May 2023; preprint; arXiv 2305.05176): cascade of LLM APIs; claims matching best single LLM (GPT-4) with up to 98% cost reduction, or +4% accuracy at equal cost. [abstract] — [arXiv](https://arxiv.org/abs/2305.05176). Needs a labelled set to train a scorer and the cascade order/thresholds.
- AutoMix (Aggarwal et al.; NeurIPS 2024; arXiv 2310.12963): small model's answer is self-verified with few-shot prompting, POMDP router decides escalation; 5 LMs, 5 datasets; "over 50% computational cost reduction for comparable performance". [abstract] — [arXiv](https://arxiv.org/abs/2310.12963). Needs a few-shot verification prompt and a small labelled set to fit the POMDP; no logprobs.
- Hybrid LLM (Ding et al.; ICLR 2024; arXiv 2404.14618): router predicts query difficulty, quality threshold tunable at test time; "up to 40% fewer calls to the large model with no drop in quality". [abstract] — [arXiv](https://arxiv.org/abs/2404.14618). Needs training data with quality labels for the pair.
- RouteLLM (Ong et al., LMSYS/Berkeley/Anyscale; v1 26 Jun 2024, v4 23 Feb 2025; preprint; arXiv 2406.18665): routers trained on human preference data (Chatbot Arena) plus augmentation, strong-vs-weak binary routing; "over 2x cost reduction in certain cases" with no quality loss; transfers when model pair swapped. [abstract; benchmarks and model names not on abstract page, full text not read] — [arXiv](https://arxiv.org/abs/2406.18665). Needs preference data.
- Unified approach / cascade routing (Dekoninck, Baader, Vechev, ETH; Oct 2024, v5; preprint; arXiv 2410.10347): derives an optimal cascade strategy, proves an existing routing strategy optimal, proposes cascade routing combining both; says quality estimators are the deciding factor; claims it beats routing and cascading alone "by a large margin". [abstract] — [arXiv](https://arxiv.org/abs/2410.10347). Needs a quality estimator and a cost model; full-text numbers not read.
- RouterBench (Hu et al.; Mar 2024; arXiv 2403.12031): 405k+ inference outcomes dataset and framework. [abstract] — [arXiv](https://arxiv.org/abs/2403.12031).
- GraphRouter (Feng, Shen, You; Oct 2024, v2 Mar 2025; preprint; arXiv 2410.03834): graph over tasks/queries/models; "at least 12.3% minimum performance gain over existing routers" and 9.5% effect boost, three effect-cost weightings. [abstract] — [arXiv](https://arxiv.org/abs/2410.03834). Needs labelled interaction data.
- MixLLM (Wang et al., NEC Labs; NAACL 2025 main; arXiv 2502.18482): contextual-bandit router balancing quality/cost/latency, continual learning from feedback, handles models added/removed; "97.25% of GPT-4's quality at 24.18% of the cost" under a time constraint. [abstract] — [arXiv](https://arxiv.org/abs/2502.18482).
- CARROT (Somerstep et al.; Feb 2025, v2 May 2025; preprint; arXiv 2502.03261): predicts per-model cost and accuracy; minimax-optimality argument; releases SPROUT dataset; evaluated on SPROUT, RouterBench, Open LLM Leaderboard v2. No numbers on abstract page. [abstract] — [arXiv](https://arxiv.org/abs/2502.03261).
- Router-R1 (Zhang, Feng, You; NeurIPS 2025; arXiv 2506.09033): router is itself an LLM trained with RL, alternating think and route steps, reward = format + outcome + cost; seven QA / multi-hop QA benchmarks; generalises to unseen models via descriptors. No figures on abstract page. [abstract] — [arXiv](https://arxiv.org/abs/2506.09033). Needs RL training (open weights router), so not API-only for the router itself.
- Arch-Router (Tran, Paracha, Hafeez, Chen; 19 Jun 2025; arXiv 2506.16655): 1.5B router that matches queries to user-defined domain/action policies (human-preference alignment) rather than benchmark scores. No numbers on abstract page. [abstract] — [arXiv](https://arxiv.org/abs/2506.16655). The authors are from a router vendor (Katanemo/Arch), so treat as vendor-affiliated.
- Avengers (Zhang et al., Shanghai AI Lab; May 2025, v3 Jun 2025; arXiv 2505.19797): embed, cluster, score each model per cluster, route to cluster-best model(s) with repeated-sampling vote; 10 open ~7B models; claims higher average than GPT-4o/4.1/4.5 over 15 datasets; +18.21% over GPT-4.1 on math and +7.46% on code. Only tunable parameter is cluster count. [abstract] — [arXiv](https://arxiv.org/abs/2505.19797).
- Avengers-Pro (Zhang et al.; 18 Aug 2025, v2 22 Oct 2025; DAI 2025; arXiv 2508.12631): same clustering recipe with a performance-efficiency score; 8 models incl. GPT-5-medium, Gemini-2.5-pro, Claude-opus-4.1; 6 benchmarks; up to +7% average accuracy over strongest single model (GPT-5-medium), same accuracy at 27% lower cost, ~90% of its performance at 63% lower cost. [abstract] — [arXiv](https://arxiv.org/abs/2508.12631). Same lab (Shanghai AI Lab) as LLMRouterBench; see (c) for independent test.
- Not opened (no figures): Zooter, RouterDC, IRT-Router; only mentioned as names in benchmark tables below.

### Inferences
- Common data need: a per-query outcome table for every model in the pool. For a coding harness this means logging (task, model, pass/fail, cost) from its own runs.
- The "needs nothing" options (Avengers-style clustering, kNN) are the cheapest to try; RL routers (Router-R1) and fine-tuned routers (Arch-Router) need training infrastructure.

### Gaps
- Full-text numbers for RouteLLM, FrugalGPT, AutoMix, Hybrid LLM, cascade routing, GraphRouter, MixLLM, CARROT were not read (abstract pages only). Zooter, RouterDC, IRT-Router, Router-R1 numbers not obtained.

## (b)/(c) Benchmarks and sober evaluations

### Takeaway
Independent, unified evaluations (LLMRouterBench, RouterArena) find many routers collapse to similar performance, fall well short of the oracle, and that the best single model is a strong baseline; a well-tuned kNN is competitive. Gains over best-single are small (up to ~4% accuracy) and cost savings come mainly from cheap-model fallbacks.

### Cited Findings
- LLMRouterBench (Li, Zhang, ... Hu et al.; Northwestern Polytechnical + Shanghai AI Lab; Jan 2026; Findings of ACL 2026; arXiv 2601.07206): ~24k prompts, ~391k instances, 21 datasets, 33 models, 10 routing baselines (RouterDC, EmbedLLM, MODEL-SAT, GraphRouter, Avengers; HybridLLM, FrugalGPT, RouteLLM, Avengers-Pro, OpenRouter). [read] Performance-cost track uses 13 flagship models (GPT-5, Gemini-Flash, Qwen3-235B, DeepSeek-R1, GLM-4.6, Qwen3-Thinking) over 10 datasets incl. HumanEval, SWE-Bench, tau2-Bench. [read] Results: top methods get "up to 4% average accuracy gain over Best Single" and "up to 31.7% cost reduction while matching Best Single"; OpenRouter is 24.7% below Best Single on performance. [read] "most routing methods collapse to similar performance"; "large and persistent gap to the Oracle", driven by model-recall failures: on the 410 queries (11.9%) where at most three experts are right, Avengers gets 24.6% and EmbedLLM 23.2%. [read] Absolute Best Single and Oracle numbers were only in figures, not readable. Embedding backbone has limited impact; larger ensembles show diminishing returns vs curation (search summary). — [paper](https://arxiv.org/html/2601.07206), [secondary summary](https://arxiv.org/pdf/2601.07206)
- RouterArena (Lu, Liu, Yuan, ... Xing; Rice University; Oct 2025, v3; ICLR 2026; arXiv 2510.00202): 12 routers; overall accuracy / cost per 1k queries: GPT-5 router 74.0% / $14.02; Azure-Router 68.1% / $0.54; NotDiamond 68.0% / $9.34; vLLM-SR 67.3% / $1.67; CARROT 67.2% / $2.06; MIRT-BERT 66.9% / $0.15; NIRT-BERT 62.0% / $0.69; MLP 61.6% / $4.83; KNN 58.7% / $4.27; GraphRouter 57.0% / $0.34; RouteLLM 47.0% / $0.27; RouterDC 32.0% / $0.07. [read] Conclusions: no router is universally best; commercial does not automatically beat open-source; all fall short of oracle, mainly by failing to defer to cheaper models; hard-query accuracy drops (GPT-5 router 27.5% hard vs 95.1% easy); robustness to paraphrase/typos "uniformly low" (numbers only in a figure). [read] Note: the "GPT-5" entry is a router limited to OpenAI models, and the table has no always-best-single row in the extract. — [paper](https://arxiv.org/html/2510.00202v3)
- RouterEval (Huang et al., Sun Yat-sen; Mar 2025, v2 May 2025; arXiv 2503.10657): 12 evaluations, 8,500+ LLMs, 200M+ performance records; claims a capable router beats best single model as candidate count grows, but existing routers "mostly have significant room for improvement". [abstract] — [arXiv](https://arxiv.org/abs/2503.10657)
- kNN router (Yang Li, single author; May 2025; preprint; arXiv 2505.12601; "When Simple kNN Beats Complex Learned Routers"): text AUC averages over AlpacaEval, Open LLM LB v2, HELM-Lite, RouterBench: Oracle 64.91, Linear 53.14, kNN(k=100) 52.68, MLP 51.71, Random 40.35. [read] So kNN does NOT win on average AUC; it ties. In selection-based utility kNN(k=10) is 39.75 vs MLP 42.85 (kNN lower). [read] Out-of-distribution (train on one RouterBench task, test others): kNN k=100 loses least, about 2.63 AUC points, vs linear MF 6.67. [secondary, from search snippet]. Costs for open models estimated from TogetherAI prices. [read] Title overstates its own tables. — [paper](https://arxiv.org/html/2505.12601v1)
- DecoR "Beyond Query Memorization" (arXiv 2605.25558, 2026, preprint): says several prior routers fail to beat a random-selection baseline out-of-distribution; reports 86.49% OOD vs 89.35% in-distribution for its own method on its own CodaSet. [secondary; page not opened] — [HF](https://huggingface.co/papers/2605.25558.md)

### Inferences
- LLMRouterBench and RouterArena are the most reliable "sober" evidence; both are preprint/new-venue and the first is from the same lab as Avengers/Avengers-Pro, which is useful as it reports weak results for its own lab's routers too.
- Learned routers cluster in a narrow band; the oracle gap is the important number and is dominated by "specialist exists but is not picked".

### Gaps
- Absolute oracle and best-single accuracy for LLMRouterBench; RouterBench full-text conclusions; RouterEval figures. Not obtained (figures unreadable or not opened).

## Can a router beat the best single model on accuracy?

### Takeaway
Yes, modestly, and only when models have complementary strengths; typical independent gains are a few points, while cost savings are larger. Oracle gaps are large.

### Cited Findings
- LLMRouterBench: up to +4% average accuracy over Best Single among 13 flagship models. [read] [paper](https://arxiv.org/html/2601.07206)
- Avengers-Pro: up to +7% over GPT-5-medium (own paper, 6 benchmarks, 8 models). [abstract] [arXiv](https://arxiv.org/abs/2508.12631)
- KNN-style and Avengers-style routers: Avengers claims 10 ~7B models beat GPT-4o/4.1/4.5 on average. [abstract] [arXiv](https://arxiv.org/abs/2505.19797). Weak baselines: older proprietary models.
- RouterArena: the best row is a router with an OpenAI-only pool (74.0%) at $14.02/1k queries; cheaper routers at 67-68% cost $0.15 to $9.34. [read] [paper](https://arxiv.org/html/2510.00202v3)
- Coding-specific oracle gaps: Applied Compute (vendor blog, SWE-bench Verified, 497 tasks, 3 rollouts per model): always Opus 4.7 0.834, always GPT-5.5 0.776, always Nemotron 3 Ultra 0.710, oracle 0.890 (oracle upper bound uses answer key). [read] [vendor blog](https://www.appliedcompute.com/research/agentic-model-router)
- Fireworks (vendor blog, DeepSWE v1.1, 113 tasks, 18 models, 4 rollouts): best single model 74.1% at $6.52/task; oracle over all 18 models 97.6% at $1.88/task; oracle over open-weight only 90.3% at $1.45/task. The authors note the oracle is optimistic (max over noisy estimates, scored on same tasks). [read] [vendor blog](https://fireworks.ai/blog/llm-model-routing-deepswe)
- CodeRouterBench / ACRouter (Zhou et al.; Jun 2026; preprint; arXiv 2606.22902): 8 frontier models; in-distribution AvgPerf: Oracle 57.00, ACRouter (memory + verifier + small fine-tuned orchestrator) 49.98, LogReg 47.26, RouteLLM-BERT 47.22, Always-Opus 4.6 43.83. [read] Cost: Perf/$ for Always-Opus 1.29 vs ACRouter 3.79 vs LogReg 6.27. [read] So best-single is beaten by ~6 points on its own benchmark; ACRouter is not the cheapest. — [paper](https://arxiv.org/html/2606.22902)

### Inferences
- A router beating best-single in accuracy is plausible in a pool where models differ in specialisation (coding oracle gaps are 5-25 points). Realised capture of that gap in independent tests: about a third to a half at best (ACRouter ID: 6.2 of 13.2 points).

### Gaps
- No independent replication of Avengers-Pro's +7%.

## (d) Routing inside multi-step agents, and for code

### Takeaway
Newest evidence (2026) shows step-level or task-level routing on SWE-bench can roughly halve API cost at similar resolve rate, but samples are small (100 to 500 tasks), mostly from vendors or single papers, and a prompted frontier LLM used as router did poorly.

### Cited Findings
- TwinRouterBench (Yang, ..., Shi et al.; May 2026, v5 Oct 2026; preprint; arXiv 2605.18859): static track 970 prefixes from 520 instances (SWE-bench, BFCL, mtRAG, QMSum, PinchBench), 11 models in four tiers; dynamic track runs mini-swe-agent on a fixed 100-instance SWE-bench Verified list (18 Astropy, 82 Django, not random). Dynamic: Opus 4.6 unrouted 74/100 resolved at $54.73; trained UncommonRoute 75/100 at $25.66 (about 53% lower API cost); SR-KNN 75/100 at $55.61; rule-based UncommonRoute 73/100 at $172.56. [read] Opus 4.6 prompted as a router predicted "high" for only 7 of 147 verified-high SWE steps and failed all 40 SWE trajectories. [read] Cache writes after a tier switch bill at incoming tier rate (cache_write 12.5x cache_read at high tier) yet net cost still fell. [read] Authors call it initial evidence. — [paper](https://arxiv.org/html/2605.18859)
- Applied Compute (vendor blog; 2026): small router (Qwen3.6-35B-A3B, GRPO-trained) picks one of three models per task before rollout; reaches about 76% pass, "roughly GPT-5.5 quality at about 25% less cost" (approximate), below always-Opus 4.7 (0.834). A frontier model as router did not beat the trained router. Intuitive signals (stack traces, long problem statements) were dropped as unreliable. Noise acknowledged: GPT-5.5 strictly best on only 22 tasks. [read] — [blog](https://www.appliedcompute.com/research/agentic-model-router). Note it does not beat always-best on accuracy.
- Agent-as-a-Router / ACRouter: out-of-distribution agentic set (176 tasks, 40-step cap): Oracle 75.89, ACRouter 62.50, Always-Opus 4.6 57.14, LogReg 19.64, RouteLLM-BERT 21.43; i.e. trained routers collapsed on agentic OOD tasks while the memory+verifier router held. Costs treated as secondary because provider cache hits are unobservable. [read] — [paper](https://arxiv.org/html/2606.22902)
- Not Diamond Code (VENDOR claim, 4 Aug 2026): picks model and reasoning effort per turn, cache-aware, in Claude Code among Haiku 4.5/Sonnet 4.6/Opus 4.8; claims about Opus 4.8 XHigh quality at 39% lower cost on Poly-SWE-bench and 61% lower on LongCodeQA; adding GLM 5.2 and DeepSeek V4 Flash gives +3.6% and 66% savings. Task counts, variance and cache accounting not disclosed; no comparison to other routers. [read] — [blog](https://www.notdiamond.ai/blog/not-diamond-code-intelligent-model-routing-for-coding-agents)
- FireRouter (VENDOR): 2,334 production sessions through FireRouter cost $7.42 total vs $15.81 for Opus 5 alone (53% lower); resolve rate of FireRouter not reported; costs rescaled for some models; measurement method of session costs not explained. [read] — [blog](https://fireworks.ai/blog/llm-model-routing-deepswe)
- Cost of switching: Claude Code docs state each model keeps its own cache, so `/model` switch reprocesses the whole conversation without cache hits. [secondary, search summary] [docs](https://code.claude.com/docs/en/prompt-caching). A Towards Data Science test of 20-turn sessions reported cache reuse ~90% in turn, 55% across turns, 8% after a model switch (blog, author unverified; also cites a 6.4% switch-rate paper I could not verify). [secondary] [TDS](https://towardsdatascience.com/the-hidden-cost-of-llm-routing-why-switching-models-costs-more/). LiteLLM (vendor) reports its affinity-aware router was 37.4% cheaper on 95 real agent sessions than fixed-model caching. [secondary] [docs](https://docs.litellm.ai/docs/auto_router/prompt_caching). Claims that a new model "misreads state" or "revisits settled decisions" are practitioner opinion, not controlled studies. [secondary]
- SWE-Router, Scrouting, mini-swe-agent roulette were excluded as already covered.

### Inferences
- Task-level routing (choose before the run; never switch) avoids cache loss and context inheritance and is the best-evidenced; per-step switching is supported only by TwinRouterBench (n=100) and vendor claims.
- Prompted LLM routers failing on SWE steps (TwinRouterBench, Applied Compute) argues against "ask the main model which model to use".

### Gaps
- No controlled study measuring the quality penalty of a model inheriting another's trajectory. Agent-as-a-Router sections after char 100000 and TwinRouterBench tail not read.

## (e) Cascade escalation signals

### Takeaway
Grounded signals (tests/execution) are best for code; self-verification and agreement are cheaper and work for QA; trained scorers need labels; logprobs are unavailable via API in many cases. I found no clean precision/recall table comparing signals for code.

### Cited Findings
- Self-verification + POMDP (AutoMix): over 50% cost cut at comparable quality on 5 datasets. [abstract] [arXiv](https://arxiv.org/abs/2310.12963)
- Test-based escalation: "Model Cascading for Code" (Chen et al. 2024) escalates when the best generated solution passes too few self-generated tests; ~26% average, up to 70% cost saving (already in earlier survey; figures from search summary) [secondary] [promptlayer](https://www.promptlayer.com/research-papers/model-cascading-for-code-reducing-inference-costs-with-model-cascading-for-llm-based-code-generation). EcoAssistant escalates GPT-3.5 to GPT-4 only when code fails [secondary].
- Sampled-agreement signals: AutoMix and ModelSwitch use self-consistency; C3PO (arXiv 2511.07396) learns early exit from cheap/strong agreement. [secondary, no figures read] [arXiv](https://arxiv.org/html/2511.07396v1)
- Conformal Cascade (arXiv 2607.25018, 2026 preprint): defers unless conformal prediction set is a single answer. [secondary, unverified] [alphaxiv](https://www.alphaxiv.org/abs/2607.25018)
- A Stanford course project found visible verifier feedback the dominant routing signal and that a learned router struggled to beat a simple escalation rule. [secondary; student project, low weight] [PDF](https://cs224r.stanford.edu/projects/pdfs/Mauricio%20Berlanga%20Carrillo%20submission_416263800/final.pdf)
- Cascade cost structure: sequential escalation pays the cheap attempt plus the strong one, and streaming is hard. [secondary blog] [Stanford blog](https://web.stanford.edu/~shuhuiq/blog/review-routing-cascades.html)
- Cascade routing paper says quality estimator quality decides success. [abstract] [arXiv](https://arxiv.org/abs/2410.10347)

### Inferences
- For a harness, "tests pass" and "tests the agent wrote pass" are natural escalation signals; a failed run is already evidence (Applied Compute found surface features of the prompt unreliable).

### Gaps
- No precision/recall figures per signal found; Chen 2024 and C3PO full text not read.

## GPT-5 router and commercial routers

### Takeaway
OpenAI published qualitative claims only; I found no OpenAI outcome numbers. Independent tests of commercial routers (RouterArena, LLMRouterBench) show them mid-pack.

### Cited Findings
- GPT-5 system card (OpenAI, Aug 2025): router continuously trained on real signals: model switches by users, preference rates, measured correctness; routing inputs: conversation type, complexity, tool needs, explicit intent ("think hard"); mini model fallback at usage limits. [secondary; openai.com page returned 403, arXiv copy 2601.03267 snippet only] — [arXiv](https://arxiv.org/abs/2601.03267v1)
- Altman said the autoswitcher was down for part of launch day and made GPT-5 seem weaker. [secondary] — [VentureBeat](https://venturebeat.com/ai/openai-returns-old-models-to-chatgpt-as-sam-altman-admits-bumpy-gpt-5-rollout). No share-of-traffic figure found.
- Independent: RouterArena (Azure-Router 68.1% at $0.54/1k; NotDiamond 68.0% at $9.34) [read]; LLMRouterBench: OpenRouter 24.7% below best single [read]. See above.

### Gaps
- OpenAI primary page unread; no independent measurement of Martian.

## Reasoning-effort routing

### Takeaway
Measured savings exist (up to ~50% fewer reasoning tokens) but come from preprints with small routers and QA/web agent benchmarks, not code.

### Cited Findings
- ARES (Yang, Hou, Wei, Bao, Chang; 9 Mar 2026; preprint; arXiv 2603.07915): small router picks lowest sufficient reasoning effort per agent step; TAU-Bench, BrowseComp-Plus, WebArena; up to 52.7% fewer reasoning tokens vs fixed high effort with minimal success loss. [abstract] — [arXiv](https://arxiv.org/abs/2603.07915). Router adds one call per step (secondary).
- Self-routing paper (alphaxiv 2608.20256, Aug 2026): response length down 41% (4,796 to 2,811 tokens) at comparable accuracy. [secondary] — [alphaxiv](https://www.alphaxiv.org/abs/2608.20256)
- DART (arXiv 2606.23181): training-free, cheap drafts disagree then think; no savings figure obtained. [secondary]
- Not Diamond Code routes effort per turn (vendor claim above).

### Gaps
- No SWE-bench measurement of effort routing in a peer-reviewed or independent source.

---

## Final lists

### (1) Strongest evidence of benefit for an API-only coding harness
1. Task-level routing before the run with a trained small router (Applied Compute; TwinRouterBench trained router): ~25 to 53% cost cut at roughly equal resolve rate, but tiny samples, and vendor/preprint.
2. Test/execution-based escalation (cheap model first, escalate on failing tests): Model Cascading for Code 26% mean savings; matches cascade logic from AutoMix.
3. Cheap-by-default with a best-single fallback: LLMRouterBench shows savings up to 31.7% while matching best single.
4. kNN/cluster lookup over your own run logs (Avengers-style, kNN): cheap, API-only, degrades least OOD; gains over best single small (up to 4%).
5. Reasoning-effort routing per step (ARES up to 52.7% fewer reasoning tokens; non-code benchmarks) - plausible, needs local validation.
6. Cache-aware switching rules (switch rarely; at task boundaries or sub-agents) supported by cost mechanics, not by trials.

### (2) Looked promising but did not hold up
- Commercial/general routers as drop-in: OpenRouter -24.7% vs best single; Azure/NotDiamond mid-table, low robustness (LLMRouterBench, RouterArena).
- Prompted frontier LLM as the router: failed on SWE (TwinRouterBench 7/147; Applied Compute).
- Trained BERT/logistic routers out-of-distribution on agentic tasks (ACRouter OOD: 19.6 to 21.4 vs 57.1 for always-Opus).
- Learned routers vs kNN: the kNN paper's own tables show kNN merely ties, not beats.
- Avengers-Pro +7%: not independently reproduced; LLMRouterBench (same lab) finds up to +4% generally.
- Rule-based routing in agents (UncommonRoute rule-based cost $172 vs $26 trained).

### (3) Open questions
- Does mid-run switching hurt quality beyond cache cost? No controlled study found.
- Realised capture of the large coding oracle gap (74% vs 98% in Fireworks' own data) on held-out tasks.
- Escalation-signal precision/recall for code with agent-authored tests.
- Whether effort routing transfers to SWE-bench.
- OpenAI's actual router outcomes.
- All 2026 agent-routing results use <=500 tasks and often tune and test on the same tasks.

---

## Second pass (gaps closed)

Labels as before. "Quote" = sentence as returned by the fetch tool's extract of the page (the tool paraphrases around quotes, so treat quotes as near-verbatim).

### 1. Agentic routing papers: tails read

**TwinRouterBench** (arXiv 2605.18859, header date 8 May 2026, v5 24 Oct 2026; preprint) [read, html]
- Training: SR-KNN is "an in-sample 1-nearest-neighbor upper bound over question-bank embeddings" (uses semantic-router defaults), so its static numbers are in-sample and not a fair baseline. Trained UncommonRoute: "The latest user request is encoded with a frozen BAAI/bge-small-en-v1.5 sentence embedding," then "A multinomial logistic regression classifier with L2 regularization is trained on the training split." Rule-based variants have no training. Prompted LLM routers were also run (the Opus 4.6 diagnostic).
- What counts as a step needing the strong model: the ideal target is "the cheapest tier that can correctly handle the current step given the prefix"; labels come from a cascade, "a tier is accepted if any of the three pool models passes under the mixed-model trace" (execution-verified), and "if no candidate passes, the step stays at the strong tier," so "high" is partly a default when nothing cheaper passes. "Our labels are conditional on the realized router-visible prefix, rather than on the task alone." "One under-routed critical step fails the whole trajectory."
- Cache: yes, accounted in the dynamic track. "token buckets come from provider usage logs normalized to input, cache_read, cache_write, and output," and the dynamic track "reports realized OpenRouter cost rather than simulated cost." Static tables use cold and warm step profiles.
- Switching mid-run: "Cache writes on tier switch are charged at the incoming tier's rate," "a policy that churns into expensive tiers incurs the cache_write cost at list price," and a per-step router "reduces realized API cost by 53.1% relative to unrouted Opus despite those switches." No switch counts and no quality-vs-switch analysis reported. Dynamic evidence is still the 100-instance Astropy/Django list. The last ~18k characters of the page were not read.
- Reminder from pass 1: Opus 4.6 prompted as a router predicted "high" for 7 of 147 verified-high steps.

**Agent-as-a-Router / ACRouter, CodeRouterBench** (arXiv 2606.22902v3; PDF metadata 29 Jun 2026; no date in text; preprint) [read, html, tail partly]
- Training: the orchestrator is "a cost-effective Qwen3.5-0.8B model fine-tuned on the CodeRouterBench probing set"; LogReg and RouteLLM-BERT are "all trained on the probing set" (7,080 tasks) that is also used to "train classifiers, calibrate DimensionBest, and warm-start ACRouter's Memory module." Label construction not stated in the text I got. Split: 60/10/30 md5.
- Routing granularity: per task. "a stream of N tasks", one action per task. The OOD agent set allows up to 40 steps per task, but routing within a trajectory is not described.
- Strong-model need: no rule; per-task oracle = best model per task, and "the remainder of the routing signal lies in the per-task content (algorithm choice, API patterns, edge-case handling)."
- Cache: not mentioned. Costs "include both backend and router-side tokens"; earlier note that cache hits are unobservable stands. Perf/$ figures are therefore without cache modelling.
- Switching mid-run: not studied. Trained classifiers "condition on prompt features that no longer carry the same signal in the OOD distribution, and they cannot acquire new feedback during evaluation" (explains OOD collapse). No ablation numbers for removing Verifier or Memory found (Table 7: memory plus verifier feedback "helps MiniMax-M2.7 but does not uniformly improve stronger prompt-following routers"). Last ~28k chars not read.

### 2. Cascade signals for code: what exists

I did not find any paper that reports precision/recall (or AUROC) of an escalation signal for code generation or coding agents. Closest measured items:
- AutoMix-style self-verification and POMDP: see classic table below (QA, not code).
- Cascade-routing paper on SWE-Bench: post-hoc quality from running ground-truth tests; see below: cascade with that signal AUC 53.20 vs 38.52 for a threshold cascade; "On SWE-Bench, routing does not beat the trivial baseline because ex-ante estimates are insufficient." [read] This is the best evidence that test results (post-hoc) beat prompt-only prediction for code. Caveat: ground-truth tests, not agent-written tests.
- Semantic Agreement cascades (Soiffer, Kolawole, Smith; arXiv 2509.21837; 26 Sep 2025, EMNLP 2025 Industry Track): meaning-level agreement among ensemble outputs, black-box compatible: "semantic cascades match or surpass target-model quality at 40% of the cost" and "reduce latency by up to 60%"; models 500M to 70B; open-ended text, no code benchmark named. [abstract]
- SWE-Verifier (Zou et al., Michigan/UT Austin; arXiv 2610.30284; 21 Oct 2026; preprint) [read]: not model escalation, but a step-level gate. A Qwen3.5-4B verifier trained on 30k action labels from 6,000 steps gates when to sample and compare alternative actions. SWE-bench Verified: MiniMax-M2.7 75.47% at 1.00x cost to 77.20% at 1.09x "verifying only 3.43% of steps"; DeepSeek-V4-Flash 72.60% to 74.27% at 1.13x. Comparison points: trajectory-level LLM-as-a-Verifier@3 75.85% at 3.50x; all-step self-verification 75.27% at 3.35x (self-checking every step did not help and tripled cost). Threshold 0.2 tuned on a 202-task subset of the same benchmark (tuning/test overlap). Escalation to a stronger selector is only an ablation (73.27% vs 71.95%) and "future work".
- TokenEconomizer (Li et al. incl. Stoica, Gao; arXiv 2610.22732; 15 Oct 2026) [read]: not a router ("keeps the model and effort fixed"); 18.4-30.9% lower cache-aware token cost with comparable success; a cost accounting reference ("cached context is priced as cache-read usage").
- ExeCRE (Dong et al.; arXiv 2608.04439; ASE 2026): execution-consistency reliability for code candidates; figures not obtained (PDF not decodable). [metadata only]
- Self-generated tests are unreliable: HumanEval Pro paper notes GPT-4 reaches only 63.4% pass@1 on test-output prediction (search snippet [secondary]).
- Conformal Cascade (Dou, Lian, Li; arXiv 2607.25018; 27 Jul 2026, v3 31 Jul): coverage at least 1-K*alpha; 18 multiple-choice benchmarks, two-tier cascades from four open-weight families; "at no accuracy cost" on easy sets; no numbers in abstract. [abstract] Requires a finite answer set, so it does not apply directly to code.
- C3PO (Valkanas et al.; arXiv 2511.07396; 10 Nov 2025; preprint): self-supervised, uses only unlabeled model outputs, conformal bound on probability that cost exceeds a budget; GSM8K, MATH-500, BBH, AIME; no figures in abstract. [abstract]
- DecoR (Lv, Sun; arXiv 2605.25558; 25 May 2026; ACL 2026): routes by matching against historical logs; abstract has no figures. The "fails to beat random OOD" and "86.49% vs 89.35%" figures from pass 1 remain [secondary]. [abstract]
- August 2026 self-routing paper = "Learning When to Think: Adaptive Reasoning for Test-Time Compute Allocation" (Kassenaar, Yang, Francois-Lavet; arXiv 2608.20256; 20 Aug 2026): 1.5B distilled reasoning model trained on MATH picks NoThink/Short/Long; "policy 0.782 vs. base 0.796" on MATH500; mean length 4,796 to 2,811 tokens (-41%); "76% token reduction on GSM8K". [abstract] Math, not code, small model.
Inference: for code, the evidence supports execution outcomes as the escalation signal; signal precision/recall remains unmeasured.

### 4. Classic routers, one line each (full text)
- RouteLLM [read, html v4]: strong GPT-4 vs weak Mixtral-8x7B; MT-Bench, MMLU, GSM8K; "the MT Bench score at CPT(50%), 8.8, is 95% that of GPT-4's score (9.3)" with the best router (matrix factorization, Arena+judge data) needing 13.40% of calls to GPT-4; "cost savings of up to 3.66x"; vs commercial routers (Unify AI, Martian) same performance with "up to 40% fewer calls routed to GPT-4" (vendor-trained comparison in own appendix).
- FrugalGPT [read, html]: 12 APIs from 5 providers; HEADLINES, OVERRULING, COQA; savings at matched accuracy 98.3% vs GPT-4 (HEADLINES), 73.3% vs GPT-4 (OVERRULING), 59.2% vs GPT-3 (COQA); scorer = DistilBERT regression. Old (2023) models, classification-style tasks.
- AutoMix [read, html, first 100k chars]: llama2-13b/mistral-7b/gpt-3.5 as small model vs GPT-4; qasper, quality, coqa, mutual, diplomat; incremental-benefit-per-cost gains vary from 8.5% to 156.8% across pairs (e.g., diplomat 156.8% with mistral-7b); "a relative cost of 1 unit for the SLM and 60, 100, 200 units for the LLM"; with 50 training examples "maintains 15% delta-ibc". Mixed gains, not uniform.
- Hybrid LLM [read, html]: Llama-2-13b vs GPT-3.5-turbo on MixInstruct (10k train, 5k val, 5k test), BART score; Figure 1: 22% fewer calls to GPT-3.5-turbo at a 1% quality drop; test set best router r_trans: 15.68% cost advantage at 0.49% quality drop (Table 3). The "40% fewer calls" headline is the best pair.
- Cascade routing (Dekoninck et al.) [read, html first 100k]: RouterBench (11 models, MBPP etc.), SWE-Bench, Minerva Math, LiveCodeBench, MMLU-Pro etc.; "improving performance by up to 8% on the RouterBench benchmark" and "by 14% on the SWE-Bench benchmark"; RouterBench gains of 1-4% over baselines; with poor quality estimators gains narrow to 1.2%. SWE-Bench AUC: linear interpolation 40.51, routing 40.47, baseline cascade 38.52, new cascade 53.20, cascade routing 54.12. Gains are in area under cost-quality curve, not pass rate.
- Avengers-Pro [read, html]: 8 models (Gemini-2.5-flash/Pro, Claude-4.1-opus, Claude-4-sonnet, GPT-5-chat, GPT-5-medium, Qwen3-235B-A22B-2507, Qwen3-thinking); six benchmarks ARC-AGI, GPQA-Diamond, HLE, LiveCodeBench-v6, SimpleQA, tau2-bench. GPT-5-medium 62.25% at $47.96; alpha=1.0 66.66% at $47.13; alpha=0.53 62.66% at $35.05; alpha=0.39 56.24% at $17.81. Only code benchmark LiveCodeBench-v6: GPT-5-medium 88.44 vs 89.59 for Avengers-Pro alpha=1.0 (+1.15). Authors note a table-caption inconsistency (alpha=0.1 vs 1.0). Preprint, same lab as LLMRouterBench.
- Pass-1 correction: GraphRouter, CARROT etc. remain abstract-only.

### 5. LLMRouterBench absolute figures [read, appendix tables of arXiv 2601.07206, extracted by the fetch tool]
- Performance-oriented pool (20 ~7B models), Table 11 "Avg": best single model Qwen3-8B 68.01; "Dataset Oracle" 73.10; Oracle 91.64. Random router 48.79, RouterDC 61.33, EmbedLLM 71.24, GraphRouter 70.29, Model-SAT 71.88, Avengers 71.94. Caption: "All results are computed on the 30% test split and averaged over five random seeds used in Experiments."
- Performance-cost pool (13 flagship), Table 12 "Avg": best single GPT-5 65.96 (Gemini-Pro 60.80); Dataset Oracle 69.16; Oracle 85.66. OpenRouter 49.67 (no score on tau2-Bench because "GPT-5-Chat and OpenRouter have no score on the tau2-Bench benchmark" due to no tool calling, so its average is over fewer datasets), Random 53.45, HybridLLM 57.56, FrugalGPT 59.71, RouteLLM 67.67, GraphRouter 67.79 (PF) / 59.70 (BL) / 56.98 (CF), Avengers-Pro 45.53 (alpha=0) / 68.58 (alpha=1).
- So in the accuracy-first setting routers beat best-single by about 3.9 points (Avengers 71.94 vs 68.01) and 2.6 points (Avengers-Pro 68.58 vs 65.96), versus oracle gaps of ~19.7 and ~17.1 points from best router to oracle. OpenRouter's comparison is partly confounded by the missing tau2 score.

### 6. GPT-5 router
- Reached OpenAI text only via the arXiv copy of the system card (arXiv 2601.03267; v1 19 Dec 2025, v2 1 May 2026) [read]: "The router is continuously trained on real signals, including when users switch models, preference rates for responses and measured correctness, improving over time." Router picks "based on conversation type, complexity, tool needs and explicit intent (for example, if you say 'think hard about this')." "Once usage limits are reached, a mini version of each model handles remaining queries." "In the near future, we plan to integrate these capabilities into a single model." No outcome figures or usage statistics in the part read (first 100k of ~164k chars). openai.com system card and help.openai.com returned 403, so not read.
- Independent measurement: RouterArena lists a "GPT-5" router row (74.0% accuracy, $14.02 per 1k queries, OpenAI-only pool; rank #7 on its Arena score) [read, pass 1]; it is the closest independent measurement, but the paper does not say it is ChatGPT's production router. No other independent test found.

### 7. Controlled studies of a second model inheriting the transcript
- "The Handoff Tax: Continuing Non-Native Trajectories in LLM Agents" (Ganz, Nacson, Kalyanpur, Litman; AWS; arXiv 2608.24358; 25 Aug 2026; preprint) [read, html]. SWE-bench Verified (500, mini-SWE-agent), plus Lost in Conversation (535) and BrowseComp (200); pairs Claude Haiku 4.5 (low-cost) / Opus 4.7 (high-cost) and GPT-5.6 Luna / Sol. Escalation with full transcript ("Raw"): Claude 69.2% vs 79.2% (high-only) and 60.7% (low-only), recovering 47% of the gap; GPT 67.5% vs 83.7% and 58.7%, recovering 36%. Dropping the trajectory but keeping repository state: recovery 64% (Claude), 84% (GPT). Downshift (strong to cheap) Raw: Claude 65.6% vs 75.8%/54.6% (50% recovery); GPT 81.0% vs 85.8%/63.6% (79% recovery). Quotes: "it recovers less than half of the LC-HC quality gap" (Raw escalation); "restarting costs less and solves more tasks" (Claude); "Raw downshift provides a favorable cost-quality trade-off." Telling the model that a switch occurred "does not eliminate the Raw handoff tax in Claude escalation." Compaction gave highest cost retention. Limitations: two model pairs, single run per task, hard-task cells ~24-27 tasks.
- "When LLMs Switch Mid-Conversation" (Khraishi, Zafar, Myles, Cowan; arXiv 2603.03111; Mar 2026; secondary blog review https://alanhou.org/blog/arxiv-evaluating-performance-drift-from-model-switching/, paper not opened) [secondary]: switch-matrix on CoQA and Multi-IF; handoff swings of -8 to +13 points on Multi-IF and +-4 F1 on CoQA; no mitigations tested; not an agent/coding study.
- Inference: the Handoff Tax is direct controlled evidence that, in SWE-bench, handing a half-done transcript from a cheap to a strong model gives away more than half of the strong model's benefit, and that dropping the transcript while keeping the repo state can do better. Relevant to advisor/takeover designs. Downshift (strong starts, cheap finishes) works better than escalation.

### What still could not be confirmed
- Precision/recall or AUROC of any escalation signal in code generation; ExeCRE numbers (PDF undecodable); Model Cascading for Code and EcoAssistant figures (still secondary).
- OpenAI's own page for GPT-5 router and any outcome or traffic-share figure; independent tests of Martian and the production ChatGPT router.
- Tails of TwinRouterBench (~18k chars), ACRouter (~28k), SWE-Verifier (~59k), GPT-5 system card (~64k), AutoMix and cascade-routing (last portions) not read. ACRouter label construction and ablations not found.
- Full-text numbers for GraphRouter, MixLLM, CARROT, Router-R1, Arch-Router, Zooter, RouterDC, IRT-Router, RouterEval, RouterBench.
- Khraishi et al. (2603.03111) not opened.

### Updates to the closing lists
(1) Add: keep per-task routing/escalation boundaries rather than mid-run switches, backed by the Handoff Tax (escalating with the old transcript recovered 36-47% of the gap on SWE-bench Verified; starting fresh did better in one pair). Add execution outcomes (tests) as the escalation signal, backed by the cascade-routing SWE-Bench result (AUC 53.20 vs 38.52 baseline cascade) and the finding that prompt-only routing did not beat a trivial baseline there. Selective step-level verification (SWE-Verifier: +1.7 points at 1.09x cost) is a cheap add-on, but it is not model routing.
(2) Add: all-step self-verification (75.27% vs 75.47% baseline at 3.35x cost in SWE-Verifier); SR-KNN-type in-sample lookups (upper bound only); Avengers-Pro's +7% shrinks to +2.6 points in LLMRouterBench's flagship pool (68.58 vs 65.96), where the oracle is 85.66.
(3) Add: no measured precision/recall of any code escalation signal; whether handoff loss shrinks with compaction or restart-with-repo-state on other agent scaffolds; whether router gains hold when prompt cache is modelled (ACRouter ignores it, TwinRouterBench includes it on 100 tasks only).
