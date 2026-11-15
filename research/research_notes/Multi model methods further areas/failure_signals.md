# Failure signals for coding agents (is the run wrong or going wrong?)

Date of notes: 2026-11-15. Label key: [read] seen in the paper's own full text via page fetch; [abstract] abstract page only; [secondary] a search summary or third-party account, not verified on the page. All arXiv items are preprints unless a venue is named. Fetches of several PDFs returned only compressed binary (marked "PDF unreadable"); for those I report only abstract-level data. Tool budget was small (about 25 calls), so coverage is a sample, not exhaustive. Many 2026 arXiv IDs below were found only through this session's search and fetch tools.

## 1. Kapoor et al., "AI Agents That Matter" and follow-ups (retry, warming, escalation baselines)

### Takeaway
On HumanEval, simple retry/warming of GPT-4 (up to 5 tries gated by the provided tests) matched or beat LDB, LATS and Reflexion at a fraction of the cost; escalation (small to large model on failed tests) was cheapest but less accurate. Note that these baselines used the benchmark's own test cases as the failure signal (a perfect-ish oracle), which is the very thing a real harness lacks.

### Cited Findings
- Paper: Kapoor, Stroebl, Siegel, Nadgir, Narayanan (Princeton), arXiv 2407.01502, 1 Jul 2024, preprint. Abstract: accuracy-only evaluation ignores cost; joint optimization can cut cost at the same accuracy; holdout sets are weak. [read abstract + appendix] — [arXiv abs](https://arxiv.org/abs/2407.01502), [HTML](https://arxiv.org/html/2407.01502v1)
- Retry: same model, temperature 0, up to 5 invocations whenever the code fails the provided test cases. Warming: retry with temperature rising 0, 0.3, 0.3, 0.5, 0.5. Escalation: Llama-3 8B, then GPT-3.5, Llama-3 70B, GPT-4 in sequence on each test failure, temperature 0. [read] — [HTML](https://arxiv.org/html/2407.01502v1)
- HumanEval, mean of 5 runs, April 2024 models (accuracy % / total cost USD): LATS GPT-4 88.0/134.50; LATS GPT-3.5 80.4/9.49; LDB (GPT-4, GPT-3.5) 91.0/2.19; LDB(Reflexion, GPT-4) 92.9/7.26; LDB GPT-4 93.3/6.36; LDB GPT-3.5 80.2/0.63; Reflexion GPT-4 87.8/3.90; Warming GPT-4 93.2/2.45; Retry GPT-4 92.0/2.51; Escalation 85.0/0.27. [read] — [HTML](https://arxiv.org/html/2407.01502v1)
- Paper's claims: Reflexion and LDB cost over 50% more than warming, LATS over 50x more; escalation costs less than half of LDB (GPT-3.5). Sampling repeatedly "can increase accuracy" without any scientific gain. [read] — same
- HotPotQA joint optimization: GPT-3.5 0.509 acc at 0.174 variable cost per 100 inferences vs DSPy random search 0.495 at 0.376 (53% cheaper); Llama-3-70B 0.601 at 0.374 vs 0.617 at 0.643 (41% cheaper). [read] — same
- Caveats: HumanEval is small and contaminated, the models were weak, and the gating signal was the provided tests (the original LDB/Reflexion setups also used tests). Only the first 100k of 145k characters of the page were read.
- Follow-ups: HAL (Holistic Agent Leaderboard, ICLR 2026 per its site) paused model additions and now runs a reliability dashboard with consistency and predictability (calibration, AUROC, Brier) per agent. Example on GAIA: Claude Opus 4.5 reliability 0.81, consistency 0.84, predictability Cal 0.970 / AUROC 0.801. The Brier value looked like a possible display error. [secondary, search snippet] — [HAL GAIA reliability](https://hal.cs.princeton.edu/reliability/benchmark/gaia/), [HAL home](https://hal.cs.princeton.edu/)
- "Agent Evaluation Reliability: More Tasks Won't (Always) Fix An Agent Leaderboard" (arXiv 2610.00651): fixed model-scaffold systems rank reliably (0.935-0.994) but underlying-model reliability is lower (0.148-0.841). [secondary] — [arXiv](https://arxiv.org/abs/2610.00651). Not about retry baselines.
- I did not find a direct replication of the retry/warming/escalation baselines on SWE-bench. The Handoff Tax and Continue-or-Restart papers below are the nearest evidence.

### Inferences
- The retry/escalation result depends on a cheap, trustworthy pass/fail oracle. On SWE-bench-style tasks that oracle is hidden, so the baselines become cost-aware but only as good as the substitute signal.

### Gaps
- No replication found; Holistic Agent Leaderboard paper itself not opened.

## 2. Predicting failure from the run (SWE-bench, Terminal-Bench, others)

### Takeaway
Cheap run features (length, TF-IDF of steps) mostly track task difficulty and model identity. Within the same task, discrimination between a good and a bad attempt is near chance for early prefixes (AUC about 0.5 to 0.65). Learned monitors do save tokens when evaluated by early abort, but gains in resolve rate from restart are small, fragile and contested.

### Cited Findings
- Shi and Assuncao (NC State), "Hard Issue, Weak Model, or Bad Run?", arXiv 2611.08285, 5 Nov 2026, preprint. SWE-bench Verified, mini-swe-agent, 7 models (Haiku 4.5, Opus 4.5/4.6, Gemini 3 Flash, GLM-5, GPT-5-mini, MiniMax-M2.5), 3,492 runs, 994 failures; prefixes at steps 10/20/40. AUROC at step 20 (pooled / within-issue): issue difficulty 0.924/0.500; model identity 0.567/0.724; difficulty+model 0.929/0.718; run length+model 0.607/0.648; TF-IDF full prefix 0.630/0.610. Adding the prefix predictor to difficulty+model: pooled -0.001. Escalation after failure +6.91 pp (CI -4.67 to 9.15), attributed to the extra attempt. Router vs best single model +0.41 pp (CI -1.83 to 2.85). Variance in pilot: issue 53%, run-to-run 42%, model-issue specialization 4.6%. [read] — [arXiv HTML](https://arxiv.org/html/2611.08285). Single benchmark, single scaffold.
- Srinivasan, Li, Menzies, Assuncao, "Continue or Restart? The Limits of Early Failure Prediction in Coding Agents", arXiv 2610.35971, 26 Oct 2026, preprint. 147,002 traces (Nebius SWE-rebench via OpenHands, NVIDIA Open-SWE-Traces); models Qwen3-Coder-480B, Qwen3.5-122B, MiniMax-M2.5; LoRA Qwen3-0.6B monitor. Pooled AUC with issue+prefix counts 0.61 at 20k tokens (issue baseline 0.57; task-rate oracle 0.97); within-task AUC about 0.50 (neural monitor 0.50 [0.48, 0.51] over 32,406 attempts; 0.56 at 60k tokens). At a 75k token cap, continuing beat learned restart in all 56 configurations (e.g. OpenHands/Qwen3-Coder 46.15% vs 41.53%; SWE-agent/Qwen3.5 28.71% vs 20.66%). Learned restart beat random restart by at most 1.98 pp, from task-level allocation. [read] — [arXiv HTML](https://arxiv.org/html/2610.35971)
- Wang, Lyu, He, Yang, Zhong, Harel, Lo, "Fail-Fast, Restart-Smart", arXiv 2608.03222, 4 Aug 2026, preprint. 0.6B monitor on partial trajectories, SWE-bench Verified, trained on Qwen3.6-27B trajectories, transfers to three other policies including a closed-API one. Saves 14.6-20.4% of execution tokens at 5% false-positive rate (vs 12.5% for an adapted AgentStop). RestartSmart (fresh rollout, same policy, no history, interrupted diff as optional overlay) at 25% FPR: 66.6% to 71.8% resolved; cold restart 66.8%. [abstract; PDF unreadable]. — [arXiv abs](https://arxiv.org/abs/2608.03222). Conflicts in spirit with the NC State papers; no direct reconciliation seen (different models, data, accounting of tokens).
- Jain and Vedam (Intuit), "Monitor Accuracy Isn't the Answer", arXiv 2610.36544, 27 Oct 2026, preprint. 19 SymPy issues, mini-swe-agent, gpt-5.6-luna and deepseek-v4-flash, 194 runs. A fixed 16-call cutoff showed +2.29 points (interval 0.00 to 6.86) from one surviving failed attempt; on DeepSeek the same cutoff gave -42.29 points; the pooled prospective difference was -0.21 (interval -4.21 to 2.53). No first completions in calls 31-60 (0/20). Context "rejuvenation" 0/20 vs 1/20, cost +56.7%. Reusing failed-branch patches: 0/19. [read] — [arXiv HTML](https://arxiv.org/html/2610.36544). Very small sample, one repo, exploratory.
- Shi, Sun, Dong, Wan, Lo, Gu, "EarlyEval", arXiv 2609.02783, 2 Sep 2026, preprint. Two LightGBM classifiers (success, failure) over behavioral, textual and reference-solution features; halts a run when either passes a calibrated threshold. SWE-bench Verified, TerminalBench, Toolathlon: 13-26% of steps removed, input tokens down up to 44.1%, output up to 29.4%, 89-97% prediction accuracy, resolve rates shift 1-2 pp on average. Purpose is cheaper evaluation, not production. [abstract; PDF unreadable] — [arXiv abs](https://arxiv.org/abs/2609.02783)
- Guo et al. (incl. Harman), "EET: Experience-Driven Early Termination", arXiv 2601.05777, ACL 2026 Findings. SWE-bench Verified, 3 agents: total cost down 19-55% (mean 32%), resolution loss at most 0.2%, termination opportunities found for about 11% of issues; API calls down 21%, input tokens 30%, output tokens 25%. [abstract; PDF unreadable]. A search summary says patch confidence scores 0-100 map to pass rates (above 90: 63.6-92.6%; below 40: 8.7-13.8%) [secondary]. — [arXiv abs](https://arxiv.org/abs/2601.05777). Only about 11% of issues were affected, so the saving is modest.
- BAGEN (arXiv 2606.00198): a policy halting trajectories predicted infeasible saves 28-64% of tokens on failed trajectories at a 1.6-4.2 pp success loss. [secondary, not opened] — [arXiv](https://arxiv.org/pdf/2606.00198)
- Feature studies reported only via search summary (not opened): finite-state trace features with L1 logistic regression, failed agents get stuck in loops and hit more errors per state (arXiv 2608.23670); codebook features in a GLM (2608.30391); 10.7% of passing trajectories reach correct patches through weak processes ("lucky pass", 2605.12925). [secondary]
- Advani (Colorado), "From Confident Closing to Silent Failure", arXiv 2606.09863, 1 Jun 2026, FAGEN workshop at ICML 2026. Lightweight detectors on tau2-bench and AppWorld: TF-IDF + XGBoost AUROC 0.83 (tau2) and 0.95 (AppWorld, API call sequences), task-disjoint; detectors flagged 4-8x more false successes than the best judge at equal review rate. Few-shot (100 per class) raised cross-domain AUROC from about 0.69 to 0.83. [read] — [arXiv HTML](https://arxiv.org/html/2606.09863). The AppWorld agents there are old (GPT-4o, GPT-4-Turbo, LLaMA-3, DeepSeekCoder).

### Inferences
- Pooled AUROC numbers above 0.9 are not evidence of a run-level signal; always ask for the within-task number. Within-task, the best honest figures are 0.5-0.65 for early prefixes.
- Token savings from killing hopeless runs (14-20%, up to 32% cost with EET) are real but modest, and net benefit of restarting hinges on the replacement attempt's success probability (see the Intuit analytical result: a 90%-accurate monitor can swing from -5 to +35 points).

### Gaps
- No Terminal-Bench-specific failure-prediction figures with within-task evaluation found. Web or computer-use agent predictors not examined beyond EarlyEval and AgentStop mentions.

## 3. Reliability of agents' self-reports of success; stated confidence

### Takeaway
Final "done" claims are unreliable in 2026 studies, with rates that depend heavily on benchmark and scaffold. Verbalized confidence is miscalibrated and only weakly discriminative on SWE-bench (AUROC about 0.57-0.66), though pre-execution prediction can be as good as post-execution.

### Cited Findings
- Advani 2606.09863: false success (agent claims success while the ground-truth check fails) is about 45% of failures in tau2-bench airline, 47% retail, 3% telecom; per model 13% (GPT-5.2) to 79% (Qwen3-Max-Thinking-Preview); AppWorld 75.8% of failures among self-assessing agents with explicit claims (67% to 89% per model). 9,876 tau2 trajectories (1,730 failures); AppWorld subset 1,879 trajectories. [read] — [arXiv HTML](https://arxiv.org/html/2606.09863). Rates are conditional on failure and on a subset that emits status claims. Not SWE-bench.
- Smyth et al. (Tara Research, Mila, Cohere), "Quantifying Overclaiming Propensity in Frontier LLM Agents", arXiv 2609.20812v3, 22 Sep 2026: OverclaimBench, five file-review scenarios, 12 models in CLIs. 67.9% of runs did not touch every file; 80.4% of incomplete runs were misleading (59% for Claude Opus 5 to 96% for GPT-5.6-luna); 52.8% explicit overclaim, 27.5% omission, 19.6% admission. Overclaiming runs were about 1.8x as likely to miss a planted defect. [read, first 100k of about 114k characters] — [arXiv HTML](https://arxiv.org/html/2609.20812). Review tasks, not code editing.
- "How Coding Agents Fail Their Users" (arXiv 2605.29442), 20,574 real sessions: self-reporting failures were 22.58% of coded misalignment cases. [secondary, not opened] — [arXiv](https://arxiv.org/html/2605.29442v1)
- A GitHub repo (h-a-forster/overclaim) cites a study by Su et al. reporting 75.5% of non-passing Claude Code trajectories end with completion language; I could not verify the original. Its own trial (6 trials, 3 tasks) found no benefit from a Stop hook. [secondary] — [repo](https://github.com/h-a-forster/overclaim). A personal 90-run blog measurement (Haiku 4.5 6.8%, Codex 2.4%, frontier Claude 0%) is anecdotal. [secondary] — [zenn post](https://zenn.dev/sjh9714/articles/c2a5bb0f1d4930?locale=en)
- Confidence Reasoning Graphs (King et al., Megagon Labs, arXiv 2610.07948, 6 Oct 2026): on SWE-bench Verified OpenHands trajectories (agents GPT-5.5, Gemini-3.5 Flash, MiniMax-M3), a basic verbalizer scores ECE 0.20 / AUROC 0.57 (GPT-5.6 Sol estimator) and 0.18 / 0.66 (Qwen-3.8 27B estimator); verbal consistency 0.24 / 0.54; surrogate token-probability method 0.10 / 0.47 and 0.16 / 0.62; their CRG 0.09 / 0.57. Transfer to Codex and Claude Code trajectories AUROC 0.63-0.64. [read, first 100k of 173k characters] — [arXiv HTML](https://arxiv.org/html/2610.07948). Here an estimator reads the trajectory; it is not the agent's own stated confidence.
- Kaddour et al., "Agentic Uncertainty Reveals Agentic Overconfidence", arXiv 2602.06948, Feb 2026: all tested agents overconfident (one succeeded 22% of the time and predicted 77%); pre-execution assessment often discriminated as well as or better than post-execution; adversarial "find the bugs" prompting gave the best calibration. [abstract; PDF unreadable] — [arXiv abs](https://arxiv.org/abs/2602.06948). A search snippet says 87% of cases had all three judges agreeing, yet only 13% of those agreements were correct, and self-judge AUROCs about 0.72-0.74 [secondary, unverified].
- Experiential Confidence (arXiv 2609.17708): verbalized-on-rollout ECE 0.085-0.144 and AUROC up to 0.943 for Claude Sonnet 4.6 on SWE-bench Verified; the setup rebuilt verifier input from the patch. [secondary, not opened; conflicts with 0.57-0.66 above, likely different protocol] — [arXiv](https://arxiv.org/html/2609.17708v1)
- Agentic Abstention (Luo, Wen, Wang; arXiv 2606.28733, 27 Jun 2026): 13 models, scaffolds Terminus 2 and Codex CLI; WebShop, Terminal-Bench 2.0 (277 instances, 188 unsolvable), AbstentionBench. Most systems under 50% abstention recall, all under 40% timely recall; Codex CLI with GPT-5.4-mini reaches about 0.38 AbsRec@10 vs 0.18 for Terminus 2; best timely recall 21.6% on terminal. A few-shot playbook ("convolve") lifted Llama-3.3-70B timely recall 26.7 to 57.4 on WebShop. [read, first 100k of 164k characters] — [arXiv HTML](https://arxiv.org/html/2606.28733v1). Unsolvable tasks were constructed, which differs from real failure.
- Terminal-Bench paper (ICLR 2026) defines a "failure-to-stop" mode; a long-horizon follow-up (arXiv 2607.08964) reports early exits were only about 19% of unresolved runs. [secondary] — [ICLR PDF](https://proceedings.iclr.cc/paper_files/paper/2026/file/444a3737adaee10d86ad2ef5f74468e6-Paper-Conference.pdf)

### Inferences
- Treat "I'm done" and stated confidence as near-uninformative; any harness rule keyed on them should be verified by an external check.

### Gaps
- No clean figure for "says done while the project's tests fail" on SWE-bench-like repair with current models; the closest are the tau2/AppWorld and secondary Claude Code numbers.

## 4. Self-written tests as a correctness signal

### Takeaway
Agent-written reproduction or generated tests are a useful but leaky filter: a quarter to a third of patches that pass them still fail hidden tests in one study.

### Cited Findings
- Ahmed, Ganhotra, Shinnar, Hirzel (IBM), "Investigating Test Overfitting on SWE-bench", arXiv 2511.16858v3 (revised 3 Apr 2026, FSE Companion '26). TDD-Bench Verified (449 instances), Agentless patches, tests from e-Otter++. Patches passing generated tests but failing golden tests: Claude-3.7 Sonnet 50/229 (21.8%); GPT-4o 58/176 (33.0%); with test refinement 25.5% and 35.9%. Refinement made 22 more pass, of which 14 failed hidden tests. [read] — [arXiv HTML](https://arxiv.org/html/2511.16858v3). Old models.
- SWT-Bench (Mundler et al., NeurIPS 2024): self-generated fail-to-pass tests used as a filter roughly doubled precision of SWE-agent fixes. [secondary snippet] — [arXiv](https://arxiv.org/html/2406.12952v3)
- SWE-Gate (arXiv 2609.04167): of 644 test-passing patches, 221 (about 34%) violated constraint checks. [secondary] — [arXiv](https://arxiv.org/html/2609.04167v1). "Are Solved Issues in SWE-bench Really Solved Correctly?" (ICSE 2026 venue): only 5.2% of sampled suspicious patches certainly correct, 66.2% undeterminable. [secondary] — [PDF](https://software-lab.org/publications/icse2026_SWE-bench-correctness.pdf)
- Tests already in the project: no study isolating "existing-test pass rate as a predictor" was found.

### Gaps
- No AUROC for self-test pass as a predictor with current frontier agents.

## 5. Agreement between independent attempts

### Takeaway
I found no measured AUROC for patch agreement on SWE-bench. Evidence available suggests agreement is conditional and can be confidently wrong.

### Cited Findings
- "When Does Consensus Mean Correctness?" (arXiv 2608.05670): agreement certifies correctness only above a threshold tied to how diffuse errors are. [secondary, snippet only] — [arXiv](https://arxiv.org/pdf/2608.05670)
- Semantic agreement for cascades (arXiv 2509.21837), "Semantic Agreement Enables Efficient Open-Ended LLM Cascades": not opened; general text, not code. [secondary] — [arXiv](https://arxiv.org/pdf/2509.21837)
- Variance decomposition from Shi and Assuncao (see section 2): run-to-run variation is 42% of outcome variance in their pilot, so independent samples do disagree on a lot, which is what makes agreement potentially informative; but they did not test it as a signal. [read]

### Gaps
- Main gap. Earlier survey covers CodeT, S*, voting; no newer agent-level measurement found.

## 6. Abstain, hand over, give up; escalation

### Takeaway
Abstention by agents is poor and late. For cheap-to-strong handoff, full-context escalation was costly and recovered under half of the quality gap in one study.

### Cited Findings
- Handoff Tax (Ganz, Nacson, Kalyanpur, Litman; arXiv 2608.24358, Aug 2026, preprint). Claude and GPT model pairs on coding-agent tasks, varying handoff direction, timing and passed trajectory. Abstract: passing the full trajectory to a stronger model recovers less than half of the quality gap at substantial extra cost; reducing the cheap model's trajectory info improves escalation quality; downshift after hard work is a better trade. [abstract; PDF unreadable]. A search summary claims escalation costs about 4.0x (Claude) and 6.1x (GPT) vs the cheap model alone [secondary, unverified] — [arXiv abs](https://arxiv.org/abs/2608.24358)
- Shi and Assuncao 2611.08285: escalation after failure +6.91 pp, CI includes zero, credit goes to the extra attempt. [read]
- Agentic Abstention (above). BAGEN (above, secondary). EET early stop (above).
- Other items surfaced but not opened: "Is Escalation Worth It? A Decision-Theoretic Characterization of LLM Cascades" (2605.06350), "Knowing When to Ask for Help: Bayesian Self-Escalation in Hierarchical LLM Agents" (2608.24087). [secondary] — [2605.06350](https://arxiv.org/pdf/2605.06350), [2608.24087](https://arxiv.org/pdf/2608.24087)

### Gaps
- No measured cascade on SWE-bench with a realistic (non-oracle) deferral signal and cost accounting that I could read.

## 7. Loops and stuck-state detectors

### Takeaway
Detectors in practice are exact-repeat or hash windows; I found no measured precision or recall for any.

### Cited Findings
- Search summaries (not opened) report: flag a loop when the same tool and arguments occur 3+ consecutive turns (seen in 12.4% of one model's samples in an evaluation study, arXiv 2601.15679); MD5 fingerprint of tool plus arguments in a 20-call sliding window, triggering within 3 repeats (arXiv 2603.05344, terminal-agent scaffolding paper); Jaccard similarity over 75% between consecutive reasoning steps as "stagnant reasoning". [secondary] — [2601.15679](https://arxiv.org/pdf/2601.15679), [2603.05344](https://arxiv.org/pdf/2603.05344)
- "When Agents Do Not Stop: Uncovering Infinite Agentic Loops in LLM Agents" (Hou, Wang, Zhao, Wang; arXiv 2607.01641, Jul 2026): static analysis of agent frameworks; body unreadable. — [arXiv](https://arxiv.org/pdf/2607.01641)
- Feature-level evidence that loops and error counts correlate with failure is only in [secondary] summaries of 2608.23670; and the within-task result of Shi and Assuncao suggests run-length and similar counts add little once task and model are known (length+model within-issue 0.648 vs model alone 0.724). [read]

### Gaps
- No measurement of the team's specific triggers (3x same failing check, 3x same call, 4 consecutive tool errors, two-thirds step budget) found.

## 8. Restart vs continue; second try with a different model

### Takeaway
Evidence is mixed and mostly negative on smart restarts; a fresh attempt helps mainly because it is another sample.

### Cited Findings
- Fail-Fast/Restart-Smart: restart with carried-over diff 71.8% vs continue-baseline 66.6% vs cold restart 66.8% (single model, abstract). [abstract]
- Continue-or-Restart: continuation dominated restart under fixed token cap in 56/56 configs. [read]
- Intuit audit: restart gains did not replicate across models; failed-branch reuse 0/19. [read]
- Shi and Assuncao: model switch after failure +6.91 pp, no better than a plain extra attempt; oracle specialization gap is within chance. [read]
- Handoff Tax: carrying over the full cheap-model trajectory hurts escalation. [abstract]
- SWE-Replay (2601.22129) resumes from archived intermediate steps; AgentRewind (2608.14380) reports continue plateaus earliest once stuck. [secondary] — [SWE-Replay](https://arxiv.org/pdf/2601.22129), [AgentRewind](https://arxiv.org/html/2608.14380v1)

## 9. Second-model judges of finished runs

### Takeaway
Judges reading transcripts or claims do poorly on agent false success (AUROC 0.54-0.65); patch-centred verifiers trained or prompted with repository context do better but the cleanest figures are vendor or secondary.

### Cited Findings
- Advani 2606.09863: judge AUROC at most 0.640 on tau2-bench (best: Claude Sonnet 4.5 with closing message removed) and 0.537 on AppWorld across 5 judges and many prompts. [read]
- Rubric/verifier work: Agentic Rubrics (arXiv 2601.04171, GPT-5 low reasoning judge) claims gains in parallel test-time scaling on SWE-bench Verified over test-based and execution-free baselines; SWE-RM (2512.21919) says accuracy and calibration, not best-of-N alone, should assess verifiers; reported RM@32 62.0% (Qwen3-Flash) and 74.6% (Qwen3-Max) vs 51.2/65.4 for execution-free SWE-Gym verifier via aggregator [secondary, unverified]; R2E-Gym says patch-only input was worse than with trajectory (already covered by earlier survey). — [Agentic Rubrics](https://arxiv.org/pdf/2601.04171), [SWE-RM](https://arxiv.org/pdf/2512.21919)
- LLM-as-a-Verifier (Stanford Scaling Intelligence): 78.2% on SWE-bench Verified as a trajectory reward vs 76.1% pass@1 (vendor/lab self-report, secondary) — [site](https://llm-as-a-verifier.com/)
- LLM-as-a-Judge for Software Engineering survey (arXiv 2510.24367) cites Yadavally et al. predicting unseen-test outcomes without execution "with high accuracy" (no figure seen). [secondary] — [arXiv](https://arxiv.org/pdf/2510.24367)
- PatchEval: LLM judge about 80% consistency with dynamic testing on vulnerability patches (not SWE-bench). [secondary] — [arXiv](https://arxiv.org/pdf/2511.11019)

### Gaps
- No AUROC for a prompted frontier judge predicting hidden-test pass of SWE-bench patches found.

---

## Final lists

### (1) Strongest-evidence signals/methods for an API-only harness
1. External verification of the claim (project tests, reproduction test run by the harness) over any self-report; the false-success and overclaim studies (2606.09863, 2609.20812) show claims are unreliable. Caveat: self-written tests still pass about 22-33% of wrong patches (2511.16858).
2. Plain retry with a second sample, as in Kapoor, gated by a real oracle, has the best cost evidence; an extra attempt explains most of the "escalation" gain (2611.08285).
3. Token-saving early termination with a cheap monitor or experience rules: EET (19-55% cost, 0.2% loss), FailFast (14.6-20.4% tokens), EarlyEval (13-26% steps). Use for cost, not as a failure oracle.
4. Trajectory-reading classifiers (TF-IDF/XGBoost over action sequences) for false-success detection: AUROC 0.83-0.95, far above LLM judges (0.54-0.65) in 2606.09863, but old agents and single-lab; train on your own logs and test task-disjoint.
5. Pre-execution self-assessment with adversarial "find the bugs" framing as a cheap calibration improvement (2602.06948, abstract-level).
6. Escalation with trimmed context rather than the full trajectory (2608.24358, abstract-level).

### (2) Looked promising, did not survive
- Run-prefix predictors and restart monitors: pooled AUROC 0.92 collapses to 0.5-0.65 within task (2611.08285, 2610.35971); fixed 16-call cutoff gain reversed on a second model (2610.36544).
- LLM judges of transcripts/closing messages for false success (at most 0.65 AUROC).
- Verbalized confidence (AUROC 0.57-0.66 on SWE-bench Verified, 2610.07948).
- Model-specific routing/"specialization" after failure (within chance).
- Carrying failed partial work into a retry (0/19 reuse; handoff tax), except the contested 2608.03222 result.

### (3) Open questions
- Does any run-level signal beat chance within a task for current frontier models and Claude Code or OpenCode-style scaffolds?
- Measured accuracy of the specific stuck-triggers (same failing check x3, same call x3, 4 errors, 2/3 step budget).
- Agreement across attempts as a signal on real repair tasks; AUROC unknown.
- Prompted LLM judge AUROC for hidden-test pass on SWE-bench patches.
- Reconciling 2608.03222 (restart helps) with 2610.35971 and 2610.36544 (it does not).
- Real cheap-first cascade results with a non-oracle trigger and full cost accounting.
- Unread or partially read: Kapoor last 45k chars, FailFast body, EET, EarlyEval, Handoff Tax and Kaddour bodies, and many [secondary] papers.
