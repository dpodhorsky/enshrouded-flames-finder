import { describe, expect, test } from "vitest";

import { readCharacterName, readPlayerCharacter } from "./character.ts";

// Little-endian fields, joined with bytes().
const u8 = (value: number) => [value & 0xff];
const u16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number) => [...u16(value & 0xffff), ...u16(value >>> 16)];
const zeros = (length: number) => new Array<number>(length).fill(0);
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

// [slot][item id][count][flags] and the fields of the set flags.
const item = (slot: number, id: number, count: number, level?: number) => [
  ...u8(slot),
  ...u32(id),
  ...u16(count),
  ...u8(level === undefined ? 0 : 1),
  ...(level === undefined ? [] : u8(level)),
];

describe("readCharacterName", () => {
  test("Name", () => {
    expect(readCharacterName(bytes([0x02, 0x93, 0x7b, 0x40, 0xb6], u32(5), [...new TextEncoder().encode("Lando")]))).toBe("Lando");
  });
});

describe("readPlayerCharacter", () => {
  test("FullLayout", () => {
    const payload = bytes(
      zeros(58),
      u32(46),
      u32(8735),
      u32(2),
      u32(0x1111),
      u8(2),
      u32(0x2222),
      u8(1),
      // One status entry with mask bits 2 and 3: 4 + 1 bytes of fields.
      u32(1),
      u32(0x89cb0b34),
      zeros(16),
      u16(0b1100),
      [0, 0, 0x80, 0x3f, 7],
      // Equipped: helmet (bit 5) and backpack (bit 15), and bit 16 with its u16.
      u32((1 << 5) | (1 << 15) | (1 << 16)),
      item(0, 0xaaaa, 1, 40),
      item(1, 0xbbbb, 1),
      u16(6),
      // Inventory header [05, n2, x, n3], then the records.
      [0x05, 2, 0x02, 1],
      item(3, 0xcccc, 34),
      item(16, 0xdddd, 1, 30),
      item(21, 0xeeee, 23),
      zeros(22),
    );

    const character = readPlayerCharacter(payload);

    expect(character.level).toBe(46);
    expect(character.experience).toBe(8735);
    expect(character.skills).toEqual([
      { id: 0x1111, rank: 2 },
      { id: 0x2222, rank: 1 },
    ]);
    expect([...character.equipped.keys()]).toEqual([5, 15]);
    expect(character.equipped.get(5)).toMatchObject({ itemId: 0xaaaa, level: 40 });
    expect(character.inventory.map((record) => [record.slot, record.itemId, record.count])).toEqual([
      [3, 0xcccc, 34],
      [16, 0xdddd, 1],
    ]);
    expect(character.extra.map((record) => record.itemId)).toEqual([0xeeee]);
  });

  test("UnknownLayout", () => {
    expect(() => readPlayerCharacter(new Uint8Array(80))).toThrow(new Error("This character's data has a layout this page does not know."));
  });
});
