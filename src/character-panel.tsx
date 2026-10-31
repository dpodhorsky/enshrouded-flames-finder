import type { ComponentChildren } from "preact";

import { equipmentPositions, type ItemRecord } from "./character.ts";
import { character, characterError, itemNames, loadItemNames } from "./state.ts";

const numberFormat = new Intl.NumberFormat("en");

// Equipped positions, grouped as the game's character screen shows them.
const equipmentGroups: { label: string; positions: number[] }[] = [
  { label: "Armour", positions: [5, 6, 7, 8, 9] },
  { label: "Rings and shield", positions: [10, 11, 12] },
  { label: "Tools", positions: [13, 14, 15] },
  { label: "Appearance", positions: [0, 1, 2, 3, 4] },
];

// Inventory slots: 0–15 backpack rows 1–2, 16–23 action bar row 1, 24–31 action bar row 2, 32–39 backpack row 3.
const inventoryGroups: { label: string; matches: (slot: number) => boolean }[] = [
  { label: "Action bar", matches: (slot) => slot >= 16 && slot <= 31 },
  { label: "Backpack", matches: (slot) => slot < 16 || slot >= 32 },
];

function itemName(itemId: number) {
  const names = itemNames.value;
  if (!names) {
    return "…";
  }
  return names[itemId] ?? `Unknown item ${itemId.toString(16).padStart(8, "0")}`;
}

function ItemRow({ label, item }: { label?: string; item: ItemRecord | undefined }) {
  return (
    <li class="item-row">
      {label && <span class="mono-caption item-label">{label}</span>}
      {item && item.count > 0 ? (
        <>
          <span class="min-w-0 flex-1 truncate text-primary" title={itemName(item.itemId)}>
            {itemName(item.itemId)}
          </span>
          {item.level ? <span class="mono-caption shrink-0 tabular-nums">Lv {item.level}</span> : null}
          {item.count > 1 && <span class="mono-caption shrink-0 tabular-nums">×{numberFormat.format(item.count)}</span>}
        </>
      ) : (
        <span class="flex-1 text-muted">Empty</span>
      )}
    </li>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="grid gap-1.5">
      <h3 class="mono-caption">{title}</h3>
      {children}
    </section>
  );
}

function CharacterDetails() {
  const current = character.value!;
  const skillPoints = current.skills.reduce((sum, skill) => sum + skill.rank, 0);
  const items = (records: readonly ItemRecord[]) => records.filter((item) => item.count > 0);

  return (
    <div class="grid gap-4">
      <div>
        <h2 class="title text-primary">{current.name}</h2>
        <p class="mono-caption mt-1 tabular-nums">
          Level {current.level} · {numberFormat.format(current.experience)} XP
        </p>
      </div>

      <Section title="Skills">
        <p>
          {current.skills.length} skills unlocked, {skillPoints} skill points spent.{" "}
          <span class="text-muted">Skill names need the game data, which the page does not have yet.</span>
        </p>
      </Section>

      {equipmentGroups.map(({ label, positions }) => (
        <Section key={label} title={label}>
          <ul class="grid gap-0.5">
            {positions.map((position) => (
              <ItemRow key={position} label={equipmentPositions[position]!.replace("Appearance: ", "")} item={current.equipped.get(position)} />
            ))}
          </ul>
        </Section>
      ))}

      {inventoryGroups.map(({ label, matches }) => {
        const rows = items(current.inventory.filter((item) => matches(item.slot)));
        return (
          <Section key={label} title={`${label} · ${rows.length}`}>
            {rows.length ? (
              <ul class="grid gap-0.5">
                {rows.map((item) => (
                  <ItemRow key={item.slot} item={item} />
                ))}
              </ul>
            ) : (
              <p class="text-muted">Empty</p>
            )}
          </Section>
        );
      })}

      {items(current.extra).length > 0 && (
        <Section title={`Backpack extension · ${items(current.extra).length}`}>
          <ul class="grid gap-0.5">
            {items(current.extra).map((item) => (
              <ItemRow key={item.slot} item={item} />
            ))}
          </ul>
        </Section>
      )}

      <p class="mono-caption">Items carried by the character. Chests in your base are in the world save, which the page does not read.</p>
    </div>
  );
}

export function CharacterButton() {
  const current = character.value;
  if (!current && !characterError.value) {
    return null;
  }

  return (
    <>
      <button class="btn btn-glass btn-sm" popovertarget="character-panel" onClick={() => void loadItemNames()}>
        {current ? `${current.name} · Lv ${current.level}` : "Character"}
      </button>
      <div id="character-panel" popover class="character-panel floating menu-in">
        {current ? <CharacterDetails /> : <p class="text-danger">This character could not be read: {characterError.value}</p>}
      </div>
    </>
  );
}
