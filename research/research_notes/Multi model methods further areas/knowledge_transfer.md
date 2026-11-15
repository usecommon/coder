# Passing knowledge between models and across runs (memory, playbooks, skills, context files, demonstrations, distillation), 2023 to Nov 2026

Method note. Labels: [read] = figure seen in the full text of the paper through the page fetcher (the fetcher returns a model-written digest of the page, so [read] means the digest reported it from the full text); [abstract] = abstract only; [secondary] = a third party's account or search snippet only. All arXiv items are preprints unless a venue is named. I did not run any code. Not opened or not fully read: ReasoningBank (last 2K chars), ACE appendix, SkillsBench appendix (cost), Agent KB, Memp, AWM, Reflexion, ExpeL, SWE-Gym, R2E-Gym, SWE-Dev, CODESKILL, SkillsVote, "Regression Tax", MemRL, Dynamic Cheatsheet full text, sleep-time compute full text, any "deep wiki" or repo-documentation study, any hint or demonstration-retrieval study for coding. Search budget (about 20 calls) was spent on the items below; coverage of 2026 work is therefore partial.

## 1. Experience memory for agents: gains on coding benchmarks and cost

### Takeaway
Gains from experience memory on SWE-bench-type tasks are real but small to moderate (about +2 to +6 points) and mostly measured where the memory was written by the same model that uses it. Claimed large gains (ACE, Agent KB v1, Dynamic Cheatsheet) come from non-coding or non-SWE benchmarks or from weak baselines. Cost is rarely reported.

