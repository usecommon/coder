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

## Second pass (gaps closed)

Labels as before. Fetch tool returns a model-written digest; quotes below are the digest's quotes of the page text. Corrections to the first pass are marked CORRECTION. About 30 further calls were used.

### 2.1 Strong model prepares knowledge for a weak one

#### Takeaway
After about 6 targeted queries (teacher/guideline/playbook/cheat sheet/skills wording, plus fetches of Dynamic Cheatsheet, ACE, SkillsBench v1 and v4, SKILL-KD, MTL) I found NO study that gives a smaller model a playbook or skill file written once by a stronger model and measures SWE-bench success. Closest evidence: ALFWorld/TravelPlanner (Memp), coding-domain memory (MTL, VibeMemBench frozen experience), and a non-coding skill-distillation preprint (SKILL-KD). All show small to moderate gains, bigger when the knowledge is abstract and curated.

#### Cited Findings
- Dynamic Cheatsheet (Suzgun et al., arXiv 2504.07952): cross-model transfer is only discussed in words. Quote: larger models "can sometimes produce higher-quality strategies that, in principle, could benefit smaller models if the memory is transferred", and a small model may "stall or degrade"; no table. Smaller models struggle to use DC: Claude 3.5 Haiku AIME 2024 10.0% -> 36.7% but AIME 2025 0.0% -> 13.3%; caption "These smaller models struggle to fully leverage DC". DC hurt in places: GPT-4o-mini AIME 2024 16.7% -> 13.3%; GPT-4o MMLU-Pro Engineering 53.2% -> 44.0% (DC-Cu); GPT-4o Game of 24 with direct retrieval 6.0% vs 10.0%. The paper's text and Table 1 disagree on which method gave GPQA 58.1 vs 57.1. [read, via digest] https://arxiv.org/html/2504.07952v1
- ACE (arXiv 2510.04618v3) appendix, Reflector swapped, FiNER, DeepSeek-V3.1 generator/curator: base 70.7; Reflector GPT-OSS-120B 76.6; DeepSeek-V3.1 78.3; GPT-5.1 78.5. Quote: "Across all choices, ACE consistently improves over the base LLM, including when the Reflector is much weaker." and "stronger reflectors yield larger gains". So a stronger writer helps a little (+1.9 to +2.2 over the weaker ones), but this is the same generator reading all playbooks and it is a finance task, not coding. Other base models (offline, GT labels, average): GPT-OSS-120B 69.1 -> 81.2; GPT-5.1 73.3 -> 82.8. Llama-3.3-70B FiNER: base 62.5, ACE offline 64.9, ACE online no labels 63.6, DC online 59.0 (-3.5), GEPA 59.41 (-3.09). Not coding. [read] https://arxiv.org/html/2510.04618v3
- Memp (arXiv 2508.06433; see 2.6): memory built by GPT-4o used by Qwen2.5-14B on TravelPlanner: "the 14 billion parameter model raised its task completion rate by 5% and cut the average number of steps by 1.6." ALFWorld "similar gains", no figures. [read, via digest]
- ExpeL: ablation with insights written by gpt-3.5-turbo instead of gpt-4 on HotpotQA: 32.0% vs 39.0%. Quote: "a better LLM is more advantageous at improving ExpeL's performance." This is a writer-quality test, with the same acting model; no strong-writes/weak-reads test. [read, via digest] https://arxiv.org/html/2308.10144
- SKILL-KD (Shi et al., Zhejiang/PKU/Alibaba; arXiv 2607.28048v4, 13 Oct 2026; preprint). Teacher-written contrastive skills for a frozen student. Group 1: student Qwen3.5-4B, teacher Qwen3.7-plus; Group 2: student Qwen3.6-35B-A3B, teacher "ChatGPT-5.5". Average over SearchQA, SpreadsheetBench, DocVQA, LiveMath, ALFWorld: no skill 43.5 -> SKILL-KD 66.8 (best baseline SkillOpt 63.5); group 2 57.9 -> 74.6 (SkillOpt 68.6). Student-written rules ("Student-only") 60.1 with 96 rules and 6,821 words versus SKILL-KD 66.8 with 38 rules. No coding benchmark (SpreadsheetBench is the nearest). Author-run, same benchmarks used to build skills (train/test split not checked). [read, via digest] https://arxiv.org/html/2607.28048
- SkillsBench Haiku vs Opus. CORRECTION on provenance: no sentence in the v1 text compares Haiku 4.5 with Skills to Opus 4.5 without; my first-pass statement came from the table values (Haiku curated 27.7 vs Opus 4.5 none 22.0, both [read] in v1 Table). A search summary calls it a "headline result". The version at arxiv.org/html/2602.12670v4 (87 tasks, 8 domains, 18 model-harness configs, mean 33.9% -> 50.5%, +16.6 pp, configuration gains +4.1 to +25.7) does not contain Haiku or Opus 4.5 at all; its quotes: abstract "smaller models with Skills can match larger models without them"; Finding 6: MiniMax M2.7 with Skills 34.9% vs OpenHands + GLM 5.1 without Skills 32.7% and OpenHands + MiniMax M3 without 29.7%; conclusion "Skills can partially substitute for model scale on procedural tasks". Version numbers differ between v1 and v4, so cite which version. Skills were human-curated (also in v4 "curated"), not written by a stronger model. [read, via digest] https://arxiv.org/html/2602.12670v4
- Skill Availability and Presentation Granularity (Xu, Wu; arXiv 2605.31408, 29 May 2026; two authors, preprint). On SkillsBench, GPT-5.5 baseline 31.3%, DeepSeek V4-Flash 26.0%; skill conditions +26.7 to +36.0 pp and +18.0 to +26.0 pp. Quote: "Skill availability is the clearest empirical signal." Abstraction level and an added worked example: differences within noise (e.g. +0.7 pp CI -10.0 to +12.0). Not a size comparison; paper says the configurations are "not compute-matched". [read, via digest] https://arxiv.org/html/2605.31408
- Steer, Don't Solve (strong teacher critiques train a small critic; Opus 4.6 teacher, Qwen3-8B critic; SWE-bench Verified 29.2% -> 51.4% / 65.0%): excluded by scope (in-run critic); noted only as a search-snippet analogue. [secondary]
- 2026 SWE-bench: no study found with strong-written text given to a weak model. Related SWE-bench items: MemCoder (below), MTL (section 1), SWE-ContextBench (2.4).

