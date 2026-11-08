import type { Requirement } from "./game/requirement.ts";

// Knowledge as a save stores it: id to value. A Bool is 1, flags are bits, counters are counts.
export type Knowledge = ReadonlyMap<number, number>;

// true or false, or null when the requirement has a check the knowledge cannot answer
// (an NPC's state, the Mother Flame level, or a world id when no world save is loaded).
// `assume` can answer some of those checks by their name.
export function holds(
  required: Requirement,
  player: Knowledge,
  world: Knowledge | null,
  assume: (check: string) => boolean | null = () => null,
): boolean | null {
  if ("other" in required) {
    return assume(required.other);
  }

  if ("not" in required) {
    const inner = holds(required.not, player, world, assume);
    return inner === null ? null : !inner;
  }

  if ("all" in required) {
    const results = required.all.map((part) => holds(part, player, world, assume));
    return results.includes(false) ? false : results.includes(null) ? null : true;
  }

  if ("any" in required) {
    const results = required.any.map((part) => holds(part, player, world, assume));
    return results.includes(true) ? true : results.includes(null) ? null : false;
  }

  const source = required.world ? world : player;
  if (!source) {
    return null;
  }

  const value = source.get(required.k);
  if ("flag" in required) {
    return value !== undefined && (value & required.flag) === required.flag;
  }

  const [operator, count] = required.count;
  const current = value ?? 0;
  return operator === "Equals" ? current === count : operator === "GreaterThan" ? current > count : operator === "LessThan" ? current < count : null;
}
