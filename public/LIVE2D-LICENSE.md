# Live2D assets (desktop pet)

## Files

- `live2dcubismcore.min.js` — Live2D Cubism Core (Web). Subject to [Live2D Cubism SDK License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html). Obtained from the official Cubism SDK for Web distribution / Core CDN.
- `live2d/hiyori/` — Live2D Sample Model **Hiyori** (Cubism 3/4). Subject to the [Free Material License Agreement](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html) / Sample Model terms. For evaluation and non-commercial sample use; review licenses before shipping commercially.

## Replace the character

Put another Cubism 4 `.model3.json` tree under `public/live2d/<name>/` and update `MODEL_CANDIDATES` in `src/domains/pet/ui/useLive2dPet.ts`.

## Source note

Hiyori files were taken from the `live2d-lib` npm package `resources/Hiyori` (mirrors common Sample assets). Prefer refreshing from official Cubism Samples when redistributing.
