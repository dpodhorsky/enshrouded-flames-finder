import { computed } from "@preact/signals";

import type { Quest } from "./game/quests.ts";
import { giverName, mergeKnowledge, questGivers, questProgress, quests, type QuestProgress, type QuestState, type StepState } from "./quest-progress.ts";
import { ruleTree, type RuleNode } from "./quest-rules.ts";
import {
  character,
  forgetCharacter,
  hasSave,
  knowledge,
  knowledgeIsCurrent,
  listMode,
  savedCharacters,
  searchQuery,
  worldKnowledge,
  worldName,
  type SavedCharacter,
} from "./state.ts";

// The app loads this module when the Quests layer opens, so the quest data is not part of the first page load.

// The characters the tab compares: every character loaded, or the active one for a save stored before characters were listed.
const characters = computed((): readonly SavedCharacter[] => {
  if (savedCharacters.value.length) {
    return savedCharacters.value;
  }
  const known = knowledge.value;
  return known && knowledgeIsCurrent.value
    ? [{ key: "active", file: "", name: character.value?.name ?? "Character", level: character.value?.level ?? null, knowledge: known }]
    : [];
});

// Quest progress per character, with the world's quests when a world save is loaded.
const progressByCharacter = computed(
  (): ReadonlyMap<string, ReadonlyMap<number, QuestProgress>> =>
    new Map(
      characters.value.map((each) => {
        const merged = mergeKnowledge(each.knowledge, worldKnowledge.value);
        return [each.key, new Map(quests.map((quest) => [quest.id, questProgress(quest, merged, worldKnowledge.value)]))];
      }),
    ),
);

const questStateWords: Record<QuestState, string> = { done: "Done", active: "In progress", open: "Not started" };
const questDots: Record<QuestState, string> = { done: "dot-found", active: "dot-active", open: "dot-missing" };
const stepMarks: Record<StepState, string> = { done: "✓", active: "•", locked: "·" };
const stepWords: Record<StepState, string> = { done: "done", active: "current", locked: "not reached" };

const label = (each: SavedCharacter) => `${each.name}${each.level ? ` · Lv ${each.level}` : ""}`;
// Two characters can share a name (two "Lando"s), so the short label adds the level.
const shortLabel = (each: SavedCharacter) => `${each.name.slice(0, 1).toUpperCase()}${each.level ?? ""}`;

export function questStatus() {
  const list = characters.value;
  if (!list.length) {
    return `${quests.length} quests`;
  }
  const done = (each: SavedCharacter) => [...progressByCharacter.value.get(each.key)!.values()].filter((progress) => progress.state === "done").length;
  return list.length === 1 ? `${done(list[0]!)} / ${quests.length} done` : `${quests.length} quests · ${list.length} characters`;
}

function Notes() {
  if (!hasSave.value) {
    return (
      <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">
        Load one or more character saves to see which quests each character has done. Each step says what makes it appear and what completes it.
      </p>
    );
  }
  if (!knowledgeIsCurrent.value) {
    return <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">Load the character save again to check quests.</p>;
  }
  return (
    <p class="px-3 pt-2 text-[13px] leading-4.5 text-muted">
      {worldKnowledge.value ? (
        <>
          World quests from <code>{worldName.value || "the world save"}</code>, for every character.
        </>
      ) : (
        <>
          World quests are kept in the world save. Load <code>worldN.ksd</code> too to count them.
        </>
      )}
    </p>
  );
}

function CharacterBar() {
  const list = characters.value;
  if (!list.length) {
    return null;
  }
  return (
    <div class="flex flex-wrap items-center gap-1.5 px-3 pt-2.5" role="list" aria-label="Characters">
      {list.map((each) => {
        const done = [...progressByCharacter.value.get(each.key)!.values()].filter((progress) => progress.state === "done").length;
        return (
          <span key={each.key} role="listitem" class="chip chip-sm gap-1.5" title={each.file || undefined}>
            <span class="mono-caption">{shortLabel(each)}</span>
            {label(each)}
            <span class="tabular-nums opacity-60">
              {done}/{quests.length}
            </span>
            {each.key !== "active" && (
              <button class="character-remove" aria-label={`Remove ${label(each)}`} onClick={() => forgetCharacter(each.key)}>
                ×
              </button>
            )}
          </span>
        );
      })}
      <span class="mono-caption">Add more: load or drop other characterN.ksd files.</span>
    </div>
  );
}

