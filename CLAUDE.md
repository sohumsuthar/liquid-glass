# liquid-glass

Published as `@sohumsuthar/liquid-glass`. A React + CSS design system implementing
Apple's Liquid Glass material: SVG displacement-map refraction traced through a
glass slab, Fresnel specular rim, chromatic dispersion, `backdrop-filter` blur.

## The one rule that has already broken a release

**Any file containing JSX must have a `.jsx` extension. Never `.js`.**

This package ships unbundled source — no build step, no compiled `dist/`. Consumer
bundlers parse these files directly, and esbuild (which Vite uses for dependency
pre-bundling) applies its `js` loader to `.js` files, which cannot parse JSX. A
JSX-bearing `.js` file anywhere in the entry graph aborts `vite optimize` with
"The JSX syntax extension is not currently enabled", and the consumer's dev server
never starts.

This shipped broken once: `hooks/useLiquidLens.js` returned JSX and was reachable
from the root export. Fixed in 6a88c23 by renaming both hooks to `.jsx`.

Before publishing, always run:

```bash
npx esbuild --bundle --external:react --external:react-dom --outfile=/dev/null components/index.js
```

## Release verification

`npm pack` and a `vite build` in the repo are not sufficient — the failure mode
above appears only in Vite's *dependency pre-bundling*, which the rollup build path
skips. Verify against a real install:

```bash
npm pack
# in a scratch dir: clean Vite 5 + @vitejs/plugin-react@4 app
npm i react react-dom vite@5 @vitejs/plugin-react@4 /path/to/sohumsuthar-liquid-glass-*.tgz
npx vite optimize --force   # the command that catches the JSX-loader failure
npm run build
```

Exercise every documented import path in the test app: the root export, `/hooks`,
`/hooks/useLiquidLens`, `/optics`, and `/css/*`.

`npm publish` requires a 2FA one-time password (the account is set to
`auth-and-writes`), so it cannot run unattended — pass `--otp=<code>` or use a
granular access token.

## Architecture

- `lib/glass-optics.mjs` — the physics. Rounded-rect SDF for displacement
  direction, ray-traced LUT for magnitude (Snell refraction at the curved top
  surface, propagation through the slab, Fresnel-transmittance fade at the
  grazing rim). Pure, no DOM. Shared by the build script and the runtime hook.
- `scripts/generate-displacement-map.mjs` — renders a static 512x512 map PNG to
  `public/static/images/`. Output is gitignored; the PNG must be base64-inlined
  into the SVG filter, since `feImage` silently fails on external URLs from
  zero-size SVGs in some browsers.
- `components/LiquidGlassFilter.jsx` — the two shared filters, `#lg-refract`
  (macro surfaces) and `#lg-refract-sm` (everything else).
- `hooks/useLiquidLens.jsx` — per-element alternative that generates a map at the
  element's real pixel size with a constant-width bezel, avoiding the elliptical
  distortion the shared stretched map produces on wide cards.
- `components/LiquidGlass.jsx` — the 4-layer container (effect / tint / shine /
  content). Layer order and `isolation: isolate` are load-bearing.

## Constraints worth knowing before editing CSS

- **`#lg-refract-sm` is on every non-macro `.liquid-glass`.** Anything that makes
  that filter more expensive multiplies across the whole page. The chromatic
  dispersion graph runs three `feDisplacementMap` passes; five such elements
  measurably stalled Chrome's compositor. This is why `dispersion` and
  `smDispersion` are separate props and `smDispersion` defaults to 0.
- **`corner-shape` does not inherit**, and `border-radius: inherit` carries only
  the radius. Every layer that inherits the radius must opt into the squircle
  explicitly or it draws a circular arc ~0.19r inside the container silhouette,
  reading as a doubled corner outline in Chrome 139+.
- **Firefox has no `-webkit-backdrop-filter` alias.** Gecko parses only the
  unprefixed declaration, which carries `var(--lg-refract)`, and it cannot apply
  an `feImage`/`feDisplacementMap` graph to a backdrop. It needs its own
  blur-only declaration in an `@supports (-moz-appearance: none)` block, or it
  loses the filter entirely and renders a flat tint over a sharp background.
- `colorInterpolationFilters="sRGB"` is mandatory on the filters. In linearRGB
  the 128-neutral drifts and the whole backdrop shifts.
- Requires React 18+ (`useLiquidLens` calls `useId`, and `LiquidGlass` calls that
  hook unconditionally, so it is not gated behind the `lens` prop).

## Conventions

- No build step and no TypeScript. Keep it that way unless deliberately changing
  the distribution model.
- Comments in this codebase explain *why* — the physics, the browser bug being
  worked around, the measured perf reason. Match that; do not narrate what the
  code already says.
- Every `exports` subpath must point at a file that exists. The `"./hooks/*"`
  pattern is literal — it does not append extensions, so any extensionless path
  documented in the README needs its own explicit entry.
