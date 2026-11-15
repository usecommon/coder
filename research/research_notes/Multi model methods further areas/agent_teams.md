# Agent teams that divide a software job (2024 to 15 Nov 2026)

Method note: about 16 tool calls. Labels: [read] = seen in a page I fetched (the fetch tool returns a model-made extract of the page, so these are not verbatim reads); [abstract] = abstract only; [secondary] = search-result summary or third-party account, page not opened. "Vendor" = company post, not independently checked. Model names (GPT-5.6 Luna/Terra/Sol, Opus 4.8/5.5, GLM-5.2, GPT 6 Sol) appear as printed on the fetched pages; I could not check them elsewhere. Not opened (or unreadable): the AOrchestra paper body (PDF text did not decode), the SWE Atlas paper body, the DoltHub posts, Gas Town primary posts, Fortune/Digit pieces, Microsoft "Fork-and-Flush", AsynCodeBench, the ESEM 2026 paper, Codex multi-agent, Google Jules/Antigravity, Factory, OpenHands refactoring, HyperAgent/MASAI/CodeR/Magentic-One/SWE-EVO/NL2Repo/ProjDevBench (not searched; coverage gaps).

## (a) Reported large builds by agent teams

### Takeaway
Hierarchy (planner / worker / judge) beat flat peer coordination in Cursor's reports; Anthropic's compiler used flat peers but with a strong external oracle (test suites, GCC). All big results are vendor or anecdote, with simple verifiable success criteria. Costs are known only for the compiler (about $20k) and DoltHub's Gas Town use ($3k to $6k).

