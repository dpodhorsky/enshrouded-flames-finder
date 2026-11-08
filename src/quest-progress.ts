import { quests, type Quest } from "./game/quests.ts";
import type { Requirement } from "./game/requirement.ts";
import { holds, type Knowledge } from "./requirement.ts";

export type QuestState = "done" | "active" | "open";
// done; active: the journal shows the step and it is not done; locked: the journal does not show it yet.
export type StepState = "done" | "active" | "locked";

export type QuestProgress = { readonly state: QuestState; readonly steps: readonly StepState[] };

// Checks of the base's progress, which the save's knowledge does not hold: the number of Flame Altars, an altar's level and the
// Mother Flame's level. A rule whose other parts hold is taken as met, since those parts only come true once the base got there.
// An NPC's state stays unknown.
const assumeBaseProgress = (check: string) => (check === "FlameAltarCount" || check === "FlameAltarLevel" || check === "MotherFlameLevel" ? true : null);

// A step's own done rule often asks for an NPC's state, which the save's knowledge cannot answer. The journal shows the next step
// once a step is done, so a later step that shows counts as this step being done.
export function questProgress(quest: Quest, known: Knowledge, world: Knowledge | null): QuestProgress {
  const met = (rule: Requirement | null) => (rule ? holds(rule, known, world, assumeBaseProgress) : null);
  const shown = quest.steps.map((step) => met(step.shown));
  const done = quest.steps.map((step, index) => met(step.done) === true || shown.slice(index + 1).includes(true));

  const steps = quest.steps.map((_, index): StepState => {
    if (done[index]) {
      return "done";
    }
    const isShown = shown[index] ?? (index === 0 || done[index - 1]!);
    return isShown ? "active" : "locked";
  });

  const state: QuestState = steps.length > 0 && steps.at(-1) === "done" ? "done" : steps.some((step) => step !== "locked") ? "active" : "open";
  return { state, steps: state === "done" ? steps.map((): StepState => "done") : steps };
}

// The world save holds the quests of the world, the character save those of the character, and most ids are in both. A step
// counts as reached when either says so.
export const mergeKnowledge = (player: Knowledge, world: Knowledge | null): Knowledge => (world ? new Map([...world, ...player]) : player);

const giverNames: Record<string, string> = {
  Flame: "The Flame",
  Deepforest: "Deep Forest",
  "": "Other",
};

// The game names a quest's giver with an internal name: an NPC ("CryptKeeper") or an area ("ColdHeights").
export const giverName = (giver: string) => giverNames[giver] ?? giver.replace(/([a-z])([A-Z])/g, "$1 $2");

export const questGivers = [...new Set(quests.map((quest) => quest.giver))].toSorted(
  (first, second) => Number(first === "") - Number(second === "") || Number(second === "Flame") - Number(first === "Flame"),
);

export { quests };
