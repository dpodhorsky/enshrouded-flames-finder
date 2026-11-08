import { decompress } from "fzstd";

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

// An SV2C container holds the directory offset at 0x28 (plus 40) and the block count at 0x2c.
// Each directory entry is 20 bytes: name offset (relative to the entry), name length, block offset, block size, hash.
// Each block starts with "S2BH". Byte 9 is the zstd flag and the payload starts at byte 14.
function readBlocks(save: Uint8Array) {
  const view = new DataView(save.buffer, save.byteOffset, save.byteLength);

  if (save.length < 0x30 || ascii(save, 0, 4) !== "SV2C") {
    throw new Error("This file is not an Enshrouded save. Select a characterN.ksd file.");
  }

  const directoryOffset = view.getUint32(0x28, true) + 40;
  const blockCount = view.getUint32(0x2c, true);
  const blocks = new Map<string, Uint8Array>();

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const entryOffset = directoryOffset + 20 * blockIndex;
    const name = ascii(save, entryOffset + view.getUint32(entryOffset, true), view.getUint32(entryOffset + 4, true));
    const blockOffset = view.getUint32(entryOffset + 8, true);
    blocks.set(name, save.subarray(blockOffset, blockOffset + view.getUint32(entryOffset + 12, true)));
  }

  return blocks;
}

function payloadOf(block: Uint8Array, name: string) {
  if (ascii(block, 0, 4) !== "S2BH") {
    throw new Error(`The save is damaged: its ${name} block has no S2BH header.`);
  }

  return block[9] === 1 ? decompress(block.subarray(14)) : block.subarray(14);
}

// The decompressed payload of a named block, or null when the save has no such block.
export function readBlock(save: Uint8Array, name: string): Uint8Array | null {
  const block = readBlocks(save).get(name);
  return block ? payloadOf(block, name) : null;
}

// A knowledge payload (player_knowledge of a character, world_knowledge of a world) is: u32 state, u32 count, count ids,
// count values. A value is 1 for a Bool, a set of bits for flags, or a count.
// An empty block holds no knowledge yet.
function knowledgeOf(block: Uint8Array): Map<number, number> {
  if (block.length === 0) {
    return new Map();
  }

  const payload = payloadOf(block, "knowledge");
  const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const idCount = payloadView.getUint32(4, true);
  if (payload.length !== 8 + 8 * idCount) {
    throw new Error("The save is damaged: its knowledge block has an unexpected size.");
  }

  return new Map(
    Array.from({ length: idCount }, (_, idIndex) => [payloadView.getUint32(8 + 4 * idIndex, true), payloadView.getUint32(8 + 4 * (idCount + idIndex), true)]),
  );
}

// The character's knowledge: id to value.
export function readKnowledge(save: Uint8Array): Map<number, number> {
  const block = readBlocks(save).get("player_knowledge");
  if (!block) {
    throw new Error("This file holds no character knowledge. It can be a world save. Select characterN.ksd.");
  }

  return knowledgeOf(block);
}

// A save is a character save (player_knowledge), a world save (world_knowledge), or neither.
export function saveKind(save: Uint8Array): "character" | "world" | null {
  const blocks = readBlocks(save);
  return blocks.has("player_knowledge") ? "character" : blocks.has("world_knowledge") ? "world" : null;
}

// The world's knowledge: the quests and events of the world, whoever was there.
export function readWorldKnowledge(save: Uint8Array): Map<number, number> {
  const block = readBlocks(save).get("world_knowledge");
  if (!block) {
    throw new Error("This file holds no world knowledge. Select worldN.ksd.");
  }

  return knowledgeOf(block);
}

export const fogSize = 1280;

// The fogofwar payload is a 13-byte header with "FGOW" at byte 8, then a 1280 by 1280 grid, one byte per cell, row by row.
// Row 0 is the north edge of the 10240 m map, so a cell is 8 m. 0 is fogged and 255 is explored.
// A character that has never been in a world has no fogofwar block. This returns null then, and for a layout it does not know.
export function readFog(save: Uint8Array): Uint8Array | null {
  const block = readBlocks(save).get("fogofwar");
  if (!block) {
    return null;
  }

  const payload = payloadOf(block, "fog of war");
  if (payload.length !== 13 + fogSize * fogSize || ascii(payload, 8, 4) !== "FGOW") {
    return null;
  }

  return payload.subarray(13);
}
