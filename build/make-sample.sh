#!/bin/sh
# Generate demo/sample.pdf, a neutral multi-page document, via headless Chrome.
# Regenerate with: sh build/make-sample.sh
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
node build/sample-html.mjs > "$TMP/sample.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$TMP/sample.pdf" "file://$TMP/sample.html" >/dev/null 2>&1
mv "$TMP/sample.pdf" demo/public/sample.pdf
rm -rf "$TMP"
echo "demo/public/sample.pdf written"