### Cited Findings
- Cursor, "Scaling long-running autonomous coding" (Wilson Lin, 14 Jan 2026, vendor post). Self-coordination via a shared file with locks failed: locks held too long or never released; "Twenty agents would slow down to the effective throughput of two or three." Optimistic concurrency (version-checked writes) was simpler but without hierarchy agents became risk-averse, avoided hard tasks and churned. Final: planners (can spawn sub-planners), workers (do not talk to other workers, push to the same branch), a judge at each cycle end, then fresh restart. An integrator role was removed as a bottleneck. [read] — [Cursor](https://cursor.com/blog/scaling-agents)
- Same post: browser from scratch ran "close to a week", over 1M lines across 1,000 files; Solid-to-React migration over three weeks, +266K/-193K edits, passed CI, still needs review; Rust video-rendering rewrite 25x faster; ongoing projects Java LSP (7.4K commits, 550K LoC), Windows 7 emulator (14.6K commits, 1.2M LoC), Excel (12K commits, 1.6M LoC). "Trillions of tokens"; no cost figures; no independent evaluation. [read] — [Cursor](https://cursor.com/blog/scaling-agents)
- Models by role (Cursor): GPT-5.2 better at extended autonomous work than Opus 4.5 (which "stops earlier and takes shortcuts"); GPT-5.2 a better planner than GPT-5.1-Codex. Worker/judge models not specified. "The harness and models matter, but the prompts matter more." [read] — [Cursor](https://cursor.com/blog/scaling-agents)
- Cursor, "Towards self-driving codebases" (Feb 2026, vendor): root planner (no coding) -> recursive subplanners -> workers in own repo copies returning a handoff (what was done, concerns, findings) that flows back up so planners adjust. Peak ~1,000 commits/hour, 10M tool calls over a week, hundreds of agents per machine. Failures: lock contention, rigid planner-executor-judge pipeline limited by slowest worker, an overloaded "continuous executor" that slept, declared early completion, merged poorly; integrator bottleneck; demanding perfect commits serialized work; disk I/O from concurrent builds; first architecture could not evolve; agents pulled in dependencies instead of implementing. The authors accept a steady error rate and a final reconciliation pass. No tokens or cost. [read] — [Cursor](https://cursor.com/blog/self-driving-codebases)
- Independent-ish account: the browser was described as glitchy by a commenter; Fortune noted costs can be large [secondary, search snippets only] — [Fortune](https://fortune.com/2026/01/23/cursor-built-web-browser-with-swarm-ai-agents-powered-openai/), [the-decoder](https://the-decoder.com/cursors-agent-swarm-tackles-one-of-softwares-hardest-problems-and-delivers-a-working-browser/). I did not open these, so quality by independent account remains unverified.
- Anthropic (Nicholas Carlini, Feb 2026, vendor post), C compiler: 16 parallel Claude Opus 4.6 agents, each in its own Docker container, cloning a bare git upstream; a `while true` loop reruns Claude Code with a prompt file. Task claiming by writing a file in `current_tasks/`; git sync makes the second claimant pick another. No orchestrator, no channel beyond git. Some agents given specialist jobs (dedupe code, performance, docs). Nearly 2,000 sessions over about two weeks, ~2B input and 140M output tokens, just under $20,000. ~100K-line Rust compiler; builds bootable Linux 6.9 on x86/ARM/RISC-V; compiles QEMU, FFmpeg, SQLite, postgres, redis; ~99% on most compiler test suites incl. GCC torture suite; runs Doom. [read] — [Anthropic](https://www.anthropic.com/engineering/building-c-compiler)
- Compiler failures/limits: 16-bit real-mode x86 not produced (calls GCC); own assembler/linker "still somewhat buggy"; output less efficient than GCC with optimizations off; new features frequently broke existing ones (CI later added); merge conflicts "frequent" but Claude resolves them; on the Linux kernel all agents hit the same bug and overwrote each other's fixes, so adding agents did not help until GCC was used as an oracle (random files compiled by GCC, rest by Claude's compiler, plus delta debugging) to split the work. Author unease that passing tests can be mistaken for done. [read] — [Anthropic](https://www.anthropic.com/engineering/building-c-compiler). Critics' claims (no typechecking, hello-world problems) seen only as social posts in search snippets, unverified [secondary].
- Gas Town (Steve Yegge, Jan 2026): Mayor (stateful coordinator) plus disposable "polecats", Refinery for merges, Witness/Deacon supervisors, Beads task tracking, built on Claude Code [secondary] — [heise](https://heise.de/-11178824), [ascii.co.uk](https://ascii.co.uk/news/article/news-20260102-190a5f9f/steve-yegge-releases-gas-town-multi-agent-orchestrator-for-c). DoltHub's field reports: ~$3,000 over 30 to 40 hours of active use in week one (metered Anthropic API); later post says about $6,000 over two weeks; all 87,000 SQLite acceptance tests reportedly pass in a Go-to-C rewrite project [secondary, search snippets] — [DoltHub week 1](https://www.dolthub.com/blog/2026-03-24-a-week-in-gas-town), [DoltHub week 2](https://www.dolthub.com/blog/2026-04-16-two-weeks-in-gastown). A search summary also reported "$100/hour burn" and failing tests being auto-merged, but a follow-up search could not confirm the merge claim; treat as unverified anecdote.
- Cognition: Devin has a manager/child mode ("map-reduce-and-manage", coordinated via internal MCP); problems: managers over-prescribe without codebase context, agents wrongly assume shared state with children, children do not report upward by default. Cognition says the big public demos (200k LOC browser, 100k LOC compiler) had simple verifiable success criteria that most real software lacks. [read, vendor] — [Cognition](https://cognition.com/blog/multi-agents-working)
- Not found / not opened: OpenAI Codex multi-agent reports, Google Jules/Antigravity, Factory, OpenHands large-refactoring work, Claude Code agent teams feature details (only appear indirectly). Treat as gaps.

### Inferences
- The two reported successes share an external oracle (browser spec/tests, compiler test suites + GCC). Where the oracle was weak (kernel bug), more agents did not help.
- Flat-peer coordination worked for Anthropic only because tasks were naturally independent failing tests, claimed by file; Cursor's flat attempt at larger scale degraded.

### Gaps
- No independent quality audit of the Cursor browser found; no Cursor cost; no model per judge/worker role.

## (b) Controlled evidence: single agent vs orchestrator/sub-agents

### Takeaway
Controlled evidence is thin and mixed: gains of a few to ~10 points on some benchmarks at 2x to 7x cost, near zero on others; reasoning effort on a single agent can beat adding a team. I found no SWE-bench Pro study of delegation.

### Cited Findings
- CAID (Geng and Neubig, CMU, arXiv 2603.21489, Mar 2026, preprint): manager builds dependency graph, engineers in separate git worktrees, merges commits; OpenHands Agent SDK. Commit0-Lite: Sonnet 4.5 53.1 single vs 59.1 CAID; MiniMax 2.5 42.3 vs 57.0; GLM 4.7 42.8 vs 46.5. PaperBench (Code-Dev): Sonnet 4.5 57.2 vs 63.3; MiniMax 2.5 10.4 vs 36.7; GLM 4.7 38.0 vs 45.4. Cost (unitless) Sonnet Commit0 1.9 -> 8.1, PaperBench 3.3 -> 9.3; wall-clock not reduced (e.g. 692.6s -> 1583.2s). Worktree isolation beat "soft" isolation (63.3 vs 55.5 PaperBench; 59.1 vs 56.1 Commit0). Commit0: 4 engineers best (59.1), 8 worse. Doubling single-agent iterations 100 to 200: marginal change. Manager "round review" 60.2% vs self-verification 55.1%. [read; last ~35K characters unread] — [arXiv](https://arxiv.org/html/2603.21489v1)
- Vals AI, Vibe Code Bench teams (vendor/benchmark-company blog, 2026): 50 apps, each setup run once; lead spawns up to 5 subagents. Sol medium 77.6% ($1.22) solo vs 84.9% ($3.07) team (+7.3, p=0.005); Sol max 89.0 vs 90.4 (ns); Opus medium 91.5 vs 91.2 (ns); Opus max 89.8 ($23.77) vs 93.2 ($122) (ns). Cost 1.8x to 5.1x. Single Sol at max effort gained 11.4 over medium (p<0.001), more than the team did. Single run per cell; only 1 of 4 significant. [read] — [Vals AI](https://www.vals.ai/blogs/multi-agent-vibe-code-bench)
- Cohere, ProgramBench (200 programs rebuilt from a black-box executable; vendor blog, 2026): Sol solo 52.1% (minimal prompt) / 57.7% (structured prompt); blocking team 61.8% / 63.1%; teams cost 4 to 7x solo. Delegating only planning 63.6% at $249 vs all stages 63.2% at $510. More planners help (59.6% at 2 to 61.8% at 16); more implementers did not. Async minimal team (55.9%) fell below solo with a better prompt (57.7%). On Commit0 implementation delegation was most useful in 8 of 10 setups but 12 of 16 tasks were saturated. Opus 4.7 rarely delegated; Haiku 4.5 and a Flash model delegated but gained nothing. Other models single runs. [read] — [Cohere](https://cohere.com/blog/lessons-from-scaling-teams-of-frontier-coding-agents)
- Blackbox AI (vendor blog, 22 Jun 2026): Terminal-Bench 2.0 (89 tasks), Opus 4.8 orchestrator + GLM-5.2 executor 69.7 ($2.40/task) vs GLM-5.2 solo 58.4 ($0.84); Kimi K2.7 executor 58.4 ($1.85); swapping the orchestrator to GPT-5.5 "roughly halved" the score. Vendor, single run, no solo-orchestrator baseline reported on the page. [read] — [Blackbox](https://www.blackbox.ai/blog/orchestrator-executor-multi-agent-system-for-swe-tasks)
- AOrchestra (Ruan et al., arXiv 2602.03786, Feb 2026, preprint): orchestrator creates sub-agents as (Instruction, Context, Tools, Model) tuples; with Gemini-3-Flash, "16.28% relative improvement over the strongest baseline" on GAIA, SWE-Bench, Terminal-Bench. [abstract] (body unreadable) — [arXiv](https://arxiv.org/abs/2602.03786)
- SWE Atlas (Scale AI et al., arXiv 2605.08366, May 2026): in a Claude Code harness Opus 4.6 and Sonnet 4.6 spawned sub-agents in ~96%/99% of codebase-QnA trials (Opus ~2.6 per trial) while Gemini 3.1 Pro did so in ~1% [secondary, search snippet]; whether sub-agent use changed scores not determined — [arXiv](https://arxiv.org/pdf/2605.08366)
- Secondary roundups (unverified, 4 to 220x token claim, Terminal-Bench mixed +1.7% / -19.2%, 6.2x tokens hybrid) [secondary, aggregator] — [Medium](https://medium.com/@mjgmario/single-agent-vs-multi-agent-systems-when-coordination-helps-hurts-and-pays-off-57735ee7916d), [Augment](https://www.augmentcode.com/guides/single-agent-vs-multi-agent-ai). Practitioner claim that Opus 4.6 over-delegates [secondary] — [HatchWorks](https://hatchworks.com/blog/claude/claude-sub-agents-and-agent-teams/).

### Inferences
- Pass-rate gains are real on from-scratch/long-horizon builds (Commit0, ProgramBench, PaperBench), small or null on tasks a strong single agent already handles, and often below what spending the same on reasoning effort buys.
- Planning/exploration delegation looks like the cost-effective slice; parallel implementation shows diminishing returns past ~4 workers (CAID, Cohere).

### Gaps
- No SWE-bench Pro, Terminal-Bench or SWE-Lancer controlled sub-agent study read; Magentic-One, HyperAgent, MASAI, CodeR, SWE-EVO, NL2Repo, ProjDevBench not searched.

## (c) Which model in which role

### Takeaway
Evidence favors a strong lead/planner; weak lead is the worst case. Cohere and Blackbox contradict a simple "strong workers matter more" reading; Cursor's data points to which model is good at long autonomous work rather than a lead/worker split.

### Cited Findings
- Cohere: with Luna workers fixed, lead Luna 42.5%, Terra 51.6%, Sol 60.5%; Terra lead + Luna workers (51.6%) trailed solo Sol (57.7%); Sol lead + 16 Luna planners 61.8% at $155 vs $510 all-Sol team; cheap planners kept 47.5% of the gain for 13.9% of the extra cost. [read, vendor] — [Cohere](https://cohere.com/blog/lessons-from-scaling-teams-of-frontier-coding-agents)
- Blackbox: orchestrator choice dominated; executor choice mattered (GLM-5.2 beat Kimi K2.7 by 11.3). [read, vendor] — [Blackbox](https://www.blackbox.ai/blog/orchestrator-executor-multi-agent-system-for-swe-tasks)
- Cursor: pick per-role models; GPT-5.2 over Opus 4.5 for long runs and planning. [read, vendor] — [Cursor](https://cursor.com/blog/scaling-agents)
- Cognition "smart friend": cheap fast primary (SWE-1.5) calling Sonnet 4.5 worked poorly because the weak primary was the ceiling; works "when both models are strong". [read, vendor] — [Cognition](https://cognition.com/blog/multi-agents-working)
- CAID gains were largest for the weakest model (MiniMax 2.5 +26.7 on PaperBench) [read, preprint] — [arXiv](https://arxiv.org/html/2603.21489v1).

### Inferences
- Contradiction with the earlier-survey claim: for planning-heavy tasks a strong coordinator mattered more (Cohere, Blackbox); the earlier claim may hold for implementation-heavy SWE-bench-style tasks. All are single-run vendor results with different model families.

### Gaps
- No controlled swap of strong/cheap on SWE-bench Pro style issue-fixing.

## (d) Opposing position

### Takeaway
Cognition (June 2025) argued against multi-agent on context dispersal; its April 2026 update keeps that for parallel writers but endorses single-threaded writes with extra agents adding intelligence (review, smart friend, manager/child).

### Cited Findings
- "Don't Build Multi-Agents" (Walden Yan, 12 Jun 2025, vendor): decisions get too dispersed and context cannot be shared thoroughly [secondary summary; page appeared in search, not fetched] — [Cognition](https://cognition.com/blog/dont-build-multi-agents)
- April 22 2026 update: "Our original observations still hold today for parallel-writer swarms"; unstructured agent networks "mostly a distraction"; Devin Review catches on average 2 bugs per Devin PR, ~58% severe, with a reviewer deliberately given no prior context (clean context vs "context rot"); coding agent filters review findings using full task context. [read, vendor, no baseline stated] — [Cognition](https://cognition.com/blog/multi-agents-working)
- Open problems named: when a weak model should escalate; how a child surfaces discoveries that change siblings' work; context transfer without overload. [read] — same.
- Practitioner critique: single loop often beats sub-agents because each delegation layer loses context (PostHog cited) [secondary] — [DEV](https://dev.to/tony__vi/you-dont-need-sub-agents-1eh7). Counter-essay: [Cosine](https://cosine.sh/blog/why-you-should-build-multi-agents) (opinion).
- Vals result (reasoning effort beats team for Sol) and CooperBench (below) are the strongest empirical support for the opposing view.

### Gaps
- Original 2025 post not fetched; Microsoft "Fork-and-Flush" (claimed 0.78 vs 0.47 on long tasks) seen only via a blog summary [secondary] — [yage.ai](https://yage.ai/share/multi-agent-what-it-buys-en-20261021.html).

## (e) Shared repositories: avoiding and resolving conflicts

### Takeaway
What worked: isolated worktrees/clones, a coarse task claim, hierarchical task assignment, agents resolving their own conflicts, and an external oracle to split work. What failed: shared-file locks, a single integrator, strict per-commit correctness.

### Cited Findings
- CooperBench (arXiv 2601.13295, Jan 2026, preprint): 652 two-agent tasks, 12 libraries, 4 languages; agents get different features on the same repo state, can only message; 77.3% of tasks have conflicting reference solutions. GPT-5 and Sonnet 4.5 reach ~25% in cooperation, about 50% below solo; average ~30% lower; success 68.6% (2 agents) -> 46.5% (3) -> 30.0% (4) on 46 tasks. Messaging did not significantly raise success but reduced naive merge conflicts; up to ~20% of steps spent on communication. Failure symptoms: work overlap 33.2%, divergent architecture 29.7%, repetition 14.7%. No cost reported. [read; last ~9K chars unread] — [arXiv](https://arxiv.org/html/2601.13295v1)
- CAID: worktree isolation beat soft isolation; conflicts resolved by the engineer who authored the commit; communication via structured JSON and commits; no quantitative communication ablation or conflict counts. [read] — [arXiv](https://arxiv.org/html/2603.21489v1)
- Cohere: optional `send_message` between agents: no gain for Sol/Terra teams, -4 to -7 points for Luna teams; communication mostly upward. [read, vendor] — [Cohere](https://cohere.com/blog/lessons-from-scaling-teams-of-frontier-coding-agents)
- Anthropic compiler: file-based claim + git sync; merge conflicts frequent but agent-resolved. [read] — [Anthropic](https://www.anthropic.com/engineering/building-c-compiler). Cursor: integrator removed, workers handle conflicts. [read]
- Also surfaced, not opened: AsynCodeBench (Sep 2026, dependency-graph tasks) [secondary] — [alphaxiv](https://alphaxiv.org/abs/2609.32662v1); ESEM 2026 study of a shared Git workspace on SWE-Bench Pro [secondary] — [Dagstuhl](https://drops.dagstuhl.de/storage/00lipics/lipics-vol394-esem2026/LIPIcs.ESEM.2026.18/LIPIcs.ESEM.2026.18.pdf).

### Inferences
- No clean measured comparison of shared task list vs files vs direct messages exists in what I read; the nearest evidence says direct messages add cost but little accuracy, structured handoffs up a hierarchy work better.

## (f) Cost and wall-clock

### Cited Findings
- Compiler: ~$20k, ~2B in / 140M out tokens, 16 agents, ~2 weeks [read, vendor].
- Gas Town via DoltHub: ~$3k (30 to 40 h) and ~$6k (two weeks) [secondary].
- Vals: 1.8x to 5.1x cost; Cohere: 4 to 7x cost, async teams 60% faster than blocking for minimal prompt, 19.5% for structured; CAID: cost 2.4x to 4.3x (Sonnet: 1.9->8.1) and runtime up, not down [read].
- Cursor: no cost; throughput claims ~1,000 commits/hour, flat locking collapsed 20 agents to 1 to 3 effective [read, vendor].
- Anthropic research system 15x tokens is already covered by the earlier survey.
- Noam Brown: four parallel agents roughly halve time while doubling price for parallelizable work [secondary, via yage.ai].

## Benchmarks built for teams
- CooperBench (above, preprint): first results show a coordination penalty. AsynCodeBench (Sep 2026) [secondary, unopened]. Vals Vibe Code Bench teams and ProgramBench are team-vs-solo comparisons by vendors.

## Final lists

### (1) Practices with the strongest evidence for an API-only harness
1. Delegate planning/exploration to a strong lead, not implementation fan-out (Cohere, Vals; vendor, single runs).
2. Isolate each worker (worktree or own clone); keep merges simple and let the author resolve conflicts (CAID ablation, Anthropic, Cursor).
3. Keep writes single-threaded or tightly partitioned; add agents as reviewers with clean context (Cognition, vendor, no baseline).
4. Cap team size at about 4 workers (CAID, Cohere, CooperBench).
5. Compare against spending the same budget on higher reasoning effort for one agent (Vals).
6. Give workers a verifiable oracle/test suite and hierarchical task assignment (Anthropic, Cursor).

### (2) Promising but failed or withdrawn
- Shared-file locks and equal-status peers (Cursor); optimistic concurrency without hierarchy (Cursor); integrator role (Cursor); strict per-commit correctness (Cursor); rigid planner-executor-judge pipeline (Cursor, superseded by recursive planners); free-form agent messaging (CooperBench, Cohere); weak lead with cheap workers (Cohere); smart-friend with a weak primary (Cognition); Claude Opus 5 teams dropped for timeouts at about $500/task (Cohere).

### (3) Open questions
- Does delegation help on SWE-bench Pro / SWE-Lancer-style issue fixing at matched cost? Independent audits of Cursor's browser and the compiler? Per-role model results from Cursor? Codex, Jules, Factory, OpenHands refactoring reports not covered. Measured comparison of communication media. Replication with multiple runs (most results are single-run vendor data).
