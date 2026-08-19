# Third-party code

## StPageFlip

- Source: https://github.com/Nodlik/StPageFlip, master `ab30ecc`
- Licence: MIT, see `src/engine/LICENSE`
- Location: `src/engine/`

The page-fold geometry and the drag interaction come from StPageFlip. It is vendored
rather than depended on: upstream has been unmaintained since January 2024, with 42
open issues, 4 open pull requests and an issue asking for the project to be marked
abandoned. The npm package was last published in 2021 and ships no type declarations.

Our changes to it are ordinary commits in this repository, so `git log src/engine/`
is the full list.

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

## Demo audio

The two page-turn recordings in `demo/public` are from Pixabay, under the Pixabay
Content License, and are used by the demo only. The library itself ships no audio.

- https://pixabay.com/sound-effects/film-special-effects-turnpage-99756/
- https://pixabay.com/sound-effects/film-special-effects-book-page-45210/
