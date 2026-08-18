# Accessibility scan

Runs axe-core against the states a reader can put the viewer in, and fails when a
state gains a violation it did not have before.

States rather than pages: a flipbook is one page whose accessibility changes as it
is used, and the states worth auditing (a book over the page, a book filling the
screen, the moment the share button reports back) only exist after someone has
clicked something. The scanner clicks for real, so the browser grants what a
genuine gesture unlocks, which is the only way to audit fullscreen at all.

## Running it

    npm run build:demo              # from the repository root, once per change
    cd tools/a11y
    npm install                     # once, pulls puppeteer-core and axe-core
    npm run scan                    # every state
    node scan.js --id lightbox      # one state
    node scan.js --headed           # watch the browser do it

It drives the Chrome already on the machine rather than downloading its own: set
`CHROME_PATH`, or the `chrome` entry of states.json, if it lives elsewhere. The
demo is served from `demo-dist` by the scanner itself, so nothing else has to be
running.

Full axe results land in `reports/` (gitignored), one file per state.

## What fails a run

`expected.json` records how many nodes each state fails on, per axe rule. A rule
that appears, or that fails on more nodes than recorded, fails the run. Fewer is
reported as an improvement and never fails, so the reference is only rewritten
when someone means to:

    node scan.js --update-expected

Every state is currently clean, so any violation at all is a regression.

## What this does not cover

axe finds around half of WCAG. It cannot tell you whether the reading order makes
sense, whether a page turn is announced usefully, or whether the book can be read
at all with a screen reader. That still needs a person with a keyboard and one.
