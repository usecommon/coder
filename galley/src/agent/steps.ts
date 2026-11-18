// A task done in small steps. The model plans first, without changing anything; each step is then a turn of its
// own. A step is a unit small enough to check: with a reviewing advisor configured, the second model reads that
// step's work and its changes before the next step starts, so each review is short and a mistake is caught where
// it is made.
import { addUsage } from "../core/types.ts";
import { planQuestion, planRevision, reviewPassed, stepQuestion } from "./advisor.ts";
import type { Agent, TurnResult } from "./loop.ts";

/** More steps than this are folded into the last one: a plan that long is not a list of checkable units. */
export const MAX_PLAN_STEPS = 9;

export const planRequest = (task: string) =>
  `${task}\n\n` +
  "Do not change anything yet. Look at the project as far as you need to, then reply with a numbered list of the steps you will take. " +
  "Use the fewest steps that can each be done and checked on its own: a small task is one step, and a large one rarely needs more than seven. " +
  "One line for each step, saying what gets done and how you will check it. Write nothing after the list.";

export const stepRequest = (n: number, of: number, step: string) =>
  `Step ${n} of ${of}: ${step}\n\nDo this step only. Check it, then stop and say in a sentence or two what you did.`;

export const WHOLE_TASK = "Go ahead: do the task, check it, and say in a sentence or two what you did.";

/** The numbered lines of a plan, in order. Text around the list is ignored; if the reply holds several lists, the last one counts. */
export function parsePlan(text: string): string[] {
  let steps: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:step\s+)?(\d{1,2})[.):](?:\*\*)?\s+(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    const item = m[2]!.replace(/\*\*/g, "").trim();
    if (n === 1) steps = [item];
    else if (n === steps.length + 1) steps.push(item);
  }
  if (steps.length > MAX_PLAN_STEPS) steps = [...steps.slice(0, MAX_PLAN_STEPS - 1), steps.slice(MAX_PLAN_STEPS - 1).join("; ")];
  return steps;
}

export interface StepsResult extends TurnResult {
  /** The plan that was followed; empty when the model gave none and the task ran as one unit. */
  steps: string[];
  /** How many of the steps finished. */
  done: number;
}

/** Plan the task, then do it one step at a time. Usage and cost are those of the whole run. */
export async function runSteps(agent: Agent, task: string, signal?: AbortSignal): Promise<StepsResult> {
  const mode = agent.mode;
  const planStart = agent.session.messages.length;
  let last: TurnResult;
  const planning = async (text: string) => {
    agent.mode = "plan";
    try {
      return await agent.send(text, signal);
    } finally {
      agent.mode = mode;
    }
  };
  last = await planning(planRequest(task));
  let usage = last.usage;
  let costUsd = last.costUsd;
  // The check command runs after the last step only: halfway through a plan, failing tests are expected.
  const run = async (text: string, review?: { question: string; scope: "turn" }, check = true) => {
    last = await agent.send(text, signal, { review, check });
    usage = addUsage(usage, last.usage);
    costUsd += last.costUsd;
    return last.stopReason === "end_turn";
  };
  const result = (steps: string[], done: number): StepsResult => ({ ...last, usage, costUsd, steps, done });

  if (last.stopReason !== "end_turn" || signal?.aborted) return result([], 0);
  let steps = parsePlan(last.text);
  // The plan is the worker's, and a poor plan costs more than none. A reviewing advisor checks it once before any of
  // it is carried out; the worker decides what to take from that (research/multi-model-methods.md, section 3).
  if (steps.length >= 2) {
    const verdict = await agent.review(planQuestion(steps), "to review the plan", planStart, signal);
    if (verdict) {
      usage = addUsage(usage, verdict.usage);
      costUsd += verdict.costUsd;
    }
    if (verdict?.text && !reviewPassed(verdict.text) && !signal?.aborted) {
      const planned = last;
      last = await planning(planRevision(agent.advisor!, verdict.text));
      usage = addUsage(usage, last.usage);
      costUsd += last.costUsd;
      if (last.stopReason !== "end_turn") return result(steps, 0);
      const revised = parsePlan(last.text);
      if (revised.length) steps = revised;
      else last = planned;
    }
  }
  // Nothing to split: the task is one unit, and is reviewed as a whole.
  if (steps.length < 2) return result(steps, (await run(WHOLE_TASK)) ? steps.length : 0);

  agent.note(`Working in ${steps.length} steps.`);
  let done = 0;
  for (; done < steps.length; done++) {
    if (signal?.aborted) break;
    // A step that ends in an error, a refusal or its step limit leaves the work in a state the next step cannot build on.
    if (!(await run(stepRequest(done + 1, steps.length, steps[done]!), { question: stepQuestion(done + 1, steps), scope: "turn" }, done === steps.length - 1))) break;
  }
  if (done < steps.length && !signal?.aborted) agent.note(`Stopped in step ${done + 1} of ${steps.length}: it did not finish.`, "warn");
  return result(steps, done);
}