### Cited Findings
- ReasoningBank (Google; Ouyang, Yan et al.; Sep 2025; ICLR 2026). SWE-Bench-Verified resolve rate: Gemini-2.5-Flash 34.2 (no memory) -> 35.4 (Synapse) -> 38.8 (ReasoningBank), avg steps 30.3 -> 27.5; Gemini-2.5-Pro 54.0 -> 53.4 (Synapse) -> 57.4 (ReasoningBank), steps 21.1 -> 19.8. [read] AWM was not run on SWE (bash action space). MaTTS (memory plus test-time scaling) was tested only on WebArena-Shopping. Memory extractor is the same backbone as the agent (stated for the general setup; SWE assumed). Cost not reported. Failure case: Synapse slightly below no-memory on Pro. Judge-labelled success/failure can be noisy. [read] https://arxiv.org/html/2509.25140v1
- SWE-Exp (Chen et al., SJTU/Huawei; arXiv 2507.23361v2, revised 2 Feb 2026). SWE-bench Verified Pass@1: DeepSeek-V3-0324 35.4 (SWE-Search baseline) -> 42.0; Claude-4 Sonnet 70.8 -> 73.0. Within the paper, zero-experience DeepSeek is 37.8 (RQ3) or 37.2 (Discussion), so the true same-agent gain is about +4 to +5, not +6.6. Retrieving 1 experience was best (42.0); 2 gave 39.8 and 4 gave 39.0, so more memory hurt. Cost (DeepSeek): 189.1K -> 203.3K tokens, $0.12 -> $0.13, wall time 12m37s -> 15m49s. Authors state comprehension experiences can mislead late in a task, and the agent cannot judge applicability. Paper does not test cross-model use of experience. Python only; DeepSeek contamination cannot be excluded. [read] https://arxiv.org/html/2507.23361v2
- Memory Transfer Learning (MTL; Kim, Kang, Kim, Yang, Ren, Hwang; Apr 2026; preprint). Pooled memory across six coding benchmarks, insight-form memory, Pass@3 average: GPT-5-mini 0.523 -> 0.560 (+3.7), DeepSeek V3.2 0.542 -> 0.568, Qwen3-Coder-480B 0.483 -> 0.501. On SWE-Bench Verified: GPT-5-mini 0.73 -> 0.77, DeepSeek V3.2 0.53 -> 0.59, Qwen3-Coder 0.59 -> 0.62. Up to 100 sampled tasks per benchmark, so differences of 1 to 3 points are within noise. Comparison on LCB/SWE-B/ReplicationBench average: zero-shot 0.584, ReasoningBank 0.601, AgentKB 0.613, MTL 0.630. Cost not in the digest. [read] https://arxiv.org/html/2604.14004 ; abstract [abstract] https://arxiv.org/abs/2604.14004
- ACE, Agentic Context Engineering (Zhang, Hu et al., Stanford/SambaNova; Oct 2025, v3 Mar 2026; ICLR 2026). Evolving "playbook" of itemised bullets with Generator/Reflector/Curator and delta updates. DeepSeek-V3.1 on AppWorld: ReAct 42.4 -> ACE offline 59.4 (+17.0) vs GEPA 46.4 and ICL 46.0; online without labels 59.5. Finance: base 69.1 -> ACE offline 81.9. Cost: versus GEPA offline, latency -82.3%, rollouts 357 vs 1,434; versus Dynamic Cheatsheet online, token cost $2.9 vs $17.7. No SWE-bench result; AppWorld is the nearest to coding. Without reliable feedback gains shrink or reverse (online FiNER without labels 3.4 below base). Needs a strong Reflector. Author-run, tuned on same benchmark families. [read] https://arxiv.org/html/2510.04618v3
- Dynamic Cheatsheet (Suzgun et al., Stanford; Apr 2025; EACL 2026). Black-box test-time memory. Claude 3.5 Sonnet AIME gains of 27% (2024) and 30% (2025); GPT-4o Game of 24 from about 10% to 99% after reusing a Python solution. Not coding-agent work; numbers from search snippet only. [secondary] https://arxiv.org/html/2504.07952v1 . ACE's table shows DC online without labels at 65.4 on finance vs base 69.1, i.e. a loss when labels are absent. [read, via ACE]
- Agent KB (Tang et al.; Jul 2025, ICML 2025 workshop version listed). v1 reported Claude-3 SWE-bench 41.33% -> 53.33%; later version reports OpenHands 24.3 -> 28.3 pass@1. Different setups, not comparable. I did not open the paper. [secondary] https://arxiv.org/abs/2507.06229v3
- Ratchet (Zhang, Cui, Wang, He, Li, Qiu, Zhu; AWS GenAI Innovation Center and HSBC; May 2026; preprint). Frozen Claude Opus 4.7 writes, retrieves and retires its own skills. MBPP+ hard-100 rolling gain +0.328 (baseline 0.258); no-skill control +0.002. SWE-bench Verified hard-150 (90 train / 60 eval tasks, 20 rounds, 3 seeds, Claude Code solver): baseline 0.65, mean peak 0.87 (+0.22 peak, not rolling; authors call it preliminary). Cost on MBPP+: about 6.5 h and 14,450 calls versus 2.3 h for no skill. Note the lift is on a "hard" subset chosen for low baseline, scored as peak, and the train/eval tasks are from the same pool. [read] https://arxiv.org/html/2605.22148v1
- CODESKILL (May 2026): SWE-Bench Verified 57.33 -> 66.00 with Qwen3.5-35B-A3B and RL-trained skill-bank management. Seen only in a search snippet (a blog summary). [secondary] https://codex.danielvaughan.com/2026/07/03/codeskill-self-evolving-skill-banks-coding-agents-codex-cli-rl-procedural-skill-management/ . It uses RL, so it is not an API-only method.
- Reflexion, ExpeL, Agent Workflow Memory, Memp, SWE-Exp-like earlier work: not opened; no figures reported here.

### Inferences
- Realistic expectation for a harness: +2 to +5 points on SWE-bench Verified from retrieved insights, with +0.5 to +15% token overhead, and memory helps less as the base agent gets stronger (SWE-Exp +2.2 on Claude 4 Sonnet vs +4 to +7 on DeepSeek).
- Retrieve few items (SWE-Exp best at 1).

### Gaps
- No independent replication of ReasoningBank, SWE-Exp or ACE on SWE-bench found. Cost per task for memory construction is mostly unreported. Sleep-time/offline consolidation for coding agents not found beyond the original sleep-time compute paper.

## 2. Transfer across models (strong writes, weak reads, and the reverse)

### Takeaway
Abstract, model-agnostic insights transfer across models with small positive gains (about +1 to +3 points average), always smaller than self-written memory. Raw trajectories and model-specific memories can hurt the receiving model. No study found that cleanly shows a strong-written memory giving a weak model a large coding gain.

