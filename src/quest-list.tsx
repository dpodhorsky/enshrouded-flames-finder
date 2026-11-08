import { computed } from "@preact/signals";

import { giverName, mergeKnowledge, questGivers, questProgress, quests, type QuestProgress, type QuestState, type StepState } from "./quest-progress.ts";
import { hasSave, knowledge, knowledgeIsCurrent, listMode, searchQuery, worldKnowledge, worldName } from "./state.ts";

// The app loads this module when the Quests layer opens, so the quest data is not part of the first page load.

// Quest progress, from the character and the world when one is loaded. null until a current character save loads.
const questProgresses = computed((): ReadonlyMap<number, QuestProgress> | null => {
  const known = knowledge.value;
  if (!known || !knowledgeIsCurrent.value) {
    return null;
  }
  const merged = mergeKnowledge(known, worldKnowledge.value);
  return new Map(quests.map((quest) => [quest.id, questProgress(quest, merged, worldKnowledge.value)]));
});

const questStateWords: Record<QuestState, string> = { done: "Done", active: "In progress", open: "Not started" };
const questDots: Record<QuestState, string> = { done: "dot-found", active: "dot-active", open: "dot-missing" };
const stepMarks: Record<StepState, string> = { done: "✓", active: "•", locked: "·" };
const stepWords: Record<StepState, string> = { done: "done", active: "current", locked: "not reached" };

export function questStatus() {
  const progresses = questProgresses.value;
  return progresses ? `${[...progresses.values()].filter((progress) => progress.state === "done").length} / ${quests.length} done` : `${quests.length} quests`;
}

function WorldNote() {
  if (!hasSave.value) {
    return <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">Load a character save to see which quests are done.</p>;
  }

  if (!knowledgeIsCurrent.value) {
    return <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">Load the character save again to check quests.</p>;
  }

  return (
    <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">
      {worldKnowledge.value ? (
        <>
          World quests from <code>{worldName.value || "the world save"}</code>.
        </>
      ) : (
        <>
          World quests are kept in the world save. Load <code>worldN.ksd</code> together with the character to count them.
        </>
      )}
    </p>
  );
}

export function QuestList() {
  const progresses = questProgresses.value;
  const query = searchQuery.value.trim().toLowerCase();
  const shown = quests.filter((quest) => {
    const progress = progresses?.get(quest.id);
    if (listMode.value === "missing" && progress?.state === "done") {
      return false;
    }
    return !query || [quest.name, giverName(quest.giver), ...quest.steps.map((step) => step.name)].some((text) => text.toLowerCase().includes(query));
  });

  return (
    <>
      <WorldNote />
      {shown.length === 0 ? (
        <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">
          {listMode.value === "missing" && progresses ? "Nothing missing here. Every quest is done." : "No quest matches the search."}
        </p>
      ) : (
        <div class="p-1.5">
          {questGivers.map((giver) => {
            const rows = shown.filter((quest) => quest.giver === giver);
            if (!rows.length) {
              return null;
            }
            return (
              <section key={giver || "other"} aria-label={giverName(giver)}>
                <h2 class="menu-label mono-caption">
                  <span>{giverName(giver)}</span>
                  <span>{rows.length}</span>
                </h2>
                <ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                  {rows.map((quest) => {
                    const progress = progresses?.get(quest.id);
                    const doneSteps = progress?.steps.filter((step) => step === "done").length ?? 0;
                    return (
                      <li key={quest.id}>
                        <details class="quest">
                          <summary class="menu-item">
                            <span class="min-w-0 flex-1 truncate font-medium" title={quest.name}>
                              {quest.name}
                            </span>
                            {progress && quest.steps.length > 1 && (
                              <span class="mono-caption shrink-0 tabular-nums">
                                {doneSteps}/{quest.steps.length}
                              </span>
                            )}
                            {progress && <span class={`dot ${questDots[progress.state]}`} aria-label={questStateWords[progress.state]} />}
                          </summary>
                          <ol class="quest-steps">
                            {quest.steps.map((step, index) => {
                              const state = progress?.steps[index];
                              return (
                                <li key={index} class={state ? `step-${state}` : ""}>
                                  {state && (
                                    <span class="step-mark" aria-label={stepWords[state]}>
                                      {stepMarks[state]}
                                    </span>
                                  )}
                                  <span>{step.name}</span>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
