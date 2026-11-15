# Search and evolution over candidate solutions with more than one model; mixed-model ensembles in leaderboard entries

Scope note. Coverage is PARTIAL: about 20 tool calls. Pages were fetched through a summarising fetch tool, so "[read]" below means the figure was returned from the paper's own full-text page (arxiv.org/html or PDF) by that tool, not that I read raw text; several long pages were only read up to ~100k characters. "[secondary]" = search-engine summary or third-party page. NOT researched (no data gathered, do not infer): LATS, CodeTree, RethinkMCTS, MLE-STAR, OpenEvolve, FunSearch, AI co-scientist tournament, Nemotron-CORTEXA, Refact, Warp, SWE-bench Pro / Terminal-Bench / MLE-bench / ARC Prize leaderboard entries, TreeQuest after AB-MCTS, any paper from 2026 on mixed-model search, and "failed attempt of one model as hint for another" papers. Search for 2026 work was not done beyond what surfaced incidentally.

## (a) Tree / evolutionary search for software tasks: gain over repeated attempts at equal budget

### Takeaway
Evidence that search beats plain resampling at equal budget is weak to modest in what I verified: AB-MCTS gains 1-3 points on coding at 128 calls and loses on ARC-AGI at that budget; AIRA-dojo found search policy irrelevant unless the operators were improved, and did not compare to best-of-N; SWE-Search has no equal-budget comparison in the part I read.