### Cited Findings
- MTL cross-model table (Pass@1 averages over six coding benchmarks): target GPT-5-mini zero-shot 0.515; memory from DeepSeek V3.2 0.518; from Qwen3-Coder 0.528; from itself 0.543. Target DeepSeek V3.2: 0.486; from GPT-5-mini 0.501; from itself 0.511. Target Qwen3-Coder: 0.402; from GPT-5-mini 0.413; from itself 0.413. All memories were generated with GPT-5-mini in the main runs; the paper concludes self-generated memory is best but cross-model memory still helps. Representation matters: Pass@3 average with GPT-5-mini of Trajectory 0.534, Workflow 0.538, Summary 0.546, Insight 0.560 vs zero-shot 0.523. Trajectory memory lowered GPT-5-mini on TerminalBench2 (0.315 -> 0.270) and MLGym (0.667 -> 0.583). Causes given: domain-mismatched anchoring, false validation confidence, misapplied best practice. [read] https://arxiv.org/html/2604.14004
- MemCollab (Chang, Wu, Lin, Wu; Penn State/AG2AI; arXiv 2603.23234 v2 28 May 2026; preprint). Qwen2.5-32B memory given to Qwen2.5-7B: MATH500 52.2 -> 50.6, HumanEval 42.7 -> 34.1, MBPP 47.9 -> 48.6, GSM8K 85.4 -> 86.6. Given to Llama-3-8B average falls 41.7 -> 36.3. Their fix (contrast trajectories of two models on the same task to keep shared principles): Qwen2.5-7B average 57.1 -> 71.6 (MBPP 55.3 or 47.9 baseline depending on table -> 57.6; HumanEval 42.7 -> 74.4); Qwen2.5-32B 70.8 -> 79.6; Llama-3-8B 41.7 -> 53.9. The paper reports different vanilla MBPP baselines in different tables (47.9 and 55.3 for the 7B), which makes the size of the gain uncertain. Small open models, not frontier; MBPP/HumanEval are function-level, not repo-level. Extra cost vs self-memory: 38.3 s vs 13.4 s wall time on MBPP (Qwen3-32B summariser). [read] https://arxiv.org/html/2603.23234
- Context files written by stronger models (see section 3): files from GPT-5.2 and Sonnet 4.5 improved GPT-5.1 mini and Qwen3-30B by about 2% on SWE-bench Lite but lowered them by about 3% on the second benchmark. [read] https://arxiv.org/html/2602.11988
- MemRL (Jan 2026): a memory bank frozen from Gemini-3-pro applied to Qwen3-235B on HLE, 0.150 -> 0.531. Not coding; search snippet only. [secondary] https://arxiv.org/pdf/2601.03192
- A multimodal grow-and-refine memory paper (arXiv 2511.21678) reports an 8B model gaining more from stronger-model memory than from its own. Not coding; snippet only. [secondary]
- Agent KB claims cross-framework transfer between student and teacher agents; not verified. [secondary] https://arxiv.org/abs/2507.06229v3
- Several different models sharing one memory: MTL pools memories across domains, and MemCollab builds one memory from two models; no study found of three or more models writing into one live store with coding results.

### Inferences
- If a strong model writes lessons for a cheap worker, write them as short abstract rules (validation routines, localisation habits) and filter out model-specific procedure; expect low single-digit gains.
- The reverse direction (weak writes for strong) is slightly positive in MTL (from Qwen3-Coder to GPT-5-mini +1.3), but not in a controlled strong-vs-weak design.

### Gaps
- No SWE-bench study with a frontier model writing memory for a small model and a measured token cost. MTL's memory generator is a single mid-tier model (GPT-5-mini), so "stronger writes for weaker" is only partly tested there.

## 3. Repository context files (AGENTS.md, CLAUDE.md)

### Takeaway
The best controlled study finds model-generated context files do not help and cost about 20% more; human-written files give a small gain. A smaller observational study of a single agent found lower runtime and output tokens with a human-written file. Content that states non-standard tools and conventions helps; repository overviews do not.