function RuleView({ node }: { node: RuleNode }) {
  if ("text" in node) {
    return <span>{node.text}</span>;
  }
  if ("not" in node) {
    return (
      <span class="rule-guard">
        unless <RuleView node={node.not} />
      </span>
    );
  }
  const parts = "all" in node ? node.all : node.any;
  const list = (
    <ul class="rule-list">
      {parts.map((part, index) => (
        <li key={index}>
          <RuleView node={part} />
        </li>
      ))}
    </ul>
  );
  if ("all" in node) {
    return list;
  }
  if (parts.length <= 3) {
    return (
      <>
        <span class="rule-label">one of:</span>
        {list}
      </>
    );
  }
  const preview = parts
    .slice(0, 2)
    .map((part) => ("text" in part ? part.text : "…"))
    .join("; ");
  return (
    <details class="rule-more">
      <summary>
        one of {parts.length}: {preview}; …
      </summary>
      {list}
    </details>
  );
}

function StepRules({ quest, index }: { quest: Quest; index: number }) {
  const step = quest.steps[index]!;
  const shown = ruleTree(step.shown);
  const done = ruleTree(step.done);
  return (
    <div class="step-rules">
      <div>
        <span class="rule-label">Appears when</span> {shown ? <RuleView node={shown} /> : <span>the quest starts</span>}
      </div>
      <div>
        <span class="rule-label">Done when</span> {done ? <RuleView node={done} /> : <span>the game moves on (no rule in the files)</span>}
      </div>
    </div>
  );
}

function StatusDots({ quest }: { quest: Quest }) {
  return (
    <>
      {characters.value.map((each) => {
        const state = progressByCharacter.value.get(each.key)!.get(quest.id)!.state;
        return (
          <span
            key={each.key}
            class={`dot ${questDots[state]}`}
            title={`${label(each)}: ${questStateWords[state]}`}
            aria-label={`${label(each)}: ${questStateWords[state]}`}
          />
        );
      })}
    </>
  );
}

function QuestRow({ quest }: { quest: Quest }) {
  const list = characters.value;
  const single = list.length === 1 ? progressByCharacter.value.get(list[0]!.key)!.get(quest.id)! : null;
  return (
    <li>
      <details class="quest">
        <summary class="menu-item">
          <span class="min-w-0 flex-1 truncate font-medium" title={quest.name}>
            {quest.name}
          </span>
          {single && quest.steps.length > 1 && (
            <span class="mono-caption shrink-0 tabular-nums">
              {single.steps.filter((step) => step === "done").length}/{quest.steps.length}
            </span>
          )}
          <span class="flex shrink-0 gap-1">
            <StatusDots quest={quest} />
          </span>
        </summary>
        <ol class="quest-steps">
          {quest.steps.map((step, index) => (
            <li key={index}>
              <div class="flex gap-2">
                <span class="min-w-0 flex-1 font-medium text-(--text-secondary)">
                  {index + 1}. {step.name}
                </span>
                {list.map((each) => {
                  const state: StepState = progressByCharacter.value.get(each.key)!.get(quest.id)!.steps[index]!;
                  return (
                    <span
                      key={each.key}
                      class={`step-mark step-${state}`}
                      title={`${label(each)}: ${stepWords[state]}`}
                      aria-label={`${label(each)}: ${stepWords[state]}`}
                    >
                      {list.length > 1 ? `${shortLabel(each)} ` : ""}
                      {stepMarks[state]}
                    </span>
                  );
                })}
              </div>
              <StepRules quest={quest} index={index} />
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

export function QuestList() {
  const query = searchQuery.value.trim().toLowerCase();
  const list = characters.value;
  // "Missing" hides quests every loaded character has done.
  const shown = quests.filter((quest) => {
    if (listMode.value === "missing" && list.length && list.every((each) => progressByCharacter.value.get(each.key)!.get(quest.id)!.state === "done")) {
      return false;
    }
    return !query || [quest.name, giverName(quest.giver), ...quest.steps.map((step) => step.name)].some((text) => text.toLowerCase().includes(query));
  });

  return (
    <>
      <CharacterBar />
      <Notes />
      {shown.length === 0 ? (
        <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">
          {listMode.value === "missing" && list.length ? "Nothing missing here. Every quest is done." : "No quest matches the search."}
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
                  {rows.map((quest) => (
                    <QuestRow key={quest.id} quest={quest} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
