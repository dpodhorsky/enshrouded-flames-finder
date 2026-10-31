// Reads the character_data and player_character blocks of a character save.
// The layout follows the research notes of https://github.com/MrAmadis/enshrouded-save-editor (docs/research/player-character.md).
// This is an independent, read-only implementation.

export type ItemRecord = {
  readonly slot: number;
  readonly itemId: number;
  readonly count: number;
  readonly level: number | null;
  readonly durability: readonly [number, number] | null;
  readonly rarity: number | null;
};

export type Skill = { readonly id: number; readonly rank: number };

export type Character = {
  readonly name: string;
  readonly level: number;
  readonly experience: number;
  readonly skills: readonly Skill[];
  // Equipped gear by position: 0–4 appearance (helmet, chest, arms, legs, boots), 5 helmet, 6 chest, 7 arms, 8 legs, 9 boots,
  // 10–11 rings, 12 shield, 13 grappling hook, 14 glider, 15 backpack.
  readonly equipped: ReadonlyMap<number, ItemRecord>;
  // Inventory slots 0–15 are backpack rows 1–2, 16–23 action bar row 1, 24–31 action bar row 2, 32–39 backpack row 3.
  readonly inventory: readonly ItemRecord[];
  // The backpack extension rows.
  readonly extra: readonly ItemRecord[];
};

export const equipmentPositions = [
  "Appearance: helmet",
  "Appearance: chest",
  "Appearance: arms",
  "Appearance: legs",
  "Appearance: boots",
  "Helmet",
  "Chest",
  "Arms",
  "Legs",
  "Boots",
  "Ring",
  "Ring",
  "Shield",
  "Grappling hook",
  "Glider",
  "Backpack",
] as const;

class Reader {
  offset: number;
  readonly view: DataView;

  constructor(
    readonly bytes: Uint8Array,
    offset = 0,
  ) {
    this.offset = offset;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(length: number) {
    if (this.offset + length > this.bytes.length) {
      throw new Error("The character data ends early.");
    }
  }

  u8() {
    this.need(1);
    return this.bytes[this.offset++]!;
  }

  u16() {
    this.need(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    this.need(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  skip(length: number) {
    this.need(length);
    this.offset += length;
  }
}

// character_data: a byte, a 4-byte storage tag, then the name as a u32 length and that many bytes of UTF-8.
export function readCharacterName(payload: Uint8Array): string {
  const reader = new Reader(payload, 5);
  const length = reader.u32();
  if (length === 0 || length > 64) {
    throw new Error("The character name has an unexpected length.");
  }
  reader.need(length);
  return new TextDecoder().decode(payload.subarray(reader.offset, reader.offset + length));
}

// Optional item fields, in flag bit order: bit 0 item level (1 byte), bit 1 durability and max durability (2 × u32),
// bit 2 unknown (8 bytes), bit 3 appearance (4 bytes), bit 4 rarity and an extra byte, bit 5 gem socket (u32 gem, u8 marker).
const itemFieldSizes = [1, 8, 8, 4, 2, 5];

function readItem(reader: Reader): ItemRecord {
  const slot = reader.u8();
  const itemId = reader.u32();
  const count = reader.u16();
  const flags = reader.u8();
  if (flags >> itemFieldSizes.length) {
    throw new Error("An item has fields of unknown size.");
  }

  let level: number | null = null;
  let durability: [number, number] | null = null;
  let rarity: number | null = null;

  for (let bit = 0; bit < itemFieldSizes.length; bit++) {
    if (!(flags & (1 << bit))) {
      continue;
    }
    if (bit === 0) {
      level = reader.u8();
    } else if (bit === 1) {
      durability = [reader.u32(), reader.u32()];
    } else if (bit === 4) {
      rarity = reader.u8();
      reader.skip(1);
    } else {
      reader.skip(itemFieldSizes[bit]!);
    }
  }

  return { slot, itemId, count, level, durability, rarity };
}

// Status entry: u32 effect, two u64, a u16 field mask, then one field per mask bit. Only bits 1–4 have known sizes.
const statusFieldSizes: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 8 };

function skipStatus(reader: Reader) {
  reader.skip(4 + 8 + 8);
  const mask = reader.u16();
  for (let bit = 0; bit < 16; bit++) {
    if (mask & (1 << bit)) {
      const size = statusFieldSizes[bit];
      if (size === undefined) {
        throw new Error("A status effect has fields of unknown size.");
      }
      reader.skip(size);
    }
  }
}

const popcount = (value: number) => {
  let count = 0;
  for (let rest = value; rest; rest &= rest - 1) {
    count++;
  }
  return count;
};

const levelOffset = 58;
const maxSkills = 400;

// player_character: a 58-byte prefix, u32 level, u32 experience, u32 skill count, skills (u32 id, u8 rank), the status list,
// the Equipped mask and records, one u16 per set mask bit 16–18, the inventory header [05, n2, x, n3], n2 inventory records and
// n3 extension records.
export function readPlayerCharacter(payload: Uint8Array): Omit<Character, "name"> {
  const reader = new Reader(payload, levelOffset);
  const level = reader.u32();
  const experience = reader.u32();
  const skillCount = reader.u32();
  if (level < 1 || level > 100 || skillCount > maxSkills) {
    throw new Error("This character's data has a layout this page does not know.");
  }

  const skills = Array.from({ length: skillCount }, () => ({ id: reader.u32(), rank: reader.u8() }));

  const statusCount = reader.u32();
  if (statusCount > 32) {
    throw new Error("This character's data has a layout this page does not know.");
  }
  for (let index = 0; index < statusCount; index++) {
    skipStatus(reader);
  }

  const equippedMask = reader.u32();
  if (equippedMask >>> 19) {
    throw new Error("This character's equipment has a layout this page does not know.");
  }

  const equipped = new Map<number, ItemRecord>();
  const positions = Array.from({ length: 16 }, (_, bit) => bit).filter((bit) => equippedMask & (1 << bit));
  for (const position of positions) {
    equipped.set(position, readItem(reader));
  }
  reader.skip(2 * popcount((equippedMask >>> 16) & 0b111));

  // A character that has never been in a world has an Equipped list and no inventory.
  if (reader.offset >= payload.length || payload[reader.offset] !== 0x05) {
    return { level, experience, skills, equipped, inventory: [], extra: [] };
  }

  reader.skip(1);
  const inventoryCount = reader.u8();
  reader.skip(1);
  const extraCount = reader.u8();
  const inventory = Array.from({ length: inventoryCount }, () => readItem(reader));
  const extra = Array.from({ length: extraCount }, () => readItem(reader));

  return { level, experience, skills, equipped, inventory, extra };
}
