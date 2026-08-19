// What a Kindle book says about itself: where its text is, where its pictures
// are, how it is packed, and whether it is one book or two.
import { type PalmFile } from "./palm";

export interface MobiHeader {
  compression: number;
  textLength: number;
  textRecords: number;
  encrypted: boolean;
  /** The record the pictures and everything else start at. */
  firstResource: number;
  /** 8 for KF8 (AZW3), 6 and below for the older MOBI. */
  version: number;
  title: string;
  /** For a file holding both, the record the KF8 half starts at. */
  kf8Boundary: number | null;
  /**
   * Which extras each text record carries after its text.
   *
   * A record can end with things that are not the book: where the multi-byte
   * character it was cut through continues, and indexing the reader does not
   * need. They have to come off before the record is unpacked, or the text ends
   * up with a few bytes of rubbish every few thousand characters, which is
   * enough to make the whole book decode as the wrong encoding.
   */
  extras: number;
}

export function readHeader(palm: PalmFile, at = 0): MobiHeader {
  const record = palm.record(at);
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);

  if (record.byteLength < 16) {
    throw new Error("flipview: this Kindle book has no header");
  }

  const compression = view.getUint16(0);
  const textLength = view.getUint32(4);
  const textRecords = view.getUint16(8);
  const encrypted = view.getUint16(12) !== 0;

  const header: MobiHeader = {
    compression,
    textLength,
    textRecords,
    encrypted,
    firstResource: textRecords + 1,
    version: 6,
    title: "",
    kf8Boundary: null,
    extras: 0,
  };

  if (record.byteLength < 24 || String.fromCharCode(...record.subarray(16, 20)) !== "MOBI") {
    // A plain PalmDOC: text and nothing else, which is still a book.
    return header;
  }

  const length = view.getUint32(20);
  // Every offset below is from the start of the record, which is how the format
  // is written down: the MOBI header begins at 16 and its own fields are counted
  // from 0 there, so the two conventions differ by exactly the header it is in.
  const value = (offset: number): number =>
    offset + 4 <= 16 + length && offset + 4 <= record.byteLength ? view.getUint32(offset) : 0;

  header.version = value(36) || 6;

  // Only the later headers say, and the ones that do not have no extras.
  if (length >= 0xe4 && 244 <= record.byteLength) header.extras = view.getUint16(242);

  const firstImage = value(108);
  if (firstImage > 0 && firstImage < 0xffffffff) header.firstResource = firstImage;

  const nameAt = value(84);
  const nameLength = value(88);

  if (nameAt > 0 && nameLength > 0 && nameAt + nameLength <= record.byteLength) {
    header.title = new TextDecoder("utf-8").decode(record.subarray(nameAt, nameAt + nameLength));
  }

  // EXTH sits after the MOBI header and carries, among much else, where the KF8
  // half of a hybrid file begins.
  const exthAt = 16 + length;

  if (
    exthAt + 12 <= record.byteLength &&
    String.fromCharCode(...record.subarray(exthAt, exthAt + 4)) === "EXTH"
  ) {
    const count = view.getUint32(exthAt + 8);
    let entry = exthAt + 12;

    for (let n = 0; n < count && entry + 8 <= record.byteLength; n++) {
      const type = view.getUint32(entry);
      const size = Math.max(8, view.getUint32(entry + 4));

      if (type === 121 && size >= 12) {
        const boundary = view.getUint32(entry + 8);

        if (boundary > 0 && boundary < palm.count && boundary !== 0xffffffff) {
          header.kf8Boundary = boundary;
        }
      }

      entry += size;
    }
  }

  return header;
}

/**
 * The whole text, decompressed.
 *
 * The records are decompressed one by one and joined: they are packed
 * separately so that a reader can open a book in the middle without unpacking
 * what comes before it.
 */
export function readText(
  palm: PalmFile,
  header: MobiHeader,
  from: number,
  unpack: (compression: number, record: Uint8Array) => Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;

  for (let n = 1; n <= header.textRecords; n++) {
    const record = palm.record(from + n);
    const part = unpack(header.compression, trim(record, header.extras));

    parts.push(part);
    total += part.byteLength;
  }

  const out = new Uint8Array(total);
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }

  return out.subarray(0, Math.min(header.textLength, out.byteLength));
}

/**
 * A text record without whatever it carries after the text.
 *
 * Each flag but the lowest means one entry at the end, whose length is written
 * backwards from the end in seven bits at a time, the last byte marked. The
 * lowest flag means the record ends mid-character, and says in two bits how much
 * of the next one is here.
 */
function trim(record: Uint8Array, flags: number): Uint8Array {
  if (flags === 0 || record.byteLength === 0) return record;

  let extra = 0;

  for (let bit = 1; bit < 16; bit++) {
    if ((flags & (1 << bit)) === 0) continue;

    extra += backwards(record, record.byteLength - extra);
  }

  if (flags & 1) {
    const at = record.byteLength - extra - 1;

    if (at >= 0) extra += (record[at] & 3) + 1;
  }

  return extra > 0 && extra < record.byteLength ? record.subarray(0, record.byteLength - extra) : record;
}

/** A number written backwards from `end`, seven bits at a time. */
function backwards(record: Uint8Array, end: number): number {
  let value = 0;
  let shift = 0;
  let at = end - 1;

  while (at >= 0) {
    const byte = record[at--];

    value |= (byte & 0x7f) << shift;
    shift += 7;

    if (byte & 0x80) break;
    if (shift > 28) break;
  }

  return value;
}
