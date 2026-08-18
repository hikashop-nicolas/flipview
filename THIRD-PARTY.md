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
- Not vendored: an optional peer dependency the host installs and configures.