#### Inferences
- The only direct writer-strength experiments are ExpeL (gpt-4 vs gpt-3.5 writing, +7 pp on HotpotQA), ACE (Reflector strength, +2 pp) and Memp (GPT-4o -> Qwen 14B, +5% on TravelPlanner). None is a coding repo benchmark. A harness team should treat "strong model writes for cheap worker" as plausible but unmeasured on SWE-bench.
- Skills and memory that are short, curated and few seem to work; long ones and ones read by small models that cannot use them do not (DC Haiku, SkillsBench comprehensive).

#### Gaps
- No direct test of the team's exact scenario. A ~6-query negative search is not proof of absence.

### 2.2 Agent KB (Tang et al., OPPO/others; arXiv 2507.06229; v5 dated 27 Oct 2025; preprint; ICML 2025 workshop listing seen in search)
- SWE-bench Lite: "GPT-4.1 paired with SWE-Agent improves from 24.3% to 38.0% at 50 iterations and 42.3% under 100 iterations." "On SWE-bench Lite, OpenHands gains 4.0pp at pass@1." "The strongest backbone, Claude-3.7, achieves the largest jump, adding 21.0 at 50 iterations." GAIA: "With smolagents, GPT-4.1 rises from 55.2% to 73.9% pass@3 accuracy"; Claude-3.7 75.2%. [read, via digest] https://arxiv.org/html/2507.06229
- Frameworks and models: SWE-Agent, OpenHands, smolagents; backbones GPT-4.1 and Claude-3.7. Quote: "experiences gathered in one framework are instantly available to the others." Transfer across domains is asymmetric: "SWE knowledge does not generalize to reasoning tasks, while reasoning experience retains partial utility in SWE domains." No test of knowledge written by one model and read by another was reported in the digest. [read, via digest]
- Cost: "the retrieval loop adds only $0.27 on top of a full evaluation of $86.0 USD" (GAIA); SWE-bench hinting under one cent per issue (about $0.004, GPT-4.1). [read, via digest]
- CORRECTION: my first-pass line "OpenHands 24.3 -> 28.3" was a conflation from a search summary; 24.3% is the SWE-Agent/GPT-4.1 baseline and OpenHands gains +4.0 pp. The older "Claude-3 41.33 -> 53.33" was not found in the v5 text. The KB is built from the benchmark's own task experience and the paper notes retrieval of knowledge written during runs on the same benchmark; I could not check the last 23K characters (leakage, whether test outcomes were used) and no independent replication. MTL reports AgentKB (5,899 memories) at 0.613 vs zero-shot 0.584 on a mixed average (section 1), which is a third-party partial reproduction in a different setup. [read, via digest / secondary]

