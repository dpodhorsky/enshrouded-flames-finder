// Quest step rules in words: "Talk to Balthazar", "Read "I Buried It Deep"", "Open the gold chest near Farmer Treasure Hint".
// A rule is a tree of knowledge tests (src/game/requirement.ts); src/game/knowledge-sources.ts says what sets each id.
import { knowledgeSources, type KnowledgeSource } from "./game/knowledge-sources.ts";
import { gameLorePages } from "./game/lore.ts";
import type { Requirement } from "./game/requirement.ts";

const loreTitles = new Map<number, string>();
for (const page of gameLorePages) {
  loreTitles.set(page.knowledgeId, loreTitles.has(page.knowledgeId) ? `${loreTitles.get(page.knowledgeId)}" or "${page.title}` : page.title);
}

const article = (what: string) => (/^(a|an|the)\s/i.test(what) || /^[A-Z0-9"]/.test(what) ? what : `the ${what}`);

export function sourceText(source: KnowledgeSource, depth = 0): string {
  const near = source.near ? ` near ${source.near}` : "";
  switch (source.kind) {
    case "talk":
      return `Talk to ${source.what}${source.line ? ` ("${source.line}")` : ""}${near}`;
    case "kill":
      return `Defeat ${article(source.what)}${near}`;
    case "read":
      return `Read "${source.what}"`;
    case "open":
      return `Open the ${source.what}${near}`;
    case "pickup":
      return `Pick up ${article(source.what)}${near}`;
    case "soul":
      return `Free ${source.what}${near}`;
    case "reach":
      return `Reach ${source.what}${near && !source.what.includes(source.near!) ? near : ""}`;
    case "use":
      return `Use ${article(source.what)}${near}`;
    case "collection":
      return `Complete the ${source.what}${near}`;
    case "item":
      return `Find ${source.what}`;
    case "craft":
      return `Craft ${source.what}`;
    case "place":
      return `Place ${source.what}`;
    case "when":
      return source.rule && depth < 2 ? `Happens by itself once: ${describeRule(source.rule, depth + 1)}` : "Happens by itself";
    default:
      return `${source.what}${near}`;
  }
}

// "NPC_barber_sheltered_state" -> "the barber is sheltered"
const npcState = (detail: string) => {
  const words = detail
    .replace(/^NPC_/i, "")
    .replace(/_state$/i, "")
    .split("_")
    .map((word) => word.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  return words.length > 1 ? `the ${words.slice(0, -1).join(" ")} is ${words.at(-1)}` : `the ${words.join(" ")}'s state`;
};

function otherText(rule: { other: string; detail?: string }): string {
  switch (rule.other) {
    case "Npc":
      return rule.detail ? `${npcState(rule.detail)} (an NPC's state, not in the save)` : "an NPC's state (not in the save)";
    case "FlameAltarCount":
      return "a Flame Altar is built";
    case "FlameAltarLevel":
      return "a Flame Altar is upgraded";
    case "MotherFlameLevel":
      return "the Flame is strong enough";
    case "PlayerLevel":
      return "a player level";
    case "Inventory":
    case "InventoryCount":
      return "carrying a certain item";
    default:
      return "a check the save does not hold";
  }
}

export function leafText(id: number, depth = 0): string {
  const title = loreTitles.get(id);
  if (title) {
    return `Read "${title}"`;
  }
  const sources = knowledgeSources[id];
  if (!sources?.length) {
    return "an event the game files do not name";
  }
  const first = sourceText(sources[0]!, depth);
  return sources.length > 1 ? `${first} (or ${sources.length - 1} other way${sources.length > 2 ? "s" : ""})` : first;
}

// The rule as a sentence. `depth` counts nested "happens by itself" rules, which are followed two levels deep.
export function describeRule(rule: Requirement | null, depth = 0): string {
  if (!rule) {
    return "always";
  }
  if ("other" in rule) {
    return otherText(rule);
  }
  if ("not" in rule) {
    return `not after: ${describeRule(rule.not, depth)}`;
  }
  if ("all" in rule) {
    return rule.all.map((part) => describeRule(part, depth)).join("; and ");
  }
  if ("any" in rule) {
    const parts = [...new Set(rule.any.map((part) => describeRule(part, depth)))];
    return parts.length === 1
      ? parts[0]!
      : parts.length <= 3
        ? `one of: ${parts.join("; or ")}`
        : `one of ${parts.length}: ${parts.slice(0, 3).join("; or ")}; …`;
  }
  return leafText(rule.k, depth);
}

// The rule as a tree the Quests tab shows as nested lists. Nested "all" and "any" of the same kind are merged, and repeated
// lines inside an "any" are shown once.
export type RuleNode = { readonly text: string } | { readonly all: readonly RuleNode[] } | { readonly any: readonly RuleNode[] } | { readonly not: RuleNode };

export function ruleTree(rule: Requirement | null): RuleNode | null {
  if (!rule) {
    return null;
  }
  if ("other" in rule) {
    return { text: otherText(rule) };
  }
  if ("not" in rule) {
    const inner = ruleTree(rule.not);
    return inner && { not: inner };
  }
  if ("all" in rule || "any" in rule) {
    const kind = "all" in rule ? "all" : "any";
    const parts = ("all" in rule ? rule.all : rule.any).map(ruleTree).filter((part): part is RuleNode => part !== null);
    const flat = parts.flatMap((part) => (kind in part ? (part as { all?: RuleNode[]; any?: RuleNode[] })[kind]! : [part]));
    const unique = flat.filter((part, index) => !("text" in part) || flat.findIndex((other) => "text" in other && other.text === part.text) === index);
    return unique.length === 1 ? unique[0]! : kind === "all" ? { all: unique } : { any: unique };
  }
  return { text: leafText(rule.k) };
}
