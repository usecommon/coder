# Research notes: further ways to use several models

*15 November 2026. The raw notes behind [the report](../../reports/Multi%20model%20methods%20further%20areas.md). Read the report first; come here for the detail of one study or to see what was searched.*

- **One file per area.** Each was written by a separate research pass that searched and read sources on its own area only.
- **Two passes per file.** The first pass ends with a list of gaps. The section headed "Second pass (gaps closed)" fills what it could and corrects the first pass where it was wrong. Where the two differ, the second pass is right.
- **The notes are left as written.** They were not edited afterwards, so a few figures in them are superseded. [verification.md](verification.md) lists 23 papers that were fetched again by a separate reader, and what differed. Where a notes file and the report disagree, the report follows the checked reading.
- **Evidence labels.** *[read]*: the figure came from the page's full text. *[abstract]*: from its abstract only. *[secondary]*: from a search summary or a third party's account. Pages were read through a fetch tool that returns a model-made extract, not the raw page, so every figure should be checked against its source before it is relied on.

| File | Area |
|---|---|
| [routing_and_cascades.md](routing_and_cascades.md) | Choosing a model per request, task or step; cheap first and stronger on a signal; what a hand-over in the middle of a run costs |
| [failure_signals.md](failure_signals.md) | How a harness can tell that a run is failing: run features, the agent's own report, tests, judges, early stopping and restarts |
| [helper_models.md](helper_models.md) | Small models for one job: applying edits, searching code, pruning context, approving commands |
| [search_and_evolution.md](search_and_evolution.md) | Tree and evolutionary search with several models; mixed-model entries on leaderboards; the limits of resampling |
| [tests_as_cross_check.md](tests_as_cross_check.md) | Tests written by one model for another's code; reproduction tests; test gaming; property-based testing |
| [automatic_design.md](automatic_design.md) | Searching for the arrangement of agents, a model per role, one model tuning another's prompts, harnesses that rewrite themselves |
| [knowledge_transfer.md](knowledge_transfer.md) | Memory, playbooks, skills, context files, generated documentation and distillation |
| [token_level_collaboration.md](token_level_collaboration.md) | Mixing models token by token or step by step; speculation; reasoning effort and the prompt cache |
| [agent_teams.md](agent_teams.md) | Teams of agents dividing a software job: large vendor builds and the controlled comparisons |
| [verification.md](verification.md) | The second, independent check of 23 papers |