### 2.3 Context-file studies, primary sources
- Lulla, Mohsenimofidi, Galster, Zhang, Baltes, Treude, arXiv 2601.20404 (v2, Mar 2026; preprint). Agent: OpenAI Codex with gpt-5.2-codex; "analyze 10 repositories and 124 pull requests, executing agents under two conditions"; 10 of 26 qualifying repositories, up to 15 merged PRs each, LLM-generated issue-style tasks, only small PRs (<=100 LoC, <=5 files). Median wall time 98.57 s -> 70.34 s (-28.64%). Median output tokens 2,925 -> 2,440 (-16.58%). Input tokens did not fall at the median: 116,609 -> 120,587 (+3.41%); mean input 353,010 -> 318,652 (-9.73%). Correctness not measured: "A comprehensive evaluation of the output quality" is out of scope; 50 sampled runs were manually checked only to confirm they were not degenerate. One agent, one model family. [read, via digest] https://arxiv.org/html/2601.20404v2
- Gloaguen, Mündler-Sasahara, Müller, Raychev, Vechev: "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" arXiv 2602.11988; v1 12 Feb 2026, v2 23 Jun 2026, v3 29 Sep 2026 (ICLR 2026 listing). Main conclusion, quoted: "providing context files does not generally improve task success rates." Summary on the page: files raise inference cost by over 20% on average; agents follow them but repository overviews do not help; useful for non-standard practices. Caveat: the numbers in my first-pass section 3 came from an unversioned HTML page and I could not tell which version; v1 versus v3 abstracts differ in wording ("no improvement" vs "tend to reduce"), so re-check the table values against v3 before final use. [abstract] https://arxiv.org/abs/2602.11988
- Together: the efficiency study (small PRs, one agent, no correctness) and the success study (larger set, several agents) are not contradictory about success because the first never measured it; they disagree on cost (Lulla: output tokens down, input flat; Gloaguen: cost up about 20%).

### 2.4 Preparation ahead of time for code
#### Takeaway
Little measurement exists. One 57-instance study shows documentation improving SWE-Agent by 2 to 5 instances; one SWE-bench-based benchmark shows experience summaries helping only when correctly selected.