### Cited Findings
- "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" (Gloaguen, Mündler, Mueller, Raychev, Vechev; arXiv 2602.11988, Feb 2026; ICLR 2026 listing). SWE-bench Lite (300 tasks): no file vs LLM-generated file: Sonnet-4.5 59.9 -> 58.7; GPT-5.2 56.6 -> 54.4; GPT-5.1 mini 47.7 -> 47.6; Qwen3-30B 31.1 -> 32.4. New benchmark of 138 instances in 12 repos that ship developer-written files: Sonnet-4.5 73.2 none / 65.2 LLM / 70.3 dev; GPT-5.2 65.2 / 68.1 / 68.1; GPT-5.1 mini 54.3 / 50.7 / 55.8; Qwen3-30B 45.7 / 47.1 / 53.6. Only one comparison significant (LLM vs dev, p = 0.038); the table in my read mislabels the benchmark in one place. Cost per instance: Sonnet-4.5 on SWE-bench $1.30 -> $1.51 with an LLM file, steps 54.4 -> 57.2; GPT-5.2 $0.32 -> $0.43; average cost +20% (SWE-bench) and +23% (new benchmark), extra steps 2.45 and 3.92 per the search summary. Repository overviews did not help the agent find the changed files faster. Instructions were followed (a mentioned tool was used about 1.6 times per instance vs under 0.01 if unmentioned). Testing and tooling sections drove cost. When all other documentation was removed, LLM files gave about +2.7% and beat developer files. Python only; small samples; one run per task. [read] https://arxiv.org/html/2602.11988 (secondary summary: https://aiweekly.co/node/5405)
- "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents" (Lulla, Mohsenimofidi, Galster, Zhang, Baltes, Treude; arXiv 2601.20404, Jan 2026, revised Mar 2026; preprint). 10 repos, 124 PRs, OpenAI Codex, with vs without AGENTS.md: median runtime -28.64%, median output tokens 2,925 -> 2,440 (-16.58%, p < 0.05). Measures efficiency only, not correctness, with a small paired sample and one agent. [secondary, from search digest; full text not opened] https://arxiv.org/abs/2601.20404
- Not found: a peer-reviewed measurement of CLAUDE.md-specific content, nor measurement of "init"-generated files from vendor tools beyond the paper above.

### Inferences
- Keep a context file short, human-authored, limited to non-obvious commands, conventions and pitfalls; do not auto-generate a repo overview. If auto-generating for a repo with no docs, expect a small gain at about 20% cost.

### Gaps
- Direct evidence on whether the two studies' opposite cost signs come from agent differences (Codex vs mixed) was not found.

## 4. Skills and tool libraries written by models

### Takeaway
Curated (human or carefully built) skills help a lot on non-coding tasks and little on software engineering; skills a model writes for itself before seeing the task give about zero on average. Lifecycle governance (retiring bad skills) is what turns self-written skills into gains in the Ratchet/CODESKILL line, but the evidence is preprint-level.

### Cited Findings
- SkillsBench (arXiv 2602.12670, Feb 2026; NeurIPS 2026 poster listing). 84 tasks (abstract page of one source says 86), 7 harness/model configs, 7,308 trajectories. Pass rates none / curated / self-generated: Claude Code Opus 4.5 22.0 / 45.3 / 21.6; GPT-5.2 (Codex) 30.6 / 44.7 / 25.0; Opus 4.6 30.6 / 44.5 / 32.0; Sonnet 4.5 17.3 / 31.8 / 15.2; Haiku 4.5 11.0 / 27.7 / 11.0; Gemini 3 Flash 31.3 / 48.7 / not run; Gemini 3 Pro 27.6 / 41.2 / not run. Mean gain curated +16.2 pp, self-generated -1.3 pp. Software engineering domain: 34.4 -> 38.9 (+4.5), the smallest gain. Haiku 4.5 with skills (27.7) beat Opus 4.5 without (22.0) but this rests on one model family. Skill length: detailed +18.8, compact +17.1, standard +10.1, comprehensive -2.9; 1 skill +17.8, 2-3 skills +18.6, 4+ skills +5.9. Cost: only a Gemini token comparison read. [read] https://arxiv.org/html/2602.12670v1
- Ratchet: LLM-authored skills +0.0 pp (cited from SkillsBench) vs lifecycle-managed self-skills +0.328 on MBPP+ hard subset (see section 1). Harsh retirement was worse than no skills (-0.019). [read] https://arxiv.org/html/2605.22148v1
- The Blind Curator (Zhang et al., AWS/HSBC; COLM 2026 workshop paper). A biased judge disables skill retirement; on a report-writing task the clean evolution loop did not beat the no-skill floor (0.628), and end-to-end lift was undetectable (p = 0.63, 23 sections). The paper does not directly measure library drift. Not a coding benchmark except an MBPP+ check. [read, via digest] https://www.alphaxiv.org/abs/2607.07436.md
- A "skill evolution" paper (arXiv 2605.24117) attributes the null self-skill result partly to agents writing guidance before attempting the task. [secondary] https://arxiv.org/pdf/2605.24117
- SkillsVote and "The Regression Tax" (arXiv 2607.22520: skills helping some tasks and breaking tasks already solved, with cost cancelling most of the gain): seen only as search snippets and a blog summary. [secondary] https://dev.to/breachprotocol/adding-skills-to-an-ai-agent-breaks-work-it-already-did-right-and-the-cost-cancels-most-of-the-gain-537p
- Voyager, SkillWeaver, agent skill induction, Anthropic Agent Skills documentation: not opened in this pass; no figures.

