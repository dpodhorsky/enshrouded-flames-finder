import { decompress } from "fzstd";

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

// An SV2C container holds the directory offset at 0x28 (plus 40) and the block count at 0x2c.
// Each directory entry is 20 bytes: name offset (relative to the entry), name length, block offset, block size, hash.
// Each block starts with "S2BH". Byte 9 is the zstd flag and the payload starts at byte 14.
// The player_knowledge payload is: u32 state, u32 count, count ids, count values.
export function readKnowledge(save: Uint8Array): Set<number> {
  const view = new DataView(save.buffer, save.byteOffset, save.byteLength);

  if (save.length < 0x30 || ascii(save, 0, 4) !== "SV2C") {
    throw new Error("This file is not an Enshrouded save. Select a characterN.ksd file.");
  }

  const directoryOffset = view.getUint32(0x28, true) + 40;
  const blockCount = view.getUint32(0x2c, true);

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const entryOffset = directoryOffset + 20 * blockIndex;
    const name = ascii(save, entryOffset + view.getUint32(entryOffset, true), view.getUint32(entryOffset + 4, true));
    if (name !== "player_knowledge") {
      continue;
    }

    const blockOffset = view.getUint32(entryOffset + 8, true);
    const block = save.subarray(blockOffset, blockOffset + view.getUint32(entryOffset + 12, true));
    if (ascii(block, 0, 4) !== "S2BH") {
      throw new Error("The save is damaged: its knowledge block has no S2BH header.");
    }

    const payload = block[9] === 1 ? decompress(block.subarray(14)) : block.subarray(14);
    const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const idCount = payloadView.getUint32(4, true);
    if (payload.length !== 8 + 8 * idCount) {
      throw new Error("The save is damaged: its knowledge block has an unexpected size.");
    }

    return new Set(Array.from({ length: idCount }, (_, idIndex) => payloadView.getUint32(8 + 4 * idIndex, true)));
  }

  throw new Error("This file holds no character knowledge. It can be a world save. Select characterN.ksd.");
}
