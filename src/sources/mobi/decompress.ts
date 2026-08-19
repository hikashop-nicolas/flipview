// How a Kindle book's text is packed.
//
// PalmDOC is a small LZ77 that MOBI inherited from the format it grew out of,
// and it is what an AZW3 uses. Some older MOBI files use HUFF/CDIC instead, a
// Huffman code over a dictionary of phrases; those are refused rather than
// guessed at, because a decompressor that is nearly right produces a book of
// plausible nonsense and says nothing about it.
export const NONE = 1;
export const PALMDOC = 2;
export const HUFFCDIC = 17480;

/** PalmDOC's LZ77: literals, back-references, and a shorthand for "space + x". */
export function palmdoc(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 0;

  while (at < input.length) {
    const byte = input[at++];

    if (byte === 0) {
      out.push(0);
    } else if (byte <= 8) {
      // Literals: this many bytes are themselves.
      for (let n = 0; n < byte && at < input.length; n++) out.push(input[at++]);
    } else if (byte <= 0x7f) {
      out.push(byte);
    } else if (byte >= 0xc0) {
      // The commonest pair in English text, in one byte.
      out.push(0x20, byte ^ 0x80);
    } else {
      // Two bytes: how far back to go, and how much to take.
      const pair = (byte << 8) | (input[at++] ?? 0);
      const distance = (pair >> 3) & 0x07ff;
      const length = (pair & 7) + 3;

      for (let n = 0; n < length; n++) {
        const from = out.length - distance;

        out.push(from >= 0 ? out[from] : 0);
      }
    }
  }

  return Uint8Array.from(out);
}

export function unpack(compression: number, record: Uint8Array): Uint8Array {
  if (compression === PALMDOC) return palmdoc(record);
  if (compression === NONE) return record;

  throw new Error(
    "flipview: this book is packed with HUFF/CDIC, which is not read yet. " +
      "Converting it to EPUB will open it."
  );
}
