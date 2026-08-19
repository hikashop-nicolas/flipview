// The container a Kindle book comes in: a Palm database, which is a header, a
// table of where each record starts, and the records.
export interface PalmFile {
  /** "BOOK" for a Kindle book, "TEXt" for the PalmDOC it grew out of. */
  type: string;
  creator: string;
  count: number;
  /** Record n, or an empty array when the file does not go that far. */
  record(index: number): Uint8Array;
}

export function readPalm(bytes: Uint8Array): PalmFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength < 78) {
    throw new Error("flipview: this file is too short to be a Kindle book");
  }

  const count = view.getUint16(76);
  const starts: number[] = [];

  for (let at = 0; at < count; at++) {
    const entry = 78 + at * 8;

    if (entry + 4 > bytes.byteLength) break;

    starts.push(view.getUint32(entry));
  }

  return {
    type: text(bytes, 60, 4),
    creator: text(bytes, 64, 4),
    count: starts.length,
    record(index) {
      const from = starts[index];

      if (from === undefined) return new Uint8Array();

      const to = starts[index + 1] ?? bytes.byteLength;

      return bytes.subarray(from, Math.max(from, Math.min(to, bytes.byteLength)));
    },
  };
}

function text(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}
