# Third-party code

## StPageFlip

- What we ship: [`src/engine/`](https://github.com/hikashop-nicolas/flipview/tree/main/src/engine)
  in this repository, our own fork. Nothing is fetched from upstream at any point.
- Taken from: https://github.com/Nodlik/StPageFlip, master `ab30ecc`, which is where
  the code came from and not what runs.
- Licence: MIT, see `src/engine/LICENSE`

The page-fold geometry and the drag interaction come from StPageFlip. It is vendored
rather than depended on: upstream has been unmaintained since January 2024, with 42
open issues, 4 open pull requests and an issue asking for the project to be marked
abandoned. The npm package was last published in 2021 and ships no type declarations.

Our changes to it are ordinary commits in this repository, so `git log src/engine/`
is the full list, and the table at the end of this file summarises them.

## pdf.js

- Source: https://github.com/mozilla/pdf.js (`pdfjs-dist`)
- Licence: Apache-2.0
- Not vendored: an optional peer dependency the host installs and configures. Only a
  host that opens PDFs needs it.

## fflate

- Source: https://github.com/101arrowz/fflate
- Licence: MIT
- Not vendored: an optional peer dependency, and only a host that opens EPUBs needs
  it, since an EPUB is a zip.

### Our changes to StPageFlip

| Change | Origin |
|---|---|
| Hard pages pinned to the block's left edge, not the book's | ours, caused a gap at the spine |
| `flipPrev` jumped from x=10 in block space | upstream PR #30, unmerged |
| `destroy()` never cancelled the render loop | upstream issue #71 |
| `.sft__wrapper` never matched anything | upstream issue #55 |
| Right-to-left reading | adapted from upstream PR #45, unmerged |
| Compiles under strictNullChecks | ours |
| `const enum` to `enum`, type-only imports | ours, needed to consume it as source |
| Unit tests for the geometry helpers | ours |

## Demo documents

`demo/public/sample.azw3` is *Alice's Adventures in Wonderland*, produced by
[Standard Ebooks](https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel)
from the Project Gutenberg text and scans from the Internet Archive, with John
Tenniel's illustrations. The text and the artwork are in the US public domain, and
Standard Ebooks dedicate their own work on it to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). It is redistributed
here unmodified, as something real for the Kindle reader to open.

`demo/public/sample.fb2` is built from `reflow.epub`, the same book from Project
Gutenberg, by `build/make-fb2.mjs`. `demo/public/sample.cbz` and the EPUBs are
covered where they came from.

## Demo audio

The two page-turn recordings in `demo/public` are from Pixabay, under the Pixabay
Content License, and are used by the demo only. The library itself ships no audio.

- https://pixabay.com/sound-effects/film-special-effects-turnpage-99756/
- https://pixabay.com/sound-effects/film-special-effects-book-page-45210/
