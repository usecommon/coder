# Using several models at once: what the research says

*Researched on 15 November 2026. A survey of published work on methods in which more than one model, or more than one copy of a model, works on the same task: a worker with a reviewer or observer, a strong model directing a weak one, committees that vote or debate, blended answers, and several attempts with a selector. It was prompted by Galley's worker-and-reviewer mode ([`galley/README.md`](../galley/README.md#a-worker-and-a-reviewer-on-small-steps)). Companion notes: [model-switching.md](model-switching.md) covers what coding harnesses ship and routing between models; [beating-opencode.md](beating-opencode.md) covers several attempts with selection in more depth.*

**Evidence labels.** *[read]*: the paper's own text was read for this note. *[abstract]*: only its abstract. *[summary]*: the figure comes from a machine summary of a part of the page that was not read word for word, and should be checked before it is relied on. *[secondary]*: a third party's account. "Preprint" means not peer-reviewed as far as I could tell.

## Bottom line

- **The arrangement Galley now has, a cheap worker with a stronger model observing, has direct support in 2026 research.** Three studies report gains of 5 to 25 points on SWE-bench tasks when an observer model steers a weaker coding agent during the run. All three are preprints and all used weak workers that solved 3 to 24% alone.
- **The observer must be stronger or trained. A weak, untrained one makes things worse.** This is the most consistent finding across the literature, from 2023 code-repair studies to 2026 agent studies.
- **A model cannot reliably check its own work by rereading it.** A survey of the field found no fair demonstration of it. Feedback helps when it comes from running code, from a stronger model, or from a trained critic.
- **Review once, in a fresh context.** A second review round found more real problems but 62% more false ones. A reviewer in a new session did better than a second look in the session that wrote the work.
- **Reviewers are wrong often.** In the controlled review studies about two findings in three were false or duplicates. In one observer study the authors traced more than half of the remaining failures to the observer's own advice.
- **Cutting work into small pieces helps weak models and needs a good plan.** A strong model that plans for a weak one recovered 98% of the strong model's quality at 18% of its cost on document tasks. A bad plan is worse than none.
- **Committees: voting works, debate adds little, and mixing unequal models lowers quality.** When two models are both wrong they give the same wrong answer 60% of the time, so a committee gains less than independent members would.
- **Several independent attempts with a selector that runs code remains the best-supported way to raise a pass rate,** at several times the cost.
- **What I would change in Galley as a result** is in [section 6](#6-what-this-says-about-galleys-worker-and-reviewer-design): have the reviewer check the plan, let it observe during a step and not only at the end, and give it test output to read.

## 1. The methods at a glance

| Method | What happens | Best evidence | Effect | Cost |
|---|---|---|---|---|
| **Observer or critic during the run** | A second model reads the worker's progress every few steps and advises or vetoes | Three 2026 preprints on SWE-bench | +5 to +25 points for weak workers | From less than the worker alone (runs end sooner) to 5 times with a top model observing |
| **Review after the work** | A second model reads the finished piece and reports problems | Controlled studies with planted errors, 2026 | A strong second model finds somewhat more; a weak one finds less than self-review | One request per piece |
| **Strong model plans, weak model works** | The strong model cuts the task into small pieces and assembles the results | Minions (ICML 2025); BudgetMLAgent | 98% of the strong model's quality at 18% of its cost; or better than the strong model alone at 6% of its cost | A fraction of the strong model |
| **Planner and editor** | One model writes the plan, another the edits | Aider; harness ablation 2026 | Lifts weak models (+11.6 points); for strong ones it only saves money | Varies |
| **Voting** | Several independent answers, the majority wins | Many | Reliable, modest | Times the number of voters |
| **Debate** | Models read each other's answers and revise | Many, and many rebuttals | Little or nothing beyond voting | More than voting |
| **Blending** | A model merges several models' answers | Mixture-of-Agents and its rebuttal | Worse than several answers from the best model alone | Times the number of models |
| **Several attempts and a selector** | Independent full attempts; a test run or trained critic picks one | Many on SWE-bench | +6 to +17 points | Times the number of attempts |
| **Search across models** | A search procedure chooses which model takes each step | Sakana AB-MCTS | 23% to over 30% on a puzzle benchmark | 250 calls per task |

## 2. A second model that checks or steers the first

### What is established about feedback

| Study | Finding |
|---|---|
| **Olausson and others, "Is Self-Repair a Silver Bullet for Code Generation?"** (MIT and Microsoft, 2023) *[read]* | Letting a model repair its own failed code barely beats drawing fresh samples at the same budget: between 0.97 and 1.05 times for GPT-4 on hard problems. **When the feedback came from a stronger model, repair beat both alternatives at every budget.** Human feedback raised GPT-4's repair rate from 33.3% to 52.6%. GPT-4's own feedback was wrong in 32 of 80 cases, humans' in 7 of 80. Conclusion: models "are held back by their inability to reliably produce accurate and useful feedback on why the code is wrong." |
| **Kamoi and others, "When Can LLMs Actually Correct Their Own Mistakes?"** (survey, 2024) *[read]* | "No major work shows successful self-correction of responses from LLMs using feedback generated by prompting themselves under fair settings in general tasks." It works where reliable outside feedback exists, code execution above all, or where a feedback model was trained on large data. Many positive results used hidden answers or weak baselines. |
| **Panickssery and others, "LLM Evaluators Recognize and Favor Their Own Generations"** (NeurIPS 2024) *[abstract]* | Models can tell their own output from others' and rate it higher. The better they recognise it, the stronger the bias. |

- **This is what our own runs showed.** A reviewer of the worker's own strength passed solutions that then failed the hidden tests, three times out of three.

### Review after the work is done

A series of 2026 preprints by one author (Song) planted 150 errors in 30 pieces of work (code, documents, scripts) written by Claude Opus 4.6 and measured how many each kind of review found. *[read]*

| Review by | Errors found (recall) | Share of findings that were right (precision) | Combined score (F1) |
|---|---|---|---|
| A second pass in the same session | 22.7% | 21.0% | 21.7% |
| A helper told what was asked for | 21.8% | 27.4% | 23.8% |
| The same session, once | 28.3% | 26.2% | 27.1% |
| **The same model in a fresh session, shown only the work** | 27.1% | 31.5% | **28.6%** |
| A light model of another maker (Gemini 2.5 Flash) | 20.0% | 35.1% | 24.0% |
| **A top model of another maker (GPT-5.4)** | 38.4% | 28.6% | **32.3%** |

- **A fresh session beats a second look in the same one** (28.6% against 21.7%, significant). The author's explanation: the session that wrote the work "does not scrutinize; it rationalizes."
- **A strong second model found the most errors, but the lead over the fresh same-model review is not statistically significant.** A light second model did worse than self-review: "lightweight cross-model reviewers offered no advantage."
- **Two different reviewers cover more than two of the same.** One same-model plus one other-maker review found 56.7% of the errors; two same-model reviews found 42.7%.
- **More rounds make it worse.** In a follow-up study with its own scoring, a second round raised recall by 8 points and false findings by 62%; the combined score fell from 0.376 to between 0.263 and 0.303. The exchange was about one new real error for nine new false ones. "The optimal number of review rounds is one." Three independent single reviews with a majority vote scored 0.393.
- **Precision is low everywhere:** about 30%. Two findings in three are false or duplicates.
- **Limits:** one author, not peer-reviewed, planted errors, one authoring model, and the studies do not separate "a different model" from "a stronger model".

A separate report on finding security defects (Agarwal, 2026, one author) *[read]* adds two things. A critic from another maker caught errors that reviewers from the same maker had approved (3 of 19 proposed fixes). And reasoning has a ceiling: ten agents "unanimously confirmed" a vulnerability that did not exist, and "one test killed what 80+ agents' reasoning could not."

### An observer during the run

This is the closest published work to "a worker and an observer". All are 2026 preprints on SWE-bench.

| Study | Worker | Observer | When it speaks | Result |
|---|---|---|---|---|
| **Steer, Don't Solve** (Carnegie Mellon) *[read]* | Six open models that solve 3 to 22% alone | A small model (4 or 8 billion parameters) trained on critiques written by Claude Opus 4.6 | Every 5 or 10 steps, with high-level guidance only | +5.6 to +16.0 points; for example 21.6% to 37.6% |
| The same study, with the teacher itself as observer | Qwen3-32B, Qwen3-Next | **Claude Opus 4.6** | The same | 8.8% to 26.8% and 20.0% to 38.2%; for the first, cost per task rose from $0.05 to $0.28 |
| The same study, untrained small observer | GPT-OSS-120B | Qwen3-4B as shipped | The same | **20.4% to 16.8%: worse** |
| **Cadence** (Singapore Management University, UCL) *[read, part summary]* | A small model that solves 17% alone | A stronger model that reads the recent steps and the next proposed action, and may advise or veto | At an interval that tightens after a veto and widens after mere advice | 17.0% to 34.0% at a fixed interval of 5 steps; 42.3% with the adaptive interval *[summary]*, using fewer tokens than the fixed one |
| **FLARE** *[abstract, part summary]* | Four mid-range models | A small trained model that judges each completed step | After every step; a "critical" verdict makes the worker redo the next action | One guided run beats five unguided ones at a fifth of the tokens |
| **Advisor Models** (Berkeley, ICML 2026) *[read, part summary]* | A model used as it is, with no access to its weights | A small model trained to write per-task advice | Before the work | Tax-rule task 64.8% to 76.8%; a coding agent needs 25% fewer steps at the same pass rate; **an untrained advisor lowered the score to 52.0%** |

What these agree on:

- **A stronger or trained observer helps a weak worker a great deal.** The largest gains come with the strongest observer.
- **An untrained weak observer hurts.** Two of the studies measured it.
- **How often it looks matters.** In Cadence, runs heading for failure were rescued 23.9% of the time when checked every 3 steps and 14.2% when checked every 15. For runs that were going well, checking less often cut the overhead by a third at no loss. Hence the adaptive interval.
- **The observer is the next bottleneck.** In Cadence's failure analysis 57.7% of the remaining failures were put down to the observer (wrong diagnosis, inaccurate guidance) and 39.4% to the worker not following valid guidance *[summary]*. In Steer, Don't Solve only 29% of the small critic's critiques were both correct and specific.
- **Limits:** the workers start from 9 to 24%, far from saturated; none of the studies compares against simply running the strong model as the worker; cost is reported unevenly.

### The reverse: a weaker model checking a stronger one

Research on AI safety studies this deliberately: a strong model that is not trusted, checked by a weaker one that is (Greenblatt and others, Redwood Research, 2023) *[read]*.

- **A weaker checker costs little usefulness when it only flags or edits the suspicious part.** Having GPT-3.5 edit the most suspicious fifth of GPT-4's solutions kept 94% of GPT-4's usefulness; monitoring alone kept 97%.
- **Its purpose is safety, not quality.** It caught planted backdoors (safety 92% against 15% without it). Nothing suggests a weaker checker raises the quality of honest work.

### Role-playing teams for code, 2023 and 2024

Several widely cited systems give copies of one model different roles: AgentCoder (programmer, test designer, a script that runs the tests), MapCoder (retrieve, plan, code, debug), PairCoder (navigator and driver), INTERVENOR (a teacher that diagnoses compiler errors for a learner), MetaGPT and ChatDev (a simulated software company). *[read, part summary]*

- **Reported gains were large:** AgentCoder took GPT-4 from 67.6% to 96.3% on HumanEval; INTERVENOR took GPT-3.5 from 60.3% to 75.6%.
- **In every one of them code is run and the errors are fed back.** By the survey above, that is the part that works.
- **Later audits were sober.** A Berkeley study of seven such frameworks found failure rates of 41 to 86.7% and gains over a single agent that "often remain minimal", including against plain repeated sampling. ChatDev solved 25% of one programming set before the auditors' fixes and 40.6% after.

## 3. A strong model that cuts the work into pieces for a weak one

| Study | Arrangement | Result |
|---|---|---|
| **Minions** (Stanford, ICML 2025) *[read]* | The strong model writes small subtasks without seeing the documents; a small local model runs them in parallel; the strong model assembles the answers or asks for another round | **97.9% of the strong model's quality at 18% of its cost.** A free conversation between the two instead: 87% at one thirtieth of the cost |
| The same study, on why | | Small models break on multi-part instructions (56 points lost going from one part to four) and on long inputs (13% lost) |
| **Division-of-Thoughts** (2025) *[read, part summary]* | Split the task; a small trained classifier sends each piece to the small or the large model | 84% lower cost at about the accuracy of the best baseline |
| **BudgetMLAgent** (TCS, 2024) *[read]* | A free model plans and works; GPT-4 is an "expert" it may ask at most five times a run, when stuck or after repeated failures | **Success 33.0% against 22.7% for GPT-4 alone, at $0.054 a run against $0.931** |
| **A million-step task with zero errors** (Meyerson and others, 2025) *[read]* | The task is cut into the smallest possible steps; one agent does one step; several copies vote on each step; odd-looking answers are discarded | A puzzle of over a million steps solved without one error. Small cheap models were the most economical per step. It assumes the steps are known in advance and can be compared exactly |
| **An Empirical Study of Harness Design for Coding Agents** (2026) *[read, part summary]* | A planning step switched on and off, four models, SWE-bench Verified | The weakest model rose from 13.6% to 25.2%. The three stronger ones changed by −0.4 to −2.6 points; two of them cost about 30% less and one a third more |
| **From Plan to Action** (2026) *[abstract]* | 21,120 runs with eight kinds of plan | A good plan improves results and reminders of it help. "A subpar plan hurts performance even more than no plan at all" |

- **Pieces help the weak model, and the strong model should do the cutting.** In every arrangement that worked, planning sat with the stronger model or with a fixed recipe.
- **Asking for help a few times is enough.** BudgetMLAgent's cap of five expert calls a run still beat the expert working alone.
- **These tasks could be cut up.** Document questions, puzzles and pipelines split cleanly. Anthropic's own report on its multi-agent system (+90.2% on research tasks, using about 15 times the tokens of a chat where one agent uses about 4 times) notes that "most coding tasks involve fewer truly parallelizable tasks than research." *[read]*

## 4. Committees: voting, debate and blending

### Debate against voting

| Study | Finding |
|---|---|
| **Debate or Vote** (Wisconsin, NeurIPS 2025) *[read]* | With five copies of a model on seven benchmarks: alone 72%, after two rounds of debate 74%, **a plain majority vote with no debate 77%**. A proof shows debate alone does not raise the expected share of correct answers |
| **Should we be going MAD?** (2023) *[abstract]* | Debate methods "do not reliably outperform" simpler ones such as taking the majority of repeated answers, and are sensitive to settings |
| **Stop Overvaluing Multi-Agent Debate** (2025) *[abstract]* | Five debate methods, nine benchmarks, four models: they "often fail to outperform" one model thinking step by step, while using more compute. Mixing different models is the one change that helps consistently |
| **ReConcile** (North Carolina, ACL 2024) *[read]* | Three different models at a round table beat three copies of one (79.0% against 66.7% on one benchmark). GPT-4 alone still beat the table on two of the five benchmarks and was within 1.5 points on two more |

### Blending answers

- **Mixture-of-Agents** (Together AI, 2024) *[read]*: six open models answer, then models rewrite using all the answers, for three layers. 65.1% on a chat-quality benchmark against 57.5% for GPT-4o.
- **The rebuttal** (Princeton, 2025) *[read]*: doing the same with several answers from **the single best model** scored 65.7% where the mix of different models scored 59.1%. "Mixing different LLMs often lowers the average quality." Mixing won only when the models were equally good and good at different things, by a fraction of a point.

### Why a committee gains less than it should

- **Models make the same mistakes** (ICML 2025) *[read]*. Across more than 350 models, when two are both wrong they choose the same wrong answer 60% of the time; chance would be 33%. Models of one maker or one design agree more, and so do more accurate models. "Using multiple different models is not a panacea."
- **The trend is toward more agreement** *[abstract]*: "model mistakes are becoming more similar with increasing capabilities," and a model acting as judge favours models that resemble it.
- **More voters are not always better** (2024) *[abstract]*: more calls raise accuracy on easy questions and lower it on hard ones, so the total can go down.
- **Voting still helps when failures are correlated.** A 2026 replication of a classic software experiment found coding agents' failures correlated beyond chance, and a three-version majority vote still cut failures by two thirds *[secondary]*.

### Many agents on one task

- **Towards a Science of Scaling Agent Systems** (Google and MIT, 2025) *[read, part summary]*: 260 configurations, six benchmarks. Teams gained 81% on a financial analysis task that splits into parallel parts and lost 39 to 70% on a planning task that does not. On SWE-bench Verified every team arrangement was slightly worse than one agent *[summary]*. Teams stop paying once a single agent passes about 45%. Agents working independently multiplied errors 17 times; a central coordinator held that to 4 times.
- **On mixing strong and weak in one team** *[summary]*: teams with a central coordinator and mixed strengths scored 12.6 points below teams made only of the strong model, and strong workers mattered more than a strong coordinator.

## 5. Several attempts and a selector

[beating-opencode.md](beating-opencode.md) reviews the earlier work. New or newly read here:

| Study | Arrangement | Result |
|---|---|---|
| **DEI** (Salesforce, ICLR 2025) *[read]* | A committee of different coding agents; a model scores each candidate fix | Best member 27.3%, committee **34.3%**, perfect choice 54.3%: the selector captured a quarter to a third of what was there. "Different agents resolve more distinct issues than different runs of a single agent" |
| **OpenHands critic** (2025, 2026) *[read, abstract]* | A trained critic picks among attempts | 60.6% to 66.4% with five attempts. A critic trained on benchmark outcomes was near chance on real-world outcomes |
| **R2E-Gym** (Berkeley, 2025) *[read]* | Two kinds of selector, and both together | One attempt 34.4%; selecting by generated tests 43.7%; by a trained reader 42.8%; **both 51.0%**. Readers "often rely on stylistic features"; tests cannot separate candidates that pass the same tests |
| **Scaling Test-Time Compute for Agentic Coding** (Meta and others, 2026) *[read, part summary]* | Each attempt is summarised; summaries compete in rounds of voting; new attempts start from the best summaries | Claude Opus 4.5 from 70.9% to 77.6% on SWE-bench Verified and 46.9% to 59.1% on Terminal-Bench 2.0, with 16 attempts per round |
| **Does Fault Localization Beat a Fresh Attempt?** (2026) *[abstract]* | Repairing the located fault against simply trying again | The fresh attempt won 40 to 3. Small models only |
| **AB-MCTS** (Sakana AI, 2025) *[read, blog]* | A search that learns during the task which of three models to call next | 23% for one model sampled repeatedly, 27.5% with the search, over 30% with three models. One model used another's wrong answer as a hint and solved the task |
| **SWE-Debate** (2025) *[read]* | Copies of one model argue over where the fault is and how to fix it | 41.4% against 38.8% without the debate |
| **Model Cascading for Code** (2024) *[abstract]* | The small model's answer is run against tests it wrote itself; a larger model is called if they fail | 26% lower cost on average at equal or better accuracy |

- **Selection by running code and selection by a trained reader each capture part of the gain; together they capture more.**
- **Different agents add variety that reruns of one agent do not,** which is the best published argument for a mixed committee. It needs the selector to be realised.

## 6. What this says about Galley's worker-and-reviewer design

**What the design already does that the research supports:**

| Design choice | Support |
|---|---|
| The reviewer is a different, stronger model | Stronger feedback is the kind that helps; a weak reviewer hurts |
| It reviews in its own request, not in the worker's session | The fresh-session result |
| One review per step, and the fix is not reviewed again | "The optimal number of review rounds is one" |
| It sees the step and its diff, not the whole history | Small, focused reviews; the reviewers that saw less did no worse |
| The worker is told the reviewer can be wrong and must check each point | Reviewer precision of about 30% |
| The worker cannot call the reviewer; the harness decides | A weak model is a poor judge of when it needs help |
| Work is cut into steps | Weak models break on multi-part tasks |
| It is consulted on signals of trouble | BudgetMLAgent's expert calls |

**What the research says to change:**

| # | Change | Why | Size |
|---|---|---|---|
| 1 | **The reviewer checks the plan before work starts** | The worker, the weaker model, writes the plan now. In the studies the stronger model plans, and a bad plan is worse than none | One short request per task |
| 2 | **The reviewer also observes during a step,** every few steps, looking more often after it has found something | The largest measured gains come from guidance during the run, and the right interval adapts | One request per look |
| 3 | **Give the reviewer test output, not only code to read** | Reading-only review is the weakest kind; one test settles what many reviewers cannot | Needs a check command per project |
| 4 | **For several reviews, use different reviewers and take what two agree on** | Two different reviewers cover more; a vote of single reviews beat extra rounds | Optional; costs a second review |
| 5 | **Do not build debate or blending** | No reliable gain over voting; mixing unequal models lowers quality | None |

**What to expect, and where:**

- **Most gain where the worker is weak for the task.** The observer studies start from workers solving 3 to 24%. `deepseek-flash` solves about 70% of our Exercism tasks and 38.5% of the hard terminal tasks on the official board, so the hard tasks are where this should show.
- **Not a saving against the strong model on small tasks.** A strong observer multiplied cost by five in the one study that priced it.
- **The observer's errors become the limit.** Expect some good work to be disturbed by wrong advice.

## 7. What the research does not answer

- **No study I found measures exactly this design:** a cheap worker, a strong reviewer on small steps, on coding tasks, compared at equal cost with the strong model working alone.
- **The observer studies are preprints from 2026** on one benchmark family with weak workers.
- **Cost is often missing.** Several papers report tokens for the worker and not for the observer.
- **Whether a different maker matters, or only strength,** is not separated in the review studies.
- **How small a step should be** has one theoretical treatment (the million-step study) and no measurement on software tasks.

## Sources

**A second model that checks or steers**
- [Is Self-Repair a Silver Bullet for Code Generation?](https://arxiv.org/abs/2306.09896)
- [When Can LLMs Actually Correct Their Own Mistakes? A Critical Survey](https://arxiv.org/abs/2406.01297)
- [LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2404.13076)
- [Cross-Context Review](https://arxiv.org/abs/2603.12123), [More Rounds, More Noise](https://arxiv.org/abs/2603.16244), [When Does a Second Model Help?](https://arxiv.org/abs/2610.01471)
- [Refute-or-Promote](https://arxiv.org/abs/2604.19049)
- [Steer, Don't Solve](https://arxiv.org/abs/2606.21811), [Cadence](https://arxiv.org/abs/2610.12269), [FLARE](https://arxiv.org/abs/2609.23808), [SupervisorAgent](https://arxiv.org/abs/2510.26585), [Advisor Models](https://arxiv.org/abs/2510.02453)
- [AI Control: Improving Safety Despite Intentional Subversion](https://arxiv.org/abs/2312.06942)
- [AgentCoder](https://arxiv.org/abs/2312.13010), [MapCoder](https://arxiv.org/abs/2405.11403), [PairCoder](https://arxiv.org/abs/2409.05001), [INTERVENOR](https://arxiv.org/abs/2311.09868), [MetaGPT](https://arxiv.org/abs/2308.00352), [ChatDev](https://arxiv.org/abs/2307.07924)
- [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657)

**A strong model directing a weak one**
- [Minions](https://arxiv.org/abs/2502.15964), [Division-of-Thoughts](https://arxiv.org/abs/2502.04392), [BudgetMLAgent](https://arxiv.org/abs/2411.07464)
- [Solving a Million-Step LLM Task with Zero Errors](https://arxiv.org/abs/2511.09030)
- [An Empirical Study of Harness Design for Coding Agents](https://arxiv.org/abs/2609.20804), [From Plan to Action](https://arxiv.org/abs/2604.12147), [FlowPlan](https://arxiv.org/abs/2611.13241)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

**Committees**
- [Debate or Vote](https://arxiv.org/abs/2508.17536), [Should we be going MAD?](https://arxiv.org/abs/2311.17371), [Stop Overvaluing Multi-Agent Debate](https://arxiv.org/abs/2502.08788), [ReConcile](https://arxiv.org/abs/2309.13007)
- [Mixture-of-Agents](https://arxiv.org/abs/2406.04692), [Rethinking Mixture-of-Agents](https://arxiv.org/abs/2502.00674), [LLM-Blender](https://arxiv.org/abs/2306.02561)
- [More Agents Is All You Need](https://arxiv.org/abs/2402.05120), [Are More LLM Calls All You Need?](https://arxiv.org/abs/2403.02419)
- [Correlated Errors in Large Language Models](https://arxiv.org/abs/2506.07962), [Great Models Think Alike and this Undermines AI Oversight](https://arxiv.org/abs/2502.04313), [N-Version Programming with Coding Agents](https://arxiv.org/abs/2606.20158)
- [Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296)

**Several attempts and a selector**
- [DEI: Diversity Empowers Intelligence](https://arxiv.org/abs/2408.07060), [OpenHands critic](https://openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model), [A Rubric-Supervised Critic from Sparse Real-World Outcomes](https://arxiv.org/abs/2603.03800), [R2E-Gym](https://arxiv.org/abs/2504.07164)
- [Scaling Test-Time Compute for Agentic Coding](https://arxiv.org/abs/2604.16529), [Does Fault Localization Beat a Fresh Attempt?](https://arxiv.org/abs/2609.00854)
- [AB-MCTS](https://arxiv.org/abs/2503.04412) and [Sakana's write-up](https://sakana.ai/ab-mcts/), [SWE-Debate](https://arxiv.org/abs/2507.23348), [Model Cascading for Code](https://arxiv.org/abs/2405.15842), [Coder Reviewer Reranking](https://arxiv.org/abs/2211.16490)

**Surveys**
- [Harnessing Multiple Large Language Models: A Survey on LLM Ensemble](https://arxiv.org/abs/2502.18036)
- [LLM-Based Multi-Agent Systems for Software Engineering](https://arxiv.org/abs/2404.04834)
