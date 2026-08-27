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
  content). Layer order is load-bearing. `isolation: isolate` is NOT — see below.

## Constraints worth knowing before editing CSS

- **Nothing on `.liquid-glass` may create a Backdrop Root.** `backdrop-filter`
  samples the backdrop image of its nearest Backdrop Root, and per Filter
  Effects 1 that root is formed by `isolation: isolate`, by paint containment
  (`contain: paint`, and empirically `contain: layout` in Blink), by
  `content-visibility: auto` (which implies paint containment), and by any
  `transform` / `opacity < 1` / `mask` / `will-change` on an ancestor. When the
  container forms one, the effect layer inside it has nothing behind it and the
  filter resolves to a no-op — silently. No error, no warning, just a flat tint
  over a perfectly sharp background.

  Through 2.0.0 the container carried `isolation: isolate`, `contain: layout
  paint` and `content-visibility: auto` together, so the material never
  rendered: measured against a 12px striped backdrop, the card retained 69% of
  the backdrop's stripe amplitude with them and 1.2% without. Everything else in
  the file — refraction LUT, dispersion graph, Fresnel rim — was compositing
  over an unfiltered backdrop. Do not reintroduce them; `content-visibility:
  auto` in particular reads as free off-screen perf and costs the whole effect.

  Verify with a striped backdrop, not a photo: on a smooth gradient a dead
  backdrop-filter looks fine.

- **The material is calibrated, not tuned.** Sampling macOS 26 Control Center
  across a near-black and a violet wallpaper gives one compressive line,
  `glass_L = 0.48 * backdrop_L + 34`. The slope is `--lg-brightness`, the
  intercept is the tint alpha (34/255 = 0.134), the scrim is neutral because the
  panels measure chroma 4 over a chroma-3 ground, and `--lg-saturate` is set so
  glass chroma lands on the backdrop's 1:1. `.lg-regular` carries the measured
  numbers — Control Center is Apple's regular variant. The clear defaults are
  half the scrim: same form, extrapolated, not measured. Re-derive rather than
  nudging one token, or the curve stops holding at one end while you fix the
  other.

- **Measure the rim at display resolution.** A retina capture puts the rim peak
  at L 153; integrated over one CSS pixel it is 129 over a 57 interior. Tuning
  to the raw peak lands the rim ~40% hot.

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