### Cited Findings
- AB-MCTS (Sakana; Inoue et al.; arXiv 2503.04412 v5; preprint, later NeurIPS-track per secondary). Budget = max API calls, main runs 2^7=128. Table 1 [read]: LiveCodeBench (GPT-4o) repeated sampling 37.8±0.5 vs AB-MCTS-M 38.9±1.9, AB-MCTS-A(Gaussian) 39.1±1.9; CodeContest (GPT-4o) 37.9±0.3 vs 40.6±1.0 / 40.2±1.7; ARC-AGI Pass@2 (GPT-4o) repeated 15.0±1.0 vs 12.3–14.0; ARC-AGI (DeepSeek-V3) repeated 18.6±1.0 vs 16.0–18.3. So repeated sampling wins on ARC at 128 calls; paper says AB-MCTS keeps improving to 512 calls while repeated sampling plateaus. MLE-Bench (GPT-4o) average rank: AB-MCTS-M 1.3, sequential refinement 2.3, repeated sampling 3.0, standard MCTS 3.3. The search uses a surrogate score (public tests / fraction of ARC examples / validation split) as evaluator, same model generates. — [arXiv html](https://arxiv.org/html/2503.04412v5)
- AIRA-dojo (Meta FAIR + UCL; "AI Research Agents for Machine Learning: Search, Exploration, and Generalization in MLE-bench"; arXiv 2507.02554 v2; preprint). MLE-bench Lite (22 tasks), DeepSeek R1 mainly, also o3; 24 h per run, 1 H200, 20 seeds for AIDE profile. With AIDE operators, greedy/MCTS/evolutionary all about equal (~35–39% medal rate). Operators swapped: AIDEgreedy 39.8% vs AIRAgreedy 45.5% (R1); AIRAmcts about 47% (abstract: 39.6% → 47.7%); later rerun up to 55% on Lite (v2, secondary-flagged). AIRAmcts gold rate 25.68% (R1) vs 30.91% (o3). The paper does NOT compare search against independent best-of-N (only in related work). Evaluator: GPT-4o used only to parse execution output, not to judge. Top-3 validation-ranked submissions recover ~10% more than random-3; generalisation gap val vs test reported. — [arXiv html](https://arxiv.org/html/2507.02554v2)
- SWE-Search (Antoniades et al., ICLR 2025; arXiv 2410.20285). SWE-bench Lite Pass@1 [read]: GPT-4o 25.7 (Moatless-adapted) → 31.0; GPT-4o-mini 13.0→17.0; Qwen-2.5-72B 18.0→24.7; DeepSeek-V2.5 16.3→21.0; Llama-3.1-70B 13.6→17.7 (abstract claims +23% relative; the paper's own delta column does not reproduce from its table; Llama Pass@1 is 21.0 in Fig 3 vs 17.7 in Table 1). Search capped at 100 iterations. Value function alone picked the correct solution 73% of time, discriminator debate (5 agents, 3 rounds) raised it to 84%. Value/discriminator model not named in the text I read; appendices on cost and compute matching not read. These are old weak models; no equal-budget best-of-N shown in the read portion. — [arXiv html](https://arxiv.org/html/2410.20285)
- Large Language Monkeys (Brown et al., Stanford/Oxford/Google DeepMind; arXiv 2407.21787; preprint). SWE-bench Lite with DeepSeek-Coder-V2-Instruct (Moatless tools): 15.9% at 1 sample → 56% at 250 samples [read; coverage = any sample passes tests, i.e. oracle-selected]. Cost [read]: DeepSeek 5 attempts $10.8, 29.62%; GPT-4o 1 attempt $39, 24.00%; Claude 3.5 Sonnet 1 attempt $51, 26.70% — i.e. 5 cheap samples beat 1 expensive sample at 3.6–4.7x lower cost (coverage-type metric). CodeContests Gemma-2B 0.02%→7.1% at 10,000 samples. Verifier failure: Llama-3-8B on MATH, majority vote / reward model only 40.50→41.41% across the range, plateau ~100 samples. At fixed FLOPs the 8B beat 70B on MiniF2F/GSM8K/MATH, but for CodeContests the 70B was nearly always more cost-effective. — [arXiv html](https://arxiv.org/html/2407.21787)

### Inferences
- Gains of tree search over resampling are small (1–3 points) on coding at ≤128 calls, and reversed in one setting; "search helps" depends on a good intermediate score. No source I read shows MCTS beating best-of-N on SWE-bench-style multi-step agents at equal dollars.
- AIRA-dojo suggests operator/prompt design matters more than search policy; relevant to a harness (improve the step operators first).

### Gaps
- SWE-Search appendix I/J (cost, compute matching) not read; whether its value agent is a different model than the generator is not stated in what I read.
- LATS, CodeTree, RethinkMCTS, MLE-STAR, post-AB-MCTS TreeQuest not researched.

## (b) Using two or more models inside a search; separate evaluator; learned model choice

### Takeaway
Two models inside search have thin controlled evidence. ShinkaEvolve's bandit is the only learned-model-choice ablation found, and its text is inconsistent about effect size ("slightly" in caption vs "significantly" in text). AB-MCTS multi-LLM lacks a same-model-set repeated-sampling control.

### Cited Findings
- ShinkaEvolve (Lange, Imajuku, Cetin; Sakana AI; arXiv 2509.19349; ICLR 2026 per secondary). Circle packing in <150 program evaluations, sum of radii 2.635983 under OpenEvolve's verifier [read]. Ablation (Fig 9): single LLM (GPT-5-nano) vs fixed uniform ensemble vs UCB1-style bandit (reward = relative improvement over parent fitness). Ensemble listed in config: claude-sonnet-4, o4-mini, gpt-4.1-nano, gpt-4.1, gpt-4.1-mini. Caption says bandit "slightly improves" over fixed ensemble; body text says "significantly outperforms" both. No numeric values, seed count or cost in the text; only in a plot I could not see. Note the single-model baseline is a small model, not the best ensemble member, so it is not a "best single model" control. Same paper's ablations: random parent selection worst convergence; novelty rejection sampling helps. Vendor-authored (Sakana) preprint/conference. — [arXiv html](https://arxiv.org/html/2509.19349v1); [Sakana blog](https://sakana.ai/shinka-evolve/) (vendor)
- AlphaEvolve (Google DeepMind white paper, 2025; arXiv 2506.13131; vendor). Uses Gemini Flash (throughput/breadth) plus Gemini Pro (occasional higher-quality suggestions). Ablations in Fig 8 (3 runs): no evolution, no prompt context, no meta-prompt evolution, no full-file evolution, "small base LLM only"; conclusion "each component responsible for a significant improvement". Only curves; no numeric values, and no "Pro only" or "Flash+Pro vs best single" arm — the model ablation is vs small model only. — [arXiv html](https://arxiv.org/html/2506.13131)
- CodeEvolve (Inter & co.; arXiv 2510.14150; preprint, versions v1–v5). v1 used weighted Gemini 2.5 Flash/Pro ensemble, 80/20 sampling favouring Flash for cost. An appendix ablation (Qwen3-Coder-30B) column "Gemini-2.5 Flash/Pro" on CirclePacking n=26: 2.63597 vs 2.63598 full config (negligible). Search snippet found no dedicated ensemble vs single-model isolation; later versions shift to open-weight models and say no single component suffices. [secondary, search summary; paper pages not opened] — [arXiv pdf](https://arxiv.org/pdf/2510.14150)
- Multi-LLM AB-MCTS on ARC-AGI-2 public eval (120 problems, budget 250/problem, Pass@k) [read; already in prior survey scope, included for control detail]: repeated sampling o4-mini ≈23%; single-model AB-MCTS o4-mini 27.5%; Multi-LLM AB-MCTS (Gemini-2.5-Pro + DeepSeek-R1-0528, o4-mini pool membership unclear in text) >30%. Model choice: each node gets a GEN child per LLM, Thompson sampling within/among them. NOT compared against repeated sampling over the same model set; DeepSeek-R1-0528 alone was lower. A rule-based Pass@2 selector gave only 19.2% vs >30% oracle Pass@k. — [arXiv html](https://arxiv.org/html/2503.04412v5)
- AlphaResearch (Yu et al., incl. Arman Cohan; arXiv 2511.08522; preprint): uses a simulated peer-review reward model plus execution reward on open-ended algorithm problems; claims to beat AlphaEvolve on circle packing and other agentic discovery systems on 6 of 8 problems. [abstract only] — [arXiv](https://arxiv.org/abs/2511.08522). This is a separate evaluator-model idea; no ablation numbers seen.

### Inferences
- Common design pattern (fast cheap model for volume, strong model for occasional high-value proposals) is asserted by AlphaEvolve and CodeEvolve but never shown with numbers against best-single-model in the pages I read.
- Learned model choice (bandit) appears in ShinkaEvolve and AB-MCTS (Thompson); the evidence for its benefit is small and unquantified in text.

### Gaps
- Numeric Fig 9 values (ShinkaEvolve), AlphaEvolve Fig 8 values, CodeEvolve Section 5.4 / Appendix B.2 not obtained. OpenEvolve, FunSearch, AI co-scientist (Elo vs tournament) not researched.

## (c) Mixed models in leaderboard entries: gain over best single model

### Takeaway
I found only vendor and secondary accounts, none with a same-attempt-count control against the best single model. Augment: 65.4% with Claude 3.7 solver + o1 ensembler (vendor), later 70.6% single pass with Sonnet 4 and no ensembling (vendor), showing model upgrade outweighed ensembling.

### Cited Findings
- Augment Code (vendor blog; 2025): SWE-bench Verified 65.4% using Claude Sonnet 3.7 as the core agent and OpenAI o1 as ensembler (5-pass majority voting per later description); thinking mode and a "fix regressions" agent reported not to help. In May 2025 they said Sonnet 4 raised their single-pass score from 60.6% to 70.6% without ensembling. [vendor claim; secondary search summary, blog page itself not opened] — [Augment blog](https://www.augmentcode.com/blog/1-open-source-agent-on-swe-bench-verified-by-combining-claude-3-7-and-o1)
- Trae Agent (arXiv 2507.23370, ByteDance; preprint): reports Pass@1 75.20% on SWE-bench Verified; a separate third-party case study describes 70.6% combining Claude 3.7, Gemini 2.5 Pro and o4-mini with generation/filtering/voting. The two scores conflict in the sources; leaderboard not checked. Trae's study also reports that with o1 as selector (Augment approach) performance first improved with candidate pool size. [secondary] — [Trae Agent](https://arxiv.org/html/2507.23370v1)
- CodeMonkeys (arXiv 2501.14723): selection over the top four leaderboard entries as of Jan 2025 reached 66.2%, above the best member [secondary via search summary; already covered by earlier survey].
- Leaderboard profiling study (arXiv 2506.17208, "Dissecting the SWE-Bench Leaderboards"): top results are often achieved by combinations of multiple LLMs [secondary summary; not opened].
- CodeSweep (SWE-bench experiments PR dated 2025-12-09; Hashnode post "Mixture of Open-Weight Models with Iterative Patch Generation Improves Performance on SWE-bench"): three open-weight models (one is Qwen3 Coder 480B A35B), earlier patches from several models fed into later rounds; the resolve rate and comparison to single models were not retrieved. Vendor claim, unverified. — [PR mirror](https://gh.ali360.cloudns.ch/SWE-bench/experiments/pull/385)
- Zencoder: four distinct agents per task for 70% on Verified (vendor blog; found only on a mirror; treat with caution). — [Zencoder](https://zencoder.ai/blog/zencoder-emerges-leader-swe-bench-70-percent-success-rate)

### Inferences
- Where a stronger model release arrives, it dominated mixing gains in Augment's own numbers (60.6 → 70.6 single-pass).

### Gaps
- Nemotron-CORTEXA, Refact, Warp, SWE-bench Pro / Terminal-Bench / MLE-bench / ARC Prize entries: not found or not searched; no controlled "N attempts of one model vs N across models, same selector" source found.

## (d) Diversity of configuration vs diversity of model; limits of resampling

### Takeaway
TUMIX shows prompt/tool-strategy diversity on a single model helps (about +2 to +5 points average over single-agent-type) but never tests model heterogeneity. Resampling is capped by verifier quality ("Limits of Inference Scaling Through Resampling").

### Cited Findings
- TUMIX (Chen et al., Google; arXiv 2510.01279; preprint; vendor). 15 pre-designed agents per round, one LLM (Gemini-2.5-Pro/Flash), 3 runs [read]. Pro: TUMIX 15 agents HLE 32.3 / GPQA 87.9 / AIME 96.7 (avg 72.3); TUMIX-Three 70.7; TUMIX-Single (one agent type, same sample count) 70.0; Self-MoA-style best-agent selection 69.8. Flash: 60.6 vs 55.6 vs 54.9. LLM-judged early stopping (min 2 rounds) uses ~49% of inferences, ~46% of token cost. Abstract: up to +3.55% over best baseline at near-equal cost. Not coding benchmarks (HLE/GPQA/AIME). No heterogeneous-model arm. — [arXiv html](https://arxiv.org/html/2510.01279)
- The Limits of Inference Scaling Through Resampling (Stroebl, Kapoor, Narayanan; arXiv 2411.17501, v3 Mar 2026; preprint) [abstract]: with an imperfect verifier (e.g. unit tests with false positives), resampling cannot reduce the false-positive probability, so accuracy has a ceiling; a weaker model cannot match a stronger model's single-sample accuracy by resampling; on HumanEval/MBPP single-sample accuracy correlates with false-positive rate and optimal sample count is often <10. (This is the paper the task calls "Inference Scaling fLaws"; figure values beyond the abstract not seen.) — [arXiv](https://arxiv.org/abs/2411.17501)
- Archon (Saad-Falcon et al., Stanford; arXiv 2409.15254, ICML 2025) [abstract]: architecture search over inference-time techniques with a set of available LLMs; designs outperform o1, GPT-4o, Claude 3.5 Sonnet by 15.1% average across instruction-following, reasoning and coding. Per-model breakdown, benchmarks and cost not seen. — [arXiv](https://arxiv.org/abs/2409.15254)

### Inferences
- Controlled model-diversity vs configuration-diversity comparison on coding does not appear in what I found; TUMIX answers only the configuration side.

### Gaps
- Cost in dollars per task for search methods: reported only in Large Language Monkeys (above) and not for AB-MCTS (calls only), AIRA-dojo (24 h GPU-time), SWE-Search (iterations ≤100; dollars not read), ShinkaEvolve (not reported). Failed-attempt-as-hint across models: only CodeSweep's claim, no measurement.

## Synthesis lists

### (1) Strongest-evidence methods for an API-only harness (given only what I verified)
1. Many cheap samples + test-based selection (Large Language Monkeys): 5 cheap samples beat 1 expensive sample at 3.6-4.7x lower cost on SWE-bench Lite (oracle coverage metric; requires a good selector; cap per Stroebl et al.).
2. A strong-model ensembler/selector over a few candidates (Augment o1 over 5 Sonnet 3.7 passes; vendor claim; model upgrade later beat it).
3. Improve step operators/prompts before changing search policy (AIRA-dojo).
4. Configuration diversity (different prompts/tools) on one model with early stopping (TUMIX; non-coding tasks, so weak transfer).
5. Value-model plus debate discriminator for choosing among candidates (SWE-Search: 73% → 84% selection accuracy; old models).

### (2) Promising but not surviving equal-budget / replication in what I read
- MCTS/evolutionary search over greedy with default operators (AIRA-dojo: no gain).
- AB-MCTS over repeated sampling on ARC-AGI at 128 calls (loses; wins only at larger budget).
- Reward-model / majority vote scaling past ~100 samples (plateau).
- Multi-LLM AB-MCTS: no same-model-set repeated-sampling control; unverified.

### (3) Open questions
- Does a cheap-breadth/strong-depth model split beat the best single model at equal dollars on SWE-bench-style agents? No controlled study found.
- Does bandit model choice beat fixed mixing by a meaningful margin (ShinkaEvolve figures not extracted)?
- Do search gains survive when the baseline is best-of-N with the same selector at equal dollars?
- Does passing one model's failed patch to another help (CodeSweep claims, unmeasured here)?
- Unresearched: LATS, CodeTree, RethinkMCTS, MLE-STAR, OpenEvolve, co-scientist, CORTEXA/Refact/Warp, 2026 leaderboard entries.

## Second pass (gaps closed)

Method note: ~35 further tool calls. Figures marked [read] came back from the paper's HTML full text via a summarising fetch tool (quoted sentences only where the tool returned them); [secondary] = search summary or third-party page; [abstract] = abstract only; "vendor" = lab or company self-report. Primary leaderboards (tbench.ai, Scale, ARC Prize, MLE-bench, SWE-bench) were NOT opened directly; board numbers come from aggregators and are flagged.

### 1. Leaderboard entries that mix models

#### Takeaway
No source found gives a gain-over-best-single-model figure at equal attempt count for any leaderboard entry. Mixed-model entries exist (Augment, Refact, CORTEXA, Trae) but in every case where a same-pool comparison exists (Trae Agent Table 1, below) the mix did not beat the best single model.

#### Cited Findings
- Trae Agent (ByteDance; arXiv 2507.23370; preprint; vendor-authored). Candidate generation with Gemini 2.5 Pro, Claude 3.7 Sonnet and GPT-4.1 (the tool reported GPT-4.1, not o4-mini; an earlier secondary account naming o4-mini seems wrong). Table 1 Pass@1, ensemble size 3 [read]: Gemini 62.27%, Claude 66.40%, GPT-4.1 59.00%, round-robin Mixture 65.67%; Mixture oracle 73.40% (highest column). "Among them, Claude 3.7 Sonnet demonstrated the best performance" and Mixture "does not beat Claude alone". Selector ablations [read]: "Trae Agent achieves an average improvement of 4.08% over Trae AgentA [selector replaced by Augment's]"; "outperforms Trae AgentwoM by an average of 4.14%" (isolates majority voting). Pass@1 improvement over baselines "ranging from 5.83% to 14.60%" across ensemble sizes 1-10. The headline "75.20%" is cited from a leaderboard snapshot and the paper does not say which model configuration produced it. Cost not reported in what I read. — [arXiv html](https://arxiv.org/html/2507.23370v1)
- Nemotron-CORTEXA (NVIDIA; ICML 2025; vendor + peer reviewed). 68.2% on SWE-bench Verified at "$3.28 in LLM inference calls per problem" (cites CodeMonkeys ~$4.6, CodeStory ~$20). Repair: "we generate 7 patches per problem instance with the o3 model"; judges: "o3 and o3-mini"; "the 7 candidate patches contain correct repairs in 75% of problems". File localisation by a fine-tuned 7B embedding model (NV-EmbedCode); entity localisation LLM unnamed. The page contains NO ablation of multiple LLMs vs one; the earlier secondary claim of a multi-LLM localisation ensemble was not confirmed from the primary page. So CORTEXA is essentially single-vendor (o3 family) with prompt/format diversity. — [NVIDIA page](https://research.nvidia.com/labs/adlr/cortexa)
- Refact.ai (vendor blogs, found via search; secondary). Lite 60.0% (Claude 3.7 + o4-mini for a generate/critique/refine reasoning step); Verified 70.4% (Claude 3.7; o4-mini used to summarise debug info) and later 74.4% (claude-4-sonnet and o4-mini listed in submission metadata; o4-mini role unconfirmed). One write-up said they "tried the o4-mini and o3 models and found no obvious differences on a small subset of tasks". So the second model is a helper, not a voting pool. No single-model ablation found. — [Refact blog](https://refact.ai/blog/2025/1-agent-on-swe-bench-verified-using-claude-4-sonnet/)
- Warp (vendor; tbench.ai news): 52% on Terminal-Bench core v0.1 in mid-2025, "9% gain over the previous state of the art" per vendor. A secondary page says the agent is a composition of different models but I found no source naming the mix or giving a single-model control. Terminal-Bench boards later (secondary aggregator copy of tbench.ai, 27 Apr 2026): Codex on GPT-5.5 82.0%, ForgeCode on GPT-5.4 81.8%, TongAgents on Gemini 3.1 Pro 80.2%; same model appears with several agents; top closed-harness entry ~30 points above best open-harness (OpenHands 51.9%). Other aggregator pages conflict (e.g. BenchLM 91.9% vs 82%). All top rows I saw are single-model. — [Codesota](https://www.codesota.com/benchmark/terminal-bench), [tbench.ai Warp note](https://www.tbench.ai/news/warp-sota)
- CodeSweep (SWE-bench experiments PR dated 2025-12-09): score NOT retrieved. Both the Hashnode page and blog.codesweep.ai returned only the excerpt "a mixture of open-weight models, combined through an iterative process, can outperform any single model". Still unconfirmed. — [Hashnode](https://hashnode.com/@codesweep)
- SWE-bench Pro (Scale): search found no multi-model entry. Scale public board (aggregator copy, 17 Oct 2026): Muse Spark 1.1 61.50±3.10; top rows are mini-swe-agent runs (single-model); vendor-reported figures of ~88-90% from other aggregators are not comparable (different harness). Not verified on labs.scale.com. — [developersdigest](https://www.developersdigest.tech/benchmarks/swe-bench), [morphllm](https://www.morphllm.com/swe-bench-pro)
- SWE-bench Verified saturation analysis ("Coding Agents Have Converged", Liu et al., arXiv 2609.17394, 15 Sep 2026, ADMA 2026; preprint): audit of 254 submissions without rerunning. "On Verified, the leading two entries each resolve 396 of 500 instances." "The top ten share 285 successes and 51 failures, leaving 164 instances that distinguish their outcomes." Median nesting 0.935 vs 0.774 score-implied baseline; McNemar tests separate none of 29 adjacent top-thirty pairs on Verified. Implied top-ten union of 449/500 (89.8%) vs best 396 (79.2%) is MY derivation, not in paper. — [arXiv](https://arxiv.org/abs/2609.17394)
- MLE-bench (aggregator copy, secondary): official board frozen to new submissions (README note, Apr 2026); Famou-Agent 2.0 (Gemini-3-Pro-Preview) 64.44±1.18 any-medal on 75 tasks (17 Oct 2026); a "Disarray ensemble" at 77.78±0.44 (PR #118, 2026-02-03) flagged as using test-set feedback, so not comparable. Not opened at the source. — [developersdigest](https://www.developersdigest.tech/benchmarks/mle-bench)
- ARC Prize 2025 (technical report, arXiv 2601.10904; ARC Prize org; primary for the competition). Kaggle winners on ARC-AGI-2 private set: NVARC 24.03%, ARChitects 16.53%, MindsAI 12.64%; top score "at a compute cost of $0.20 per task". NVARC builds on test-time training with synthetic data; these are fine-tuned small models, not API model mixes. Grand Prize (85%) unclaimed. Verified "Model Refinements" category: Poetiq's Gemini 3 Pro harness 31% at $0.81/task → 54% at ~$31/task (report); same approach with Claude Opus 4.5 "rival[s] Gemini 3 Pro" at ~$60/task. The report "does not say whether commercial harnesses mix multiple models". Berman: "an evolutionary search harness" with explore-then-verify, no figures in the report. Secondary: Berman's Substack gives Grok-4, 79.6% ARC-1 at $8.42/task and 29.4% ARC-2, up to 40 candidate instructions per task (his own post, vendor-style self-report); a thread comment claimed a later Berman approach combined several models (unconfirmed). Poetiq later self-reports GPT-5.2 X-High up to 75% on ARC-AGI-2 PUBLIC eval at <$8/problem (self-report, public set, not verified semi-private). — [ARC report](https://arxiv.org/html/2601.10904), [Berman](https://jeremyberman.substack.com/p/how-i-got-the-highest-score-on-arc-agi-again)

#### Inferences
- Where a same-pool control exists (Trae), cross-model mixture ≈ best single model for the selected answer, with the benefit only in the oracle ceiling.
- Largest validated gains on ARC come from refinement harnesses on one model (Poetiq +23 points at ~38x cost per task), not model mixing.

#### Gaps
- CodeSweep score; Warp's actual model mix; ARC 2026 results; any verified multi-model entry on SWE-bench Pro/Terminal-Bench with a single-model control.

### 2. Controlled N-from-one vs N-across-models comparisons

#### Takeaway
Only DEI (agents, not models) and Trae (models, small) come close, and they point in opposite directions: different agents/scaffolds have much higher union than repeated runs of one scaffold, but a mixed model pool does not beat the best member under a real selector. No SWE-bench paper found reports union of several models vs repeated runs of one model with matched N.

#### Cited Findings
- DEI (Zhang et al.; arXiv 2408.07060; ICLR 2025; SWE-bench Lite). [read] Union@10 for 10 different agents 54.3%; Average@10 26.6%; Intersect@10 4.7%; repeated runs of one agent Union@10: Agentless 34.7%, Aider 38.0%, Moatless 35.3%. Quote: "different agents resolve more distinct issues than different runs of a single agent." DEI selection (gpt4o reviewer, 10 votes) 35.7% at k=10 (+9.1 over average); DeiBase-Open 34.3% vs 27.3% best single open agent; best committee 55.0%. Backends vary (gpt4o, Claude 3.5 Sonnet, gpt-4-1106, Claude 3 Opus), "no controlled comparison of same-model vs different-model agents", so scaffold vs base-model diversity is confounded. Cost not reported. — [arXiv html](https://arxiv.org/html/2408.07060v1)
- CodeMonkeys (Ehrlich et al., arXiv 2501.14723). [read] "Selecting over an ensemble of edits from existing top SWE-bench Verified submissions obtains a score of 66.2%" vs best member (Blackbox AI Agent) 62.8%; random selection from the same ensemble 60.9%; "The ensemble, with five samples per problem, has a combined coverage of 80.8%" (pass@5 oracle, so not comparable to a pass@1 figure). Own pipeline: selection with top-3 filtering "closing approximately half of the gap between random and oracle" (45.8% random, 57.4% selected, 69.8% oracle); total "approximately 2300 USD" for 500 issues (~$4.6/issue, my arithmetic); Qwen2.5-Coder-32B (local) used only to scan files for relevance; Claude 3.5 Sonnet for tests, edits and selection; DeepSeek-V3 (Appendix A) reaches 86.8% of Claude's majority-vote score at lower cost. — [arXiv html](https://arxiv.org/html/2501.14723)
- ModelSwitch (arXiv 2504.00762; preprint): splitting a fixed sample budget across models with voting and early stop beats single-model self-consistency, MATH-type tasks only: MathBench 72.7→79.7 at budget 16 vs Gemini 1.5 Flash self-consistency 75.3; 34% fewer samples on average. No code benchmark. [read] — [arXiv html](https://arxiv.org/html/2504.00762v1)
- Self-MoA (arXiv 2502.00674): one-model repeated samples beat mixed models in many MoA settings [secondary here; covered by earlier survey].
- Multi-LLM Orchestration for code generation (arXiv 2510.01379; preprint). [read] Five LLMs (Claude 3.7 Sonnet, Gemini 2.0 Flash, GPT-4o, Grok 3, Qwen 2.5 72B), 4,640 problems on HumanEval-X, EffiBench-X, BigCodeBench, APPS; preliminary study (3 models, 164 problems, greedy): per-stage cross-model pipeline Python 98.17% vs best single-model pipeline 97.56% vs ensemble 97.56%; Rust 85.98% vs 84.15% vs 84.76% — about 1-2 problems, single run. — [arXiv html](https://arxiv.org/html/2510.01379v3)
- SWE-agent paper (secondary): six GPT-4 runs on SWE-bench Lite each 17-18.7%, pass@k ~17.9% at k=1 to ~32.7% at k=6 [secondary].

#### Inferences
- Gap in evidence: the union ceiling from diverse systems is much higher than from repeats, but selector error (CodeMonkeys: half the random-to-oracle gap closed) eats most of it.

#### Gaps
- No controlled experiment with fixed N, fixed selector, one model vs several models on SWE-bench; Trae's Table 1 is the nearest (N=3, small).

### 3. Full text: Limits of resampling; Archon

#### Cited Findings
- Stroebl, Kapoor, Narayanan, "The Limits of Inference Scaling Through Resampling" (arXiv 2411.17501 v3, Mar 2026; preprint) [read]. Models: Llama-3.1 8B/70B, Code Llama 7B/13B, Cohere Command (+Light), Phi-3, GPT-4o; HumanEval+ and MBPP+ with original tests as verifier; "at least 200 samples per task and model on HumanEval+", "50 on MBPP+", temperature 0.8; 350 MBPP+ tasks after exclusions, 14 HumanEval+ tasks excluded. "Models below the cutoff line are unable to match GPT-4o through resampling." "Weaker models exhibit a higher probability of producing false positives." "at a cost-benefit ratio of 4, the optimal number of samples is K≤5 for all four models." "even at zero computational cost, there is a finite optimal number of samples." Simulation (Llama 3.1 8B params): optimal K≤3; at 10x cost ratio K=0 for almost all models. No dollar costs; no pooled cross-family result. Caveat: tests are HumanEval/MBPP-level (weak verifiers), 2023-24 models. — [arXiv html](https://arxiv.org/html/2411.17501)
- Archon (Saad-Falcon et al.; arXiv 2409.15254; ICML 2025) [read, first ~100k chars]. Table 1 per-benchmark values are given in source order with lost headers, so only headline claims reproduced: "11.2% average improvement over SOTA open-source approaches"; "15.1% average improvement over closed-source LMs"; all-source: 10.9% over single-call LLMs and 8.6% over inference-time frameworks. Cost: single-call GPT-4o/Claude/Llama-405B $0.01/query; MoA 19 calls $0.06; o1 112 calls $0.52; Archon closed-source 32-40 calls $0.44-0.49; all-source 35-39 calls $0.32-0.37; open-source 35-44 calls $0.12-0.15. Ablations: Generator repeated sampling +9.3%, adding ensemble models +18.5%; "ensembling and fusion across 8 different 70B models is 'generally more effective' than repeated sampling of the top model at a fixed budget" (Fig 4 caption); Fuser +8.9%; Ranker +10.8% over random, within 2.7% of oracle; Critic +11.5; Verifier +8.4; unit-test generator +7.4; 7B-only Archon beats best 7B by 7.5%. Coding: "Ensembling, fusion, and ranking had limited impact on CodeContests"; unit tests plus sample scaling raised Pass@1 17.9% → 29.3%; the paper's text gives GPT-4o "40 to 58 of 140" which is inconsistent with its table (18.1%). Not coding-specific (instruction following, reasoning), 2024 models; SWE-bench not evaluated. — [arXiv html](https://arxiv.org/html/2409.15254)

#### Inferences
- Archon is the only paper here with a stated model-diversity-vs-resampling ablation, and on code that benefit was "limited"; verification (tests) mattered instead.

#### Gaps
- Archon Tables 5/6/9/34-35 and appendices past 100k chars not read.

### 4. LATS, CodeTree, RethinkMCTS, MLE-STAR

#### Cited Findings
- LATS (Zhou et al., arXiv 2310.04406; ICML 2024) [read]. HumanEval pass@1: GPT-3.5 LATS(ReAct) 83.8 vs Reflexion 68.1, ReAct 56.9; GPT-4 LATS 92.7 vs Reflexion 91.0 vs base 80.1. n=5 samples per expansion, 8 iterations, 4 synthetic tests. No equal-budget repeated-sampling comparison on HumanEval; token cost only on HotPotQA (~173k for LATS). Baselines on 161 questions vs LATS 164. Single model, no evaluator model difference. — [arXiv html](https://arxiv.org/html/2310.04406)
- CodeTree (Li et al., Salesforce/UT Austin; arXiv 2411.04329; NAACL 2025) [read]. GPT-4o pass@1: HumanEval 94.5, HumanEval+ 86.0, MBPP 98.7, MBPP+ 80.7, CodeContests 43.0 (avg 80.6) vs Reflexion avg 79.7 and "Resample" avg 76.9; CodeContests Resample 32.7, Reflexion 41.8. Paper says "same generation budget in all methods" (20 samples per task) and claims a "22.4% gain over Resampling" that does not match its own table (~10.3 points). Resample uses visible-test filtering, best of 2 runs while others one run. SWE-bench (GPT-4o-mini, Agentless): 24.2 → CodeTree 27.6 (Reflexion 25.3); no variance. Ablation of Critic tasks: 94.5/84.8 full vs 91.5/81.7 without solution verification. Critic model identity not stated. — [arXiv html](https://arxiv.org/html/2411.04329v2)
- RethinkMCTS (Li et al.; arXiv 2409.09584, v2 Oct 2025): abstract only: "outperforms previous search-based and feedback-enhanced code generation baselines"; no figures read. [abstract] — [arXiv](https://arxiv.org/abs/2409.09584)
- MLE-STAR (Google; arXiv 2506.15692; vendor) [read]. MLE-bench Lite 22 tasks, 3 seeds, Gemini-2.0-Flash default: any-medal 43.9% vs AIDE (same model) 25.8%; with Gemini-2.5-Pro 63.6%; AIDE o1-preview 36.6%, gpt-4o 18.6%. Ensemble ablation (Gemini-2.0-Flash): no ensemble 37.9%, best-of-N 42.4% (gold 28.8%), average ensemble 43.9% (gold 25.8%), proposed ensemble 43.9% (gold 30.3%). So its own ensembling of candidates is nearly equal to best-of-N on any-medal (+1.5 points) and mostly improves gold. Single model family (Gemini); Claude Sonnet 4 on 4 competitions only. Cost not reported (24h limit). — [arXiv html](https://arxiv.org/html/2506.15692)

#### Inferences
- Of the four, only CodeTree and MLE-STAR report some resample/best-of-N baseline, and gaps over it are modest (CodeTree CodeContests ~10 points over a weak Resample; MLE-STAR +1.5 any-medal).

#### Gaps
- RethinkMCTS full-text numbers; LATS code results beyond HumanEval.

### 5. Evolutionary systems: text on model mix; 2026 follow-ups

#### Cited Findings
- ShinkaEvolve full-text read (to ~100k chars): ensemble models in the circle-packing config: claude-sonnet-4, o4-mini, gpt-4.1-nano, gpt-4.1, gpt-4.1-mini; Fig 9 values not in text; caption "slightly improves" vs body "significantly outperforms"; 150 generations, 2 islands. Secondary summary: fixed ensemble gave "moderate" improvement over single GPT-5-nano and bandit the highest. — [arXiv html](https://arxiv.org/html/2509.19349v1)
- AlphaEvolve: text only says Flash gives throughput and Pro occasional higher quality; ablation "small base LLM only" is a curve, no figure in text. — [arXiv html](https://arxiv.org/html/2506.13131)
- CodeEvolve (arXiv 2510.14150, later versions; EMNLP 2026 Findings per secondary) [read, ~100k chars]. Default now "FLASH with 60% probability and PRO with 40%" (v1 had 80/20). "In the simplest case, the ensemble consists of a single LLM" but "reports no matched results" for Flash/Pro vs single; no weight ablation. Matched-budget vs OpenEvolve and ShinkaEvolve (Qwen3-Coder-30B, 3 runs): "CodeEvolve achieves the best solution in 6 of 9 problems", e.g. CirclePacking n=26 mean 2.63576 vs OpenEvolve 2.54962 vs Shinka 2.47568; n=32 2.93751 vs 2.84897 vs 2.53205 (these are evolution-framework comparisons, not model-mix). Cost: Qwen3-Coder-30B run ~$6.2 vs Gemini-2.5 run ~$34.5 on CirclePacking n=26 (SecondAutocorr $27.2 vs $66.7). — [arXiv html](https://arxiv.org/html/2510.14150)
- MadEvolve (arXiv 2602.15951, Feb 2026; preprint; cosmology algorithms) [read, ~100k chars]. Seven models across four runs (Gemini 3 Pro Preview, GPT-5.2, o4-mini, Gemini 2.5 Pro, Gemini 3 Flash Preview, GPT-5, Gemini 2.5 Flash), heterogeneous ensemble over five islands, UCB bandit; "which we found to be more effective than fixed weights" but "no comparison data is shown"; no single-vs-ensemble ablation. Per-model: "27.9% for frontier models versus 26.3% for lightweight models" aggregate improvement rate; Gemini 3 Flash Preview "highest success rate (89.5%) and highest improvement rate (32.9%)"; different models produced the best algorithm in each of four tasks. Cost in dollars not reported. — [arXiv html](https://arxiv.org/html/2602.15951)
- OpenEvolve: weighted-ensemble default, no controlled ablation found; practitioner anecdotes only [secondary]. FunSearch and AI co-scientist: not obtained (co-scientist abstract page had no Elo or ablation numbers; full PDF not read).

#### Inferences
- Frontier vs lightweight models contribute similar improvement rates in MadEvolve, which supports "cheap model for volume", but this is not controlled against a single model.
- Across ShinkaEvolve, AlphaEvolve, CodeEvolve and MadEvolve, no paper isolates two-model vs best-single-model with numbers in text.

#### Gaps
- FunSearch, co-scientist numbers; Fig 9 and AlphaEvolve Fig 8 values.

### 6. One model's failed attempt as hint for another

#### Cited Findings
- Multi-LLM Orchestration (2510.01379) [read]: faulty code is forwarded to a debugging agent that may be a different model; "the selected LLM never receives the full evaluation test cases or the testing feedback"; rejected patches are discarded, not chained. Only the aggregate pass@1 comparison above, no isolation of the hand-off effect.
- Olausson et al. self-repair (secondary): gains from self-repair are modest and largest when a stronger model repairs a weaker model's drafts (HumanEval, APPS; Code Llama/GPT-3.5/GPT-4) [secondary, not opened].
- 2026 preprints surfaced by search, not opened: cross-model code review (arXiv 2607.21656) and PhoenixRepair (2607.18859; single model per run, DeepSeek-V3.1 61.2%→66.0% on Verified, secondary). Blog anecdote of 39→85-90 problems after three cross-model rounds: no methodology, not used.
- CodeSweep claims cross-model patch signals improve later rounds (score unretrieved).

#### Gaps
- No controlled SWE-bench measurement of cross-model failed-patch handoff found.

### 7. SWE-Search cost appendix [read]

- Appendix I, Table 3 "Cost comparison (USD) between Moatless-Adapted and SWE-Search" (totals, task count not stated): GPT-4o $576.00 vs $40.86 (≈14x); GPT-4o-mini $52.34 vs $9.90; DeepSeek-V2.5 $18.37 vs $3.66; Qwen-2.5-72B $42.50 vs $8.50 and Llama-3.1-70B $45.00 vs $9.00 (the last two estimated).
- Appendix J, Table 4 equal-sample comparison, Pass@5: "SWE-Search Pass@5 uses the 5 generated answers in 1 run" while Moatless-Adapted uses 5 separate runs. SWE-Search vs Moatless-Adapted: GPT-4o-mini 22.3 vs 17.0, Qwen-2.5-72B 25.7 vs 22.3, DeepSeek-V2.5 23.3 vs 22.0, Llama-3.1-70B 22.3 vs 21.7; GPT-4o baseline skipped for cost. SWE-Search costs about 5x (open models) to 14x (GPT-4o) the baseline per run, so per-dollar the 5-run baseline (5x cost) is the fair comparison, which was not made for GPT-4o. Value-function model still unnamed. — [arXiv html](https://arxiv.org/html/2410.20285)

## Updated closing lists

### (1) Strongest-evidence methods for an API-only harness
1. Many samples from a cheap model with test-based selection (Large Language Monkeys), bounded by verifier quality (Stroebl et al.: optimal K often ≤10 with weak tests).
2. A strong-model selector or judge over a handful of candidates (Augment o1 over Sonnet, CORTEXA o3/o3-mini judging 7 o3 patches; Trae majority vote +4.1 over Augment selector) — selector gains are real, but CodeMonkeys shows selectors close only about half the random-to-oracle gap.
3. Scaffold/prompt diversity for candidate generation (DEI union 54.3% vs 34.7-38.0% for repeated single-agent runs; TUMIX on non-code tasks) — confounded with base model in DEI.
4. Improve operators and add execution verification before choosing a search policy (AIRA-dojo; Archon unit tests 17.9→29.3 on CodeContests).
5. Single-model refinement harnesses with a feedback signal (Poetiq 31→54 on ARC-AGI-2 at ~38x cost; verified by ARC Prize).
6. A cheap local/small model for scanning or relevance with a strong model for edits (CodeMonkeys), cost-saving rather than accuracy-raising.

### (2) Promising but not surviving equal-budget or control comparison
- Cross-model mixture pools under a real selector (Trae Table 1: Mixture 65.67 vs Claude 66.40); orchestration gains of 1-2 problems (2510.01379).
- MCTS/evolutionary policy over greedy with default operators (AIRA-dojo); AB-MCTS on ARC at 128 calls.
- SWE-Search at ~5-14x cost; equal-run comparison missing for GPT-4o.
- Ensembling/fusion for code (Archon: "limited impact" on CodeContests).
- MLE-STAR's candidate ensemble vs best-of-N (+1.5 any-medal).
- Unverified: bandit model choice (ShinkaEvolve, MadEvolve assert it beats fixed weights without data).

### (3) Open questions
- Equal-dollar, equal-selector test of N attempts from the best model vs N spread over several models on SWE-bench Verified/Pro; none found.
- Numeric effect of bandit model choice (ShinkaEvolve Fig 9; MadEvolve no data).
- Whether Warp's, CodeSweep's and Berman's multi-model claims hold against a single-model control.
- Cross-model failed-patch handoff measurement on SWE-bench.
- FunSearch and co-scientist ablations; official leaderboards (tbench.ai, Scale, ARC Prize, MLE-bench) were not opened directly.