### Inferences
- A cheap worker plus a strong model's curated skills is the most defensible pattern from SkillsBench, but the skills there were human-curated, not strong-model-written, so the test the team wants (strong model writes, cheap model uses) is not answered. Self-generation by the same model was null, and the Claude-family results hint a stronger author could do better, not shown.

### Gaps
- No benchmark run with skills written by a stronger model and read by a weaker one.

## 5. Demonstrations, hints and cached plans

### Takeaway
The best-supported item is plan caching (about 46 to 50% cost reduction), but only for repetitive agent tasks, not demonstrated on SWE-bench. I found no 2025-2026 study of retrieved strong-model coding trajectories as in-context examples for a weak model.

### Cited Findings
- Agentic Plan Caching (Zhang, Wornow, Wan, Olukotun; arXiv 2506.14852, NeurIPS 2025). Plan templates extracted from completed runs, matched by keyword, adapted by a lightweight model. Cost -50.31%, latency -27.28% on average while "maintaining performance" (v1: -46.62%, 96.67% of optimal performance). Benchmarks and models not read. [abstract] https://arxiv.org/abs/2506.14852
- MTL: raw trajectory memory underperformed abstract insights and sometimes hurt (section 2). [read]
- SWE-Exp: one retrieved experience beat zero; more did not help (section 1). [read]

### Inferences
- In-context trajectories are costly in tokens and less transferable than short distilled insights per MTL.

### Gaps
- No measurement found for hints from a strong model to a cheaper worker on SWE-bench.

## 6. Distillation and fine-tuning (brief)

### Takeaway
Fine-tuning a 32B open model on a few thousand teacher trajectories reaches about 40% on SWE-bench Verified, well below the teacher; not available to this team.

### Cited Findings
- SWE-smith (Yang et al.; arXiv 2504.21798, Apr 2025). SWE-agent with Claude 3.7 Sonnet on 20k generated tasks, 5,016 kept trajectories, fine-tuned Qwen 2.5 Coder 32B -> 40.2% Pass@1 on SWE-bench Verified, single attempt. [secondary, from search digest] https://arxiv.org/abs/2504.21798
- SWE-Gym fine-tuned Qwen2.5-Coder models 20.6% on Verified; R2E-Gym 32B with verifier 51.0% (best@26, not comparable). [secondary, emergentmind] https://www.emergentmind.com/topics/swe-gym
- SWE-Dev and 2026 small open models: not found or opened. Teacher-student cost not read.

### Inferences
- Distillation buys a self-hostable model, not a way to improve API workers.

### Gaps
- Gap to teacher and cost per student not verified from full text.

## 7. Preparation ahead of time by a second model (indexing, summaries, wikis, sleep-time compute)

### Takeaway
Only the general sleep-time compute result is available, on non-coding tasks. No measurement of generated codebase wikis or repository summaries on later task success was found.

### Cited Findings
- Sleep-time Compute (Lin, Snell et al.; arXiv 2504.13171, Apr 2025). Precomputing on context cut test-time compute needed for equal accuracy by about 5x on Stateful GSM-Symbolic and AIME; accuracy up to +13% and +18% by scaling sleep-time compute; amortised across queries, cost per question fell 2.5x. Gains are larger when queries are predictable from the context. Not coding. [abstract/secondary] https://arxiv.org/abs/2504.13171v1
- The AGENTS.md study found LLM-generated overviews did not help localisation (section 3). [read] https://arxiv.org/html/2602.11988
- Vendor engineering posts (Letta, Cognition DeepWiki, Anthropic) were not searched; no vendor claim recorded.