#### Cited Findings
- SWD-Bench (Wang, Hu, Gao, Gao, Peng; arXiv 2604.06793, 8 Apr 2026; preprint). Quote: "The baseline issue-solving rate of SWE-Agent (retrieving from the code repository) is 43.86%." "Specifically, RepoAgent achieves the highest issue-solving rate at 52.63%"; DocAgent and AutoDoc 49.12%, DeepWiki 47.37%; "relative issue-solving improvement ranges from 8.00% to 20.00%"; "we collect 57 corresponding instances from the SWE-Bench Verified". Arithmetic (mine, not the paper's): 43.86% = 25/57 and 52.63% = 30/57, so best method is +5 instances (+8.8 pp absolute), DeepWiki +2 instances (+3.5 pp). Claude-4-Sonnet generated the documentation; the page did not name the SWE-Agent model. The 20% headline is relative. Very small sample, no confidence interval. [read, via digest] https://arxiv.org/html/2604.06793 (CodeWiki is a documentation-quality benchmark only; CodeWiki weighted score 68.79 vs DeepWiki 64.06 [secondary]).
- SWE-ContextBench (Zhu, Wu et al.; arXiv 2602.08316v3, 6 May 2026; preprint). 1,100 base plus 376 related tasks, 51 repositories, 9 languages. Experience pool built with Claude Code (Sonnet 4.5); summaries average 217.1 tokens versus 25,633.7 for full trajectories. On the 99-task Lite related set, Claude Sonnet 4.5: no context 26.26% at $0.79; Oracle Summary 34.34% at $0.85; Oracle Context 27.27% at $0.77; Free Summary (agent picks) 22.22% at $0.91; Free Context 26.26% at $0.98. Quote: "unfiltered or incorrectly selected context provides limited or negative benefits." Oracle settings are upper bounds. [read, via digest] https://arxiv.org/html/2602.08316v3
- VibeMemBench (Fan et al., arXiv 2609.23570v1, 20 Sep 2026; preprint). 111 targets from 90 SWE-rebench V2 repositories. Resolve off -> frozen verified experience: deepseek-v4-pro 67.1 -> 67.1; glm-5 55.0 -> 57.4; kimi-k2.7-code 69.8 -> 74.3; glm-5.2 76.8 -> 80.4; qwen3.8-max 79.1 -> 80.2. Quote: "eleven of twelve solver and system pairings fail to exceed the matched memory-off baseline" for Mem0, SimpleMem, MemoryOS, A-MEM (best pairing +2.0, MemoryOS on glm-5). Irrelevant text lowered resolution by 0.7 to 3.4 pp. Every bootstrap interval for the frozen gains crosses zero. Tokens/steps tracked, dollars not: glm-5 input tokens 2.45M -> 1.93M per run. [read, via digest] https://arxiv.org/html/2609.23570
- MemCoder ("Your Code Agent Can Grow Alongside You with Structured Memory"; Deng et al., Tsinghua/Proxseer; arXiv 2603.13258v1, 25 Feb 2026; preprint). SWE-bench Verified (500), DeepSeek-V3.2: "9.4% improvement in resolved rate", 68.4 -> 77.8; GPT-5.2 83.8% at pass@2 versus OpenHands baselines at pass@3 (not like-for-like). Cost not reported. Memory is built from human-validated solutions; same-set leakage not checked in the digest. [abstract + digest] https://arxiv.org/html/2603.13258v1
- DeepWiki and repository wikis as a measured aid on cost or success: nothing beyond SWD-Bench found. Vendor posts (Cognition DeepWiki, LangChain OpenWiki) appeared in results but I did not open them (vendor claims, unread).
- Sleep-time compute remains the only general result (section 7); no code-agent version found.

#### Inferences
- Generated docs and repo wikis give at best a few points, and only 57 instances support it. Experience summaries are cheap in tokens (217 vs 25,634) but must be selected well: agent-selected summaries lowered success below no-context in SWE-ContextBench.

#### Gaps
- No measurement of cost effect of wiki/index preparation on a full SWE-bench run. Repository-memory systems (Mem0 and similar) mostly did not help in the one benchmark that tested them.

### 2.5 Distillation, from primary sources
- SWE-smith (Yang et al.; arXiv 2504.21798): "collecting 5,016 expert trajectories" with Claude 3.7 Sonnet in SWE-agent; student SWE-agent-LM-32B (Qwen2.5-Coder-32B base) "achieves 40.2%" on SWE-bench Verified, single attempt; teacher in the paper's Table 3: 58.2%. Base 32B score not reported in the page. Cost: "SWE-smith took about $1360 to create" (about $1,000 for the bug-generation methods, $160 for repo installation, $200 for issue generation); GPU hours and teacher-trajectory spend not isolated. Student/teacher = 40.2/58.2 = 69%. [read, via digest] https://arxiv.org/html/2504.21798v1
- SWE-Gym (Pan et al.; arXiv 2412.21139v2): base Qwen2.5-Coder-32B "3.0% and 7.0% on SWE-Bench Lite and Verified"; after fine-tuning "(3.0% -> 15.3%) and 13.6% (7.0% -> 20.6%)". Trajectories: "491 successful trajectories" by rejection sampling from gpt-4o-2024-08-06 and claude-3-5-sonnet-20241022. Environment build: "approximately 200 human annotation hours and 10,000 CPU core hours"; fine-tuning on 2-8 H100; no dollar total; tasks "costing usually $1 or more per task with frontier models". Verifier best-of-K gave 32.0% on Verified (secondary). Teacher score not given in the digest. [read, via digest] https://arxiv.org/html/2412.21139v2
- R2E-Gym (Jain et al.; arXiv 2504.07164): "Pass@1 of 34.4% on SWEBench-Verified benchmark with our 32B model"; "Best@26 performance of 51%" with hybrid verifier; teacher "Sonnet-3.5-v2"; "a total of 3321 successful trajectories from 2048 unique test environments"; base Qwen-2.5-Coder 32B 7.0% (+/-1.3). No dollar cost. Best@26 means 26 attempts plus a verifier. [read, via digest] https://arxiv.org/html/2504.07164
- SWE-Dev (Du et al.; arXiv 2505.16975) is a feature-driven development benchmark and training set, not SWE-bench Verified in the page I read: "14,000 training and 500 test samples"; 7B fine-tune Pass@1 on its hard split 6.68% -> 18.89%, easy 25.74% -> 36.90%, "comparable to GPT-4o" (19.13% hard). Teacher not named, no SWE-bench Verified number in the digest. CORRECTION: the 36.6% (32B) / 23.4% (7B) SWE-bench Verified figures from a search snippet for a THUDM "SWE-Dev" agent are [secondary] and I could not match them to this paper; they may belong to a different SWE-Dev work. [abstract/read via digest] https://arxiv.org/html/2505.16975
- SWE-Master (arXiv 2602.03411v2, 2026; preprint): teachers MiniMax-M2 and GLM-4.6; students Qwen2.5-Coder-32B-Instruct and Qwen3-4B-Instruct-2507; SWE-bench Verified Pass@1: 32B-SFT 57.8%, 32B-RL 61.4%, 32B-RL with test-time scaling @8 70.8%, 4B-RL 33.4%. Training "approximately 60K instances" for SFT; final trajectories in the table 12,567. Teacher's own score on the same scaffold not stated. It used RL, not only SFT, so it is not a pure distillation figure. Cost not reported. Nanbeige4.3-33B (vendor blog, Terminal-Bench 80.9) seen only as a snippet, vendor claim, not opened. [read, via digest] https://arxiv.org/html/2602.03411v2
- What it buys: a 32B student reaches about 34 to 41% by SFT on a few thousand teacher trajectories in 2025, and about 58 to 61% in 2026 with a 60K-instance pipeline plus RL, versus teachers in the 58 to 74% range on their own scaffolds. Not usable by an API-only harness.

### 2.6 Agent Workflow Memory, ExpeL, Reflexion, Memp (headline gains; use of outcome labels)
- Reflexion (Shinn et al.; arXiv 2303.11366; NeurIPS 2023). HumanEval Python pass@1 91.0% vs 80.1% (GPT-4); HumanEval Rust 68.0 vs 60.0; MBPP Python 77.1% vs 80.1% (a loss), MBPP Rust 75.4 vs 70.9. Outcome use: for programming, reflection uses self-generated unit tests, not hidden ground-truth tests; for decision tasks it uses the environment's binary success signal, and for HotpotQA exact-match grading against the answer. MBPP loss attributed to false-positive test rate 16.3% vs 1.4% on HumanEval. Memory is a sliding window within one task's retries. [read, via digest] https://arxiv.org/html/2303.11366
- ExpeL (Zhao et al.; arXiv 2308.10144; AAAI 2024). HotpotQA 28.0 -> 39.0; ALFWorld 40.0 -> 59.0; WebShop reward 0.665 -> 0.701. Outcome use: yes, success/failure from the environment reward labels trajectories and insights compare a failed with a successful trajectory of the same task. Insight writer ablation above (gpt-3.5 32.0 vs gpt-4 39.0). No coding benchmark. [read, via digest]
- Agent Workflow Memory (Wang et al.; arXiv 2409.07429). WebArena 35.5 vs 15.0 BrowserGym baseline (+12.0 absolute, 51.1% relative the digest says, about 2 fewer steps); Mind2Web +8.9 to +14.0 absolute over baselines. Outcome use: offline mode uses annotated training examples; online mode uses an LM evaluator's success label, not the ground truth, and the paper notes this "can lead to incorrect workflows that degrade model performance". Same model induces and acts; no cross-model test. No coding benchmark; no cost in dollars. [read, via digest] https://arxiv.org/html/2409.07429
- Memp (Fang et al.; arXiv 2508.06433). GPT-4o on ALFWorld test success 42.14 -> 77.86 with steps 23.76 -> 15.01; TravelPlanner commonsense 71.93 -> 79.94 while hard-constraint metric 12.88 -> 9.76 (worse). Outcome use: yes, relies on benchmark reward signals ("depends on explicit, benchmark supplied reward signals"); trajectories kept only if "terminated in successful task completion"; one condition uses gold training trajectories. Strong-to-weak transfer: see 2.1. No coding benchmark. [read, via digest] https://arxiv.org/html/2508.06433
- Flags for outcome use in the coding memory papers from the first pass: SWE-Exp and ReasoningBank rely on success/failure of the trajectory (ReasoningBank uses an LLM judge; SWE-Exp built experience from training trajectories on the benchmark); whether the experience bank was built from the same instances used for testing was not verified. ACE offline uses ground-truth labels (59.4 with, 57.2 without on AppWorld); online without labels falls on finance. Memory systems needing a verifier are weaker in a harness that has none at the point of use, though a harness can use test results from the repo's own tests.

### 2.7 Stale or wrong memory: measurements
- Impact Is Not Invalidation (Anand, Thomson Reuters; arXiv 2609.25130v1, 20 Sep 2026; single author; preprint). 10,369 claims from 23 Python libraries; 184 flips verified by running tests; held-out 604 claims, 151 flips. File-anchored invalidation (drop a memory when its source file changes): precision 0.21 (CI 0.16 to 0.26), recall 0.30; quote: "Content anchoring invalidates a claim whenever the artifact it came from changes, which fires constantly." Asking a model whether the specific claim still holds: precision 0.79, recall 0.72, "0.705 to 0.974" across models (Gemini 3.1 Flash-Lite, Gemini 2.5 Flash, Haiku 4.5, Sonnet 5, Opus 5); pytest-testmon recall 0.87 precision 0.41. [read, via digest] https://arxiv.org/html/2609.25130
- The Memory Trust Gap (Hu, Ramachandran, PayPal AI; arXiv 2609.01852v1, 1 Sep 2026; preprint). Not coding (scheduling, travel). Quote: "In the Benefit suite, models answer with the stale value 0.92-1.00 of the time at every scale." Larger models suffer most when a stale note looks current (8B reliance 1.00, net memory effect -1.00 at top trap level); dating the stale note newer "fools the larger models harder". Metadata helps larger models (+0.53, +0.54). Models 0.6B to 8B only. [read, via digest] https://arxiv.org/html/2609.01852
- STALE (arXiv 2605.06527; 400 scenarios, 1,200 queries): models can recognise a memory as outdated without applying the update; best model 55.2% (as cited in the Memory Trust Gap paper). Not opened. [secondary] https://arxiv.org/html/2605.06527v1
- Wrong or unfiltered experience: SWE-ContextBench Free Summary 22.22% vs 26.26% no-context (2.4); VibeMemBench irrelevant text -0.7 to -3.4 pp and 11 of 12 existing memory pairings no better than memory-off; SWE-Exp more experiences worse than one; MTL trajectory negative transfer (section 8 above).
- No study found measuring decay of coding-agent memory across a real commit history.

### 2.8 Remaining things I could not confirm
- Any strong-writes/weak-reads result on SWE-bench-type tasks with measured cost.
- Agent KB: last 23K characters (ablations, leakage handling); which model wrote experiences.
- SWE-Gym teacher score; SWE-smith base-model score; SWE-Master teacher score; any training-cost total for 2026 students.
- Which Gloaguen version produced the tables in section 3 (v1 vs v3).
- SWE-Dev SWE-bench Verified figures from the snippet (36.6% 32B, 23.4% 7B) remain [secondary] and unmatched.
- DeepWiki/Cognition, Letta, Anthropic engineering posts were not read; VibeMemBench's Mem0-style results are one benchmark.
- Full text of Reflexion/ExpeL/AWM/Memp/Voyager was read only through digests of the first 100K characters.

### 2.9 Updated closing lists (replace the earlier ones where they differ)

(1) Strongest evidence for an API-only coding harness:
1. Short, human-reviewed context file with only non-standard commands and conventions (Gloaguen: developer files +2.4 pp avg on their benchmark, not significant except against LLM files; Lulla: Codex output tokens -16.6%, correctness unmeasured). Skip auto-generated overviews.
2. Small, curated skill files, 1 to 3 per task (SkillsBench +16 pp mean across versions, only +4.5 pp in software engineering; these were human-curated).
3. Retrieval of 1 to few abstract insights written by a model (ReasoningBank +3.4 to +4.6 on SWE-bench Verified; MTL +3 to +6; SWE-Exp +2 to +5; VibeMemBench frozen verified experience +1.1 to +4.5, intervals include zero). Selection quality matters: agent-selected summaries lost 4 points (SWE-ContextBench).
4. Experience summaries with oracle-quality selection (SWE-ContextBench oracle summary 26.26 -> 34.34 at similar cost) suggest investing in the retrieval/selection step; not shown with a realistic retriever.
5. Claim-level validity checks for stored repository facts instead of file-change triggers (precision 0.79 vs 0.21; single author, Python libraries).
6. Plan caching for repetitive tasks (cost -46 to -50% per abstract; not on SWE-bench).

(2) Promising but not holding up:
- Model-generated repo overviews/context files (no success gain, about +20% cost).
- Self-written skills before the task (SkillsBench -1.3 pp).
- Off-the-shelf memory products for coding (Mem0, SimpleMem, MemoryOS, A-MEM: 11 of 12 pairings no better than none in VibeMemBench).
- Raw trajectory memory or naive strong-to-weak memory transfer (MTL, MemCollab).
- Large unversioned headline numbers (Agent KB first-version SWE-bench claim, SWE-Exp 41.6 vs 73.0 versions; SWE-Dev snippet figures).
- Generated wikis as a success booster: only +3.5 to +8.8 pp on 57 instances.
- Dynamic Cheatsheet for small models (Haiku AIME 2025 0.0 -> 13.3; losses on GPT-4o-mini).

(3) Open questions:
- Does a frontier model's distilled playbook/skill raise a cheap worker's SWE-bench score per dollar, and does the gain hold when the worker is weak enough to misuse it?
- Realistic retrieval: how close can a harness get to the oracle-selection result?
- Memory validity: cost of claim-level re-checking against repo history, and whether it keeps net gain positive.
- Is the Python-only evidence (Gloaguen, Lulla, Impact Is Not Invalidation) valid for other languages?
- Are the 2026 preprint gains (MemCoder, Ratchet, CODESKILL, VibeMemBench) independently reproducible, and were test instances separated from memory-building instances?
