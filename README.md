# Math Scanner
> this is very new and i dont see myself putting alot of time into this but heres what it actually supports right now

| Document type | Example | Solver path |
|---|---|---|
| Elementary addition grid | `25 + 12` | Addition fast-path |
| Trig equations | `4cos(2x) + 2 = 0` | nerdamer symbolic solve |
| Vector / dot product | `(5,−1,3)·(4,2,−6)` | Vector parser |
| Rational / polynomial | `3x + 12 = 0` | nerdamer solve |

## Setup

```bash
npm install
npm run dev
```

**macOS**: You'll be prompted for Screen Recording permission on first run.
**Windows**: No special permissions needed.

## OCR accuracy tips

- Works best on printed/screen-rendered text (PDFs, browser, IDE)
- Handwritten math: accuracy is lower — Tesseract wasn't trained on handwriting.
  For handwritten notes, confidence threshold auto-filters poor reads.
- The `confidenceThreshold: 65` in `ocr.js` → `runOcr()` can be lowered to
  catch more (with more false positives), or raised to be more selective.

## Known limitations

- Fractions rendered as stacked glyphs (PDF typesetting) will OCR as two
  separate lines — this is a Tesseract layout limitation.
- Vectors in bold/arrow notation are detected by coordinate-pair regex, not
  semantic understanding.
- Superscripts (`x²`) often OCR as `x 2` — the normaliser converts `^2`
  patterns but not all combinations.

## File structure

```
electron/
  main.js        — Electron main process; orchestrates capture + OCR
  ocr.js         — Tesseract pipeline, math detection, solvers  ← NEW
  preload.js     — IPC bridge (adds onOcrResults)               ← updated
src/
  control/
    App.jsx      — Control UI with OCR results table            ← updated
  overlay/
    App.jsx      — Bubble overlay (unchanged from Phase 2)
```