### Inferences
- Generated repository summaries probably behave like auto-generated context files (neutral to slightly harmful); a prepared artefact that helps would be targeted at what the agent cannot cheaply discover (build/test commands, hidden conventions).

### Gaps
- Entire area unmeasured in what I found.

## 8. Risks: wrong, stale, over-long memory

### Takeaway
Harm is documented: negative transfer from traces, memory lowering weaker models, over-retrieval, uncurated skill libraries and noisy labels.

### Cited Findings
- Naive 32B -> 7B memory transfer lowered MATH500 and HumanEval and lowered a Llama-3-8B average 41.7 -> 36.3. [read] https://arxiv.org/html/2603.23234
- MTL trajectory memory lowered TerminalBench2 and MLGym; three named mechanisms. [read] https://arxiv.org/html/2604.14004
- SWE-Exp: more than one retrieved experience reduced accuracy; late-stage misleading comprehension experience. [read] https://arxiv.org/html/2507.23361v2
- ACE and DC lose when feedback labels are absent (FiNER online -3.4 vs base for ACE). Authors note that noisy reflections can degrade the context. [read] https://arxiv.org/html/2510.04618v3
- Context files raise cost about 20% and some lower success (Sonnet 4.5 73.2 -> 65.2 on the second benchmark). [read] https://arxiv.org/html/2602.11988
- SkillsBench: comprehensive skills -2.9 pp, 4+ skills +5.9 vs +18 for 1 to 3; 16 of 84 tasks had negative deltas. [read] https://arxiv.org/html/2602.12670v1 (the 16-of-84 count is [secondary])
- Skill library drift / judge bias (Blind Curator, Ratchet harsh retirement). [read, via digest]
- Staleness from code changes: no empirical measurement of memories invalidated by repo edits found.

### Inferences
- Memory needs a tested-before-use gate, a size cap, and decay tied to outcomes.

### Gaps
- No study of staleness over repository history; none of one model's mistakes persisting once shared, beyond MTL's anchoring.

## Closing lists

### (1) Methods with the strongest evidence for an API-only harness
1. Short human-reviewed context file listing non-standard commands, tools, conventions (AGENTS.md study; developer files +2.4 pp avg, efficiency study -16% output tokens; but not significant in the first, small samples).
2. Retrieval of a very small number (1 to 3) of abstract, task-agnostic insights from past runs (ReasoningBank +3 to +4.6 SWE-bench; MTL +3 to +6 on SWE-bench Verified; SWE-Exp +2 to +5), accepting that it works best when written by the same model family.
3. Curated, short, focused skill files (1 to 3, about 2-3 modules), in non-coding domains +16 pp; SE only +4.5 pp.
4. Plan caching for repeated, templated tasks with a cheap adapter model (cost -46 to -50%, performance preserved per the authors; not shown on SWE-bench).
5. Skill/memory lifecycle management (retire by outcome, cap size) as a condition for self-written memory (Ratchet, preprint, author-run, single provider).
6. Contrastive or abstracted memory when sharing across models (MemCollab, small open models only).

### (2) Promising but not holding up under sober evaluation
- Model-generated repository context files/overviews: no gain, +20% cost.
- Self-generated skills written before the task (SkillsBench: -1.3 pp; Ratchet cites +0.0).
- Raw trajectory memory shared across models and domains (MTL negative on some tasks).
- Naively transferring a larger model's memory to a smaller model (MemCollab).
- Large headline numbers from Agent KB v1 (+12 pp) and SWE-Exp v1 41.6/73.0 headline: baselines and version differences make them unreliable.
- Accumulating many memories (SWE-Exp, SkillsBench 4+ skills).

### (3) Open questions
- Does a frontier model's distilled lessons or skills raise a cheap worker's SWE-bench score, and by how much per dollar? (Not measured directly.)
- Does the gain survive on models of 2026 strength, and in non-Python repos?
- Do generated repository wikis or pre-computed indices raise later success or cut cost?
- How fast do memories go stale as the repository changes, and what is the cheapest validity check?
- What is the one-off cost of building the memory versus the saving per task? Most papers omit it.
- Are replications by independent teams available for ReasoningBank, SWE-Exp, ACE and Ratchet on SWE-bench?
