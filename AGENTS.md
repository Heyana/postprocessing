# Repository Guidelines

## Project Structure & Module Organization
- `src/` hosts runtime modules (core, effects, passes, loaders, shaders, utils). Place new functionality beside its runtime counterpart and co-locate GLSL helpers under `effects/glsl`.
- `test/` mirrors `src/` (e.g., `src/effects/BloomEffect.js` ⇔ `test/effects/BloomEffect.js`). Keep fixtures lightweight and near the spec they serve.
- `demo/` and `manual/` power the Hugo docs site; their compiled output lands in `public/`. Edit sources only and let scripts refresh generated assets.
- `docs/` captures design notes, `libs/` and `types/` provide shared helpers, while `build/` and `temp/` are script outputs that should be cleaned before commits.

## Build, Test & Development Commands
- `npm run build` = clean → CSS via Sass → JS bundles via esbuild (both prod and min) → TypeScript declarations.
- `npm run watch` starts `watch:css`, `watch:js`, and `start` for hot-reloading demos.
- `npm run start` serves `manual/` at http://localhost:1313; `npm run copy` syncs demo static assets into `public/demo`.
- `npm run lint` (or scoped `lint:js`, `lint:css`, `lint:dts`) must pass before opening a PR; `npm run test` mirrors the CI pipeline (lint → build → ava → esdoc).

## Coding Style & Naming Conventions
- Source files are ES modules with TypeScript-friendly JSDoc. Preserve hard tabs for indentation, 120-char soft wraps, and camelCase identifiers (`AdaptiveSharpenEffect`).
- Export names should match filenames; stick to `*Effect`, `*Pass`, `*Material`, etc. Keep shader filenames suffixed `.frag`/`.vert` and colocated with their effect.
- Run `eslint`, `stylelint`, and `tsc` through the provided scripts—manual formatting changes are discouraged.

## Testing Guidelines
- AVA scans `test/**/*`; add a spec whenever you touch `src`. Mirror directory depth so reviewers can diff runtime/test pairs easily.
- Prefer descriptive test titles and cover edge cases (multi-render-target, depth textures, timers). Use `npm run ava` for focused runs before the full suite.
- Visual features require a manual check: run `npm run watch`, open the relevant demo, and capture a screenshot for regressions.

## Commit & Pull Request Guidelines
- Branch from `dev`, rebase onto the latest `dev`, and keep commits scoped. Conventional prefixes (`feat:`, `fix:`, `chore:`) align with the existing history.
- Every PR must note tests run (`npm run test`, manual demo URLs) and link the related issue. Include doc/manual updates and assets when the feature affects them.
- Never commit generated bundles or local secrets (`auth.json`, `.npmrc`). Use `npm run clean` before pushing to ensure the diff only contains source changes.
