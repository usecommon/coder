# Who Leveraged the Claude Code Leak? — Evidence Beyond GitHub

_Research compiled 2026-10-08. Third report in this series; see [coding-harnesses.md](./coding-harnesses.md) and [claude-code-leak-derivatives.md](./claude-code-leak-derivatives.md) (which covers the GitHub forks and rewrites)._

This report looks past the GitHub repos to find **who actually used the knowledge and architecture exposed on March 31, 2026**. That includes academics, security researchers, companies and products, Chinese industry, educators and media, lawyers and investors, and governments.

## How to read the evidence

Every claim is graded, because a lot of the commentary on the leak is speculation:

| Grade | Meaning |
|---|---|
| **Confirmed** | Primary source (paper, vendor write-up, official statement) shows direct use of the leaked source |
| **Reported** | Credible secondary reporting (major outlet) of direct use; no primary confirmation found |
| **Claimed** | A single blog or aggregator asserts it; unverified |
| **Convergent** | The feature looks similar, but there's no evidence of copying. It may be independent invention or learning from public docs |

**Headline finding:** the best-documented use of the leak is for **analysis**: academic papers, security research, legal commentary and teaching. **No major company has publicly admitted building product from the leaked code.** Claims that competitors "copied" it are mostly speculation or convergence; the strongest cases are research labs and security firms, not product teams.

---

## 1. Academic research — Confirmed

The leak gave researchers their first full view of a frontier lab's production harness, and it quickly became a citable primary source.

| Paper | Who | When | How it used the leak | Key outputs |
|---|---|---|---|---|
| **"Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems"** (arXiv 2604.14228) | Jiacheng Liu, Xiaohan Zhao, Xinyi Shang, Zhiqiang Shen: **MBZUAI VILA Lab + UCL** | Apr 14, 2026 (2 weeks after the leak) | Analysed the publicly available TypeScript source (reportedly v2.1.88, ~1,884 files); compared it with **OpenClaw** and, in a later version, **Hermes Agent** | Traces 5 human values → 13 design principles → implementation choices. Finds a simple while-loop core wrapped in heavy infrastructure: a 7-mode permission system with an ML classifier, 5-layer compaction, 4 extension mechanisms (MCP, plugins, skills, hooks), subagent orchestration, append-oriented sessions. Shows the same design questions get different answers by deployment (per-action safety evaluation vs perimeter access control). Companion repo: `VILA-Lab/Dive-into-Claude-Code`. |
| **"Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents — A Source-Code Study of Eleven Systems"** (arXiv 2609.00006, 83 pp.) | Paul Barbaste, Tristan Darrigol, Germain Vu, Tom Wiltberger | v1 Jul 15, 2026; second edition of an April 2026 study | Includes Claude Code among 11 source-analysed harnesses (with Codex CLI, Gemini CLI, Mistral Vibe, OpenHands, Aider, mini-SWE-agent, Hermes, Pi, OpenCode, OpenClaw); references the March source exposure and claw-code | 7 canonical subsystems, 29 design patterns, 13 observations, 18 recommendations, a 90-line minimum-viable harness. Findings: no harness uses a general agent framework; none uses vector retrieval for code; **skills (9/11) now lead MCP (8/11)**; ACP adds "harness hosting"; **"convergence is turning into imitation"** (shown by diffing harnesses over a quarter); policy is moving from prompt text into configuration. Thesis: in H1 2026 the harness went from tool to platform. |
| "Inside the Scaffold: A Source-Code Taxonomy of Coding Agent Architectures" (arXiv 2604.03515) | — | Apr 2026 | Source-code taxonomy of coding agents (how much of it covers Claude Code is unclear) | — |
| Wider wave of "harness" papers (2607–2609): *An Empirical Study of Harness Design for Coding Agents*, *HarnessSafe*, *HarnessCompass*, *ToFu*, *The Devil Is in the Interface*, *Code as Agent Harness* | Various | May–Sep 2026 | Not confirmed to use leaked code. Part of the research field the leak helped turn "harness engineering" into | Benchmarks and safety evaluations of harness design |

