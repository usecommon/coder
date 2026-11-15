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