**Significance:** the leak turned "how does a production coding agent actually work?" from guesswork into a citable research topic. The "Harness Engineering" paper's finding that convergence is becoming imitation is the closest thing to empirical evidence that harnesses copy each other after the leak. It shows copying of behaviour, not of code.

---

## 2. Security research — Confirmed

Readable source code makes security auditing much faster, for defenders and attackers alike. This is the most concrete, verifiable use of the leak.

| Who | What they did | Outcome |
|---|---|---|
| **Adversa AI** (Israeli AI-security firm) | Read `bashPermissions.ts` and found a cap of **50 subcommands** for per-subcommand security analysis (internal ticket CC-643). Above the cap, the check fell back from *deny* to *ask*. Proof of concept: 50 × `true` + `curl` got past a deny rule, and could be triggered by a poisoned `CLAUDE.md` in a cloned repo. Also noted that a fixed tree-sitter parser existed in the code but wasn't enabled in public builds. | Rated High severity; covered by The Register, SecurityWeek, SC World, InfoWorld. Fix reportedly shipped in v2.1.90 (not confirmed by Anthropic). |
| **Community researchers / CVE filers** | Code review of the leaked client found command-injection paths | **CVE-2026-35020** (CVSS 8.4, `TERMINAL` env var), **CVE-2026-35021** (7.8, `promptEditor.ts`), **CVE-2026-35022** (9.8), published ~Apr 6, 2026. _Reported_ by secondary trackers; no NVD/Anthropic advisory found. |
| **Zscaler ThreatLabz** | Tracked attackers using the leak as bait: SEO-boosted fake "leaked Claude Code with unlocked enterprise features" repos | Delivered **Vidar** infostealer + **GhostSocks** proxy (BleepingComputer, The Register, Bitdefender) |
| **Trail of Bits** (Dan Guido) | Public assessment of the leak's impact | "Embarrassing but not dangerous": the server-side capabilities can't be copied from client code |
| **Reddit researcher → WSJ / The Register / SCMP** | Found obfuscated code in post-leak builds (from ~v2.1.91, Apr 2026) that detected China-linked users and proxies and encoded the result in invisible characters in the system prompt | Anthropic (Thariq Shihipar): "an experiment we launched in March… to prevent account abuse from unauthorized resellers and protect against distillation." A related steganography mechanism was reportedly removed in v2.1.198 (Jul 1). |
| **Analysts (Engineer's Codex and others)** | Documented the anti-distillation decoys (`fake_tools`), `CONNECTOR_TEXT` signed summaries, and Zig-level attestation | Argued all of them can be bypassed with a MITM proxy or an environment flag. Commentators link the exposed attestation to Anthropic's Apr 4 decision to stop subscriptions covering third-party harnesses. |

**Note:** the fingerprinting found by researchers was itself a *reaction* to leak-era threats (resellers and distillation). The leak sped up a security arms race between Anthropic and both third-party harnesses and Chinese labs.

---

## 3. Companies and products

### 3.1 Anthropic — Confirmed (official roadmap, previewed by the leak)
- Features exposed behind flags later shipped or became public in some form. **ULTRAPLAN** (remote long-horizon planning) is reported as officially launched; agent teams, background/scheduled sessions, push notifications and PR subscriptions now exist publicly (KAIROS-like capabilities). **BUDDY** was scheduled for an Apr 1–7 limited release; whether it shipped is unconfirmed. Boris Cherny said Anthropic is "on the fence" about KAIROS itself.
- Effect: competitors saw Anthropic's roadmap months early ("can no longer be surprised by it", GoodAI).

### 3.2 OpenClaw ecosystem — Convergent / Claimed
- **OpenClaw added "Dreaming"** (experimental) on **Apr 5, 2026**, five days after the leak exposed Claude Code's `autoDream`: background memory consolidation in light → REM → deep phases, promoting durable facts into `MEMORY.md`, later with a Diary Timeline UI and REM Backfill. Developers noticed the resemblance to KAIROS/autoDream; there is no evidence of copied code.
- Community plugins followed: `openclaw-auto-dream`, ClawHub `memory-dreaming`; for **Hermes Agent** (Nous Research), a `hermes-dreaming` nightly consolidation plugin and daily-summary skills.
- GoodAI called the leak "the most powerful accelerant" for OpenClaw and links OpenAI's reported Feb 2026 acquisition of OpenClaw to the "orchestration is where value lives" thesis. _Claimed_; the acquisition and its link to the leak are unverified here.

### 3.3 DeepSeek — Convergent (timing worth noting)
- DeepSeek posted "Harness PM / Harness R&D" jobs (May 15–20, 2026) naming **Claude Code first** among competitors. Researcher Deli Chen announced a team to build a "Code Harness from the ground up". **DeepSeek Harness** shipped Aug 13 with the slogan **"Model + Harness = Agent"**, the same framing that dominated Chinese analysis of the leak (see §4).
- Its features (append-only session logs, subagents, skills, plan/approval flows, auto-approval reviewer, scheduled tasks) overlap with what the leak showed, but most were already public across the industry. **No evidence of leaked code**; it's MIT-licensed and independently designed on the Cordis framework.

### 3.4 Chinese coding-tool vendors — Claimed
A Towards AI article (unverified, single source) says:
- **Tencent**: CodeBuddy is building a multi-subagent system "directly inspired by" Claude Code's Coordinator pattern, and Tencent Cloud developers published five agent design patterns taken from the source (prompt-cache segmentation, Coordinator + sub-agents, 4-tier permission chains, filesystem-based memory, multi-agent collaboration).
- **Alibaba**: Tongyi Lingma is "studying Claude Code's memory architecture for integration with Qwen models."

I couldn't confirm either against Tencent or Alibaba sources. Related confirmed context: **Alibaba banned Claude Code internally from Jul 10, 2026** (directing staff to its own **Qoder**), after the fingerprinting revelations and Anthropic's accusation that Alibaba distilled its models.

### 3.5 Western competitors (Cursor, Windsurf, Cline, OpenCode, Codex) — Convergent only
- Commentary (eWeek, The Neuron, VentureBeat, paddo.dev) calls the leak "a literal blueprint" for rivals, but **no named company has acknowledged using it**, and I found no product announcement credibly tied to leaked code.
- One Substack note claims the leaked source references **OpenCode** "to copy its behavior", i.e. influence running the *other* way. Unverified.
- Ideas the industry now shares (skills, subagents, plan mode, hooks, layered memory files) were mostly public before the leak, so similarity alone proves nothing.

### 3.6 Vendors who turned the leak into marketing and content — Confirmed
Tenki (code review), MindStudio, Definable, Superframeworks, Phosai Labs, StartupHub, Noqta, aithinkerlab and others published "what the leak teaches" posts, usually to promote their own agent products. These are a sign of interest, not of architectural reuse.

---

## 4. Chinese developer community — Reported

- **SCMP**: the leak "ignited a frenzy among Chinese developers"; the original post passed **33M views**, and developers rushed to download and study the code.
- **36Kr / Geek Park** (Apr 1): "How should Chinese AI companies learn from Claude Code?", set against ByteDance **Trae** (from MarsCode), Zhipu **CodeGeeX**, Alibaba **Tongyi Lingma**, Doubao MarsCode. Deep dives followed within 48h.
- Juejin, Zhihu, WeChat groups, **BAAI Hub**, **01.me** (detailed teardown: ~40 tools, 5-layer compaction, prompt-cache economics, CLAUDE.md memory, Dream, parallel side queries, speculative execution), **80aj.com** (7-module breakdown: startup, REPL, Query Loop, tool runtime, permissions, tasks, extensions), bestblogs.dev.
- The **"Agent = Model + Harness"** formula was everywhere in these posts and then appeared in DeepSeek's harness hiring and product messaging (§3.3).
- Irony noted by Towards AI: Anthropic blocks Chinese access to Claude, and then the leak handed Chinese developers the full client.
- Government: on **Jul 8, 2026** a vulnerability platform under China's MIIT (reported as NVDB or CNNVD) issued a **"backdoor" warning** for Claude Code v2.1.91–2.1.196 over the location and identity fingerprinting. Anthropic disputes it; no independent technical verification.

---

## 5. Education and media — Confirmed

| Who | What they did |
|---|---|
| **DeepLearning.AI (The Batch / Charon Hub)** | "Inside Claude Code": coverage of KAIROS and autoDream |
| **Educative** | "What the Claude Code leak reveals about AI systems" (learning content) |
| **InfoQ, VentureBeat, Axios, Bloomberg/BGOV, The Register, TechRadar, Decrypt, heise, GIGAZINE, The Decoder, Cybernews, The Week, eWeek, The Neuron** | News and analysis; GIGAZINE published "Claude Code Unpacked" and roadmap pieces |
| **Engineer's Codex, paddo.dev, Layer5, akitaonrails, Solomon Neas, Medium/DEV authors** | Architecture teardowns (prompt-cache boundary, fork/teammate/worktree subagents, layered memory, critic permission checks) |
| **Independent guides** | `claude-code-analysis`, an 18-chapter guide with every claim cited to a source path, frozen at the March snapshot; `claude-code-design-guide` (6551Team); FlorianBruniaux's *claude-code-ultimate-guide* harness chapter; skills.sh "dive-into-claude-code-analysis" skill |
| **Course platforms (Udemy etc.)** | General Claude Code / harness-architecture courses. No "build Claude Code from the leak" course found (which would carry IP risk anyway) |
| **Video** | Many YouTube explainers ("7 secrets exposed", etc.) |

These sources mostly spread the same ideas: cache-aware prompts, staged compaction, layered memory, permission critics, subagent execution models. That is the main way leak knowledge entered general engineering practice.

---

## 6. Legal and policy community — Confirmed

- **Bean, Kinney & Korman** (Andrew W. Gregg, Kandis M. Koustenis), Apr 13: *"512,000 Lines, One Night, Zero Permission: The Claude Code Leak and the Legal Crisis of AI Clean Rooms."*
  - Clean-room design is evidence of independent creation, not a statutory defense (*Computer Associates v. Altai*, *Google v. Oracle*, Phoenix BIOS).
  - claw-code fed leaked source straight into an AI. Whether that counts as "clean room" is untested, and switching languages doesn't automatically defeat similarity.
  - **This cuts both ways for Anthropic:** under the Copyright Office's Jan 2025 guidance (and with *Thaler v. Perlmutter* cert denied, Mar 2026), largely AI-written code may not be copyrightable, which could weaken Anthropic's own claims given that its engineers say much of Claude Code is AI-written.
  - Trade-secret claims survive even where copyright fails, depending on whether Anthropic took reasonable secrecy measures.
  - As of Apr 8: no litigation and no formal post-mortem.
- **IPKat**: analysis of the 8,100-repo DMCA over-reach.
- **TechRadar** ("the irony is rich"), **Gal Ratner** ("Anthropic's spectacular hypocrisy on code, copyright and the public domain"): framed the takedowns against Anthropic's own training-data fair-use stance.

---

## 7. Investors and strategists — Confirmed (opinion)

- **GoodAI Capital**: the leak shows the harness is now **table stakes**; durable value moves to the "constraint layer" (enterprise trust and security, always-on inference economics, vertical workflow integration). It uses this to support its own Fund II thesis. Commenters push back that data, model quality and brand trust are stronger moats.
- **Amp** ("The Coding Agent Is Dead", Feb 2026, before the leak) and the leak together fed the 2026 consensus that **models, not wrappers, differentiate**. Despite that, the most-starred new repos of the year were harnesses.

---

## 8. Synthesis

| Group | Leveraged the leak? | How | Evidence |
|---|---|---|---|
| Academic researchers (MBZUAI/UCL; Barbaste et al.) | **Yes** | Design-space and taxonomy papers using the source | Confirmed |
| Security firms (Adversa, Zscaler, Trail of Bits) and CVE filers | **Yes** | Vulnerability discovery, threat tracking | Confirmed / Reported |
| Attackers | **Yes** | Malware lures (Vidar, GhostSocks) | Confirmed |
| Anthropic | Its roadmap was exposed | Shipped some flagged features; tightened anti-abuse measures (fingerprinting, subscription rules) | Confirmed |
| OpenClaw / Hermes ecosystem | Possibly | "Dreaming" memory consolidation 5 days later | Convergent / Claimed |
| DeepSeek | Indirectly at most | Harness team and "Model + Harness = Agent" framing after the leak; independent code | Convergent |
| Tencent, Alibaba product teams | Unclear | Said to study Coordinator and memory designs | Claimed |
| Cursor, Windsurf, Cline, OpenCode, Codex | No evidence | Similar features predate the leak or were public | Convergent |
| Chinese developer community | **Yes** | Mass study; architecture teardowns | Reported |
| Educators and media | **Yes** | Courses, guides, explainers | Confirmed |
| Law firms and commentators | **Yes** | Clean-room and AI-copyright analysis | Confirmed |
| Investors | **Yes** | Thesis-building | Confirmed |

### Conclusions
1. **The leak's lasting impact is educational, not code reuse.** It made production harness design citable and teachable, and it pushed "harness engineering" into a recognised discipline (several 2026 arXiv papers; the "Agent = Model + Harness" framing).
2. **Security research was the most concrete win, for both sides.** Real vulnerabilities were found and fixed (the 50-subcommand deny bypass, injection CVEs), and attackers used the leak's popularity for malware.
3. **Corporate adoption is unproven.** Every "competitor X copied Y" claim found is either single-source or explained by convergence. Any legitimate company would avoid admitting it given the copyright and trade-secret exposure.
4. **Second-order effects may matter more than the code:** Anthropic's tighter anti-distillation and anti-abuse posture, the China fingerprinting dispute and Alibaba ban, changing subscription rules for third-party harnesses, and an unresolved AI-clean-room legal question.

### Gaps and next steps
- Primary confirmation for Tencent CodeBuddy and Alibaba Tongyi Lingma (their changelogs or Chinese-language engineering blogs).
- NVD or Anthropic advisories for CVE-2026-35020/35021/35022.
- Full text of the 36Kr and SCMP pieces (both blocked to automated fetch).
- Whether OpenAI acquired OpenClaw (Feb 2026), as GoodAI asserts.

---

## Sources

**Academic**
- https://arxiv.org/abs/2609.00006 (Harness Engineering, 11 systems)
- https://www.alphaxiv.org/resources/2604.14228 · https://sotaverified.org/papers/260414228 · https://gittrend.io/repo/VILA-Lab/Dive-into-Claude-Code · https://arxiviq.substack.com/p/dive-into-claude-code-the-design
- https://arxiv.org/pdf/2609.20804 · https://arxiv.org/pdf/2608.06984 · https://arxiv.org/pdf/2608.01918 · https://arxiv.org/pdf/2607.11423 · https://arxiv.org/pdf/2608.11386

**Security**
- https://adversa.ai/?p=345670 · https://www.theregister.com/2026/04/01/claude_code_rule_cap_raises/ · https://securityweek.com/critical-vulnerability-in-claude-code-emerges-days-after-source-leak · https://scworld.com/brief/claude-code-vulnerable-to-prompt-injection-due-to-subcommand-limit · https://infoworld.com/article/4154199/claude-code-is-still-vulnerable-to-an-attack-anthropic-has-already-fixed.html
- https://letsdatascience.com/news/anthropic-leak-exposes-claude-code-command-injection-cb8a8d11
- https://www.bleepingcomputer.com/news/security/claude-code-leak-used-to-push-infostealer-malware-on-github/ · https://www.theregister.com/2026/04/02/trojanized_claude_code_leak_github/
- https://read.engineerscodex.com/p/diving-into-claude-codes-source-code

**Companies, China and policy**
- https://goodai.substack.com/p/the-claude-code-leak-what-it-reveals
- https://knightli.com/en/2026/04/12/openclaw-dreaming-machine-dreams-humans-lose-sleep/ · https://mem0.ai/blog/openclaw-vs-hermes-agent-memory-comparison · https://hermes-agent.nousresearch.com/docs/zh-Hans/plugins/hermes-dreaming
- https://www.verdent.ai/guides/what-is-deepseek-code
- https://pub.towardsai.net/anthropic-blocked-china-from-using-claude-then-accidentally-gave-them-the-entire-source-code-ed31321d141b
- https://eu.36kr.com/en/p/3747753489613318 · https://www.scmp.com/tech/tech-trends/article/3348817/anthropics-ai-code-leak-ignites-frenzy-among-chinese-developers
- https://01.me/en/2026/04/blog-claude-code/ · https://www.80aj.com/2026/04/01/claude-code-leak-agent-architecture/ · https://hub.baai.ac.cn/view/53619 · https://www.bestblogs.dev/article/b97a04d3
- https://the-decoder.com/claude-codes-complicated-china-problem-involves-bans-on-both-sides-of-the-pacific/ · https://www.implicator.ai/alibaba-bans-claude-code-over-anthropics-hidden-china-fingerprinting.md
- https://www.thestandard.com.hk/innovation/article/336678/China-issues-backdoor-security-alert-over-Anthropics-Claude-Code · https://www.gigazine.net/gsc_news/en/20260709-china-cnndv-claude-code-backdoor · https://www.igorslab.de/en/china-vulnerability-database-warns-about-claude-code/
- https://www.techsy.io/en/blog/claude-code-leaked-features-2026 · https://www.gigazine.net/gsc_news/en/20260402-claude-code-source-leaked-reveal-antrhropics-plans

**Legal**
- https://www.beankinney.com/news-and-insights/blogs/512000-lines-one-night-zero-permission-the-claude-code-leak-and-the-legal-crisis-of-ai-clean-rooms/
- https://ipkitten.blogspot.com/2026/04/the-claude-code-leak-that-spurred-8100.html · https://www.techradar.com/ai-platforms-assistants/claude/the-irony-is-rich-anthropic-issues-copyright-takedown-requests-in-attempt-to-stem-claude-code-leak · https://galratner.substack.com/p/anthropics-spectacular-hypocrisy

**Education and media**
- https://charonhub.deeplearning.ai/claude-codes-source-code-leaked-exposing-potential-future-features-kairos-and-autodream/ · https://www.educative.io/blog/claude-source-code-leaked · https://infoq.com/news/2026/04/claude-code-source-leak · https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know · https://www.axios.com/2026/03/31/anthropic-leaked-source-code-ai · https://eweek.com/news/anthropic-claude-code-leak-ai-agent-neuron/ · https://www.theneuron.ai/explainer-articles/anthropic-leaks-claude-code-a-literal-blueprint-for-ai-coding-agents/ · https://gigazine.net/gsc_news/en/20260402-claude-code-unpacked · https://x-cmd.com/install/claude-code-analysis · https://gittrend.io/repo/6551Team/claude-code-design-guide · https://www.tenki.cloud/blog/claude-code-source-leak-ai-agent-transparency · https://www.mindstudio.ai/blog/claude-code-source-code-leak-hidden-features · https://goelh.substack.com/p/claude-code-is-16-intelligence-and · https://techie007.substack.com/p/how-memory-compaction-works-in-agents
