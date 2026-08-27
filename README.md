# Liquid Glass

A physically accurate glass material for the web.

4-layer compositing architecture, ray-traced SVG refraction (Snell's law through a convex-squircle glass slab), Fresnel-shaped specular rim, chromatic dispersion from real crown-glass indices, and Apple's regular/clear variant system - performance-gated to run 20+ concurrent glass elements at 120fps.

**Blog post:** [the physics behind my site's new ui](https://www.sohumsuthar.com/posts/ui-overhaul-physics)

---

## Quick Start

```bash
npm install @sohumsuthar/liquid-glass
```

Requires React 18 or later (the lens hook uses `useId`).

```jsx
// Import the core CSS (required)
import '@sohumsuthar/liquid-glass/css/liquid-glass-core.css'

// Optional CSS modules
import '@sohumsuthar/liquid-glass/css/liquid-glass-nav.css'
import '@sohumsuthar/liquid-glass/css/liquid-glass-effects.css'
import '@sohumsuthar/liquid-glass/css/liquid-glass-dock.css'
import '@sohumsuthar/liquid-glass/css/liquid-glass-utils.css'

// React component
import { LiquidGlass } from '@sohumsuthar/liquid-glass'

<LiquidGlass macro contentStyle={{ padding: '24px' }}>
  <h2>Hello</h2>
</LiquidGlass>
```

Or use the HTML classes directly:

```html
<div class="liquid-glass">
  <div class="liquid-glass-effect"></div>
  <div class="liquid-glass-tint"></div>
  <div class="liquid-glass-shine"></div>
  <div class="liquid-glass-content" style="padding: 24px;">
    Your content here.
  </div>
</div>
```

A standalone browser demo lives in `demo/index.html` (open over any local static server).

---

## What's new in 2.0.0

A ground-up fidelity pass against the real material (WWDC 2025 session 219 "Meet Liquid Glass", session 356, the HIG Materials spec, and the strongest community reverse-engineering). Everything below is grounded in either Apple's own description of the material or measured physics.

- **Ray-traced refraction (fixed physics).** The 1.x displacement model `d = f'/(1+f'²)` equals `½·sin 2θ` - it peaks at a 45° surface slope and falls to **zero at the rim**, exactly where real glass bends light hardest. 2.0 traces the actual ray: Snell refraction at the curved top surface, propagation through the slab, thickness-weighted lateral shift, and a Fresnel-transmittance fade at the grazing rim. Peak displacement now sits at the rim edge (x ≈ 0.01 of the bezel, not x ≈ 0.16) and decays smoothly inward. The map generator and all constants live in `lib/glass-optics.mjs`.
- **Chromatic dispersion.** Optional per-channel refraction using real BK7 crown-glass Fraunhofer indices (n_C = 1.5143, n_d = 1.5168, n_F = 1.5224) via the thin-prism ratio (n−1)/(n_d−1), with an exaggeration factor for UI scale. Blue bends more than red, as in real glass. **Off by default on the shared fleet filters** - the 3-pass graph can stall Chrome's compositor with many elements (measured: 5 froze capture, 1 was fine). Enable for 1-3 hero surfaces.
- **Per-element lens (`useLiquidLens` / `<LiquidGlass lens>`).** The static 512×512 map stretches with the element, so the bezel scales with size and turns elliptical on wide cards. The lens hook renders a map at the element's true CSS-pixel size with a **constant bezel width in px** (like the real material), applies it via a per-element `userSpaceOnUse` filter, regenerates on resize, and includes dispersion.
- **Regular / clear variants.** Apple ships exactly two: `regular` (frosted, adaptive, for text-heavy surfaces) and `clear` (highly translucent, for media, requires a dimming layer). The 1.x look maps to clear and stays the default; `.lg-regular` adds the frosted variant, `.lg-dimmed` adds Apple's prescribed 35% dimming layer.
- **Measured specular rim.** Traced around four Control Center surfaces, the bezel is lit on a fixed vertical axis: bright hairlines top *and* bottom (+97 L over the panel), dark hairlines left and right (-39). The crossover sits inside the corner arc. `.lg-interactive` keeps the travelling conic highlight - the one place Apple actually moves it, per WWDC 219.
- **Self-illumination (`.lg-interactive`).** Apple's `.interactive()` gel: press → spring scale-up (magnetic ease), rim energize, tint brighten, and an internal glow that blooms from under the pointer.
- **Scroll edge effects.** `.lg-scroll-edge` (+ `-top/-bottom/-hard`) - the companion system where content dissolves under floating glass near screen edges.
- **Reduce Transparency parity.** `prefers-reduced-transparency` now swaps refraction for a frostier, more opaque material instead of leaving glass fully transparent - the same mapping Apple uses.
- **`corner-shape: squircle`** progressive enhancement (Chrome 139+) for continuous-curvature corners.
- **Design tokens.** `--lg-blur/--lg-saturate/--lg-brightness/--lg-contrast/--lg-refract/--lg-radius/--lg-light-angle` drive the material; variants are just token overrides.

Back-compat: the four-layer HTML structure, all 1.x class names, `#lg-refract`/`#lg-refract-sm`, the perf gates, FPSGuard, and the hooks API are unchanged. Regenerate your displacement map (`npm run generate-displacement-map`) and note the static filter's physically-calibrated default `scale` is now 0.1 (was 0.45 - see below).

---

## Architecture

Every glass surface is four absolutely-positioned layers inside a container, plus two pseudo-elements on the container itself:

```
┌─ .liquid-glass ──────────────────────────────────────┐
│  ::before (z:2)  → static noise grain, soft-light    │
│                                                       │
│  ┌─ .liquid-glass-effect (z:0) ─────────────────┐    │
│  │  backdrop-filter: blur saturate brightness    │    │
│  │  + var(--lg-refract) SVG displacement         │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-tint (z:1) ───────────────────┐    │
│  │  solid base color - visible even on black     │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-shine (z:2) ──────────────────┐    │
│  │  Fresnel bezel (inset shadows)                │    │
│  │  ::before → directional conic specular ring   │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-content (z:3) ────────────────┐    │
│  │  your content                                 │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ::after (z:4)   → cursor glow / self-illumination   │
└───────────────────────────────────────────────────────┘
```

This mirrors Apple's own decomposition of the material (WWDC 219): a lensing layer, a tint/adaptive-luminosity layer, a highlights layer, and a shadows layer, with content always on top.

### Why four layers?

A single `backdrop-filter` element can't simultaneously:
- Refract and blur the background (layer 0)
- Provide a visible base tint that shows on pure-black backgrounds (layer 1)
- Render sub-pixel rim highlights that track border-radius (layer 2)
- Keep content above all material effects (layer 3)

The split architecture lets each layer use a different `z-index`, blend mode, and composition strategy independently.

### Variants

Apple ships exactly two material variants and warns against mixing them in one interface:

| | Default (= Apple "clear") | `.lg-regular` |
|---|---|---|
| Blur | 2px | 12px |
| Tint (dark) | `rgba(28,28,32,0.30)` | `rgba(34,34,38,0.62)` |
| Tint (light) | `rgba(255,255,255,0.40)` | `rgba(248,248,250,0.66)` |
| Use for | glass over media-rich content | text-heavy surfaces (bars, cards, menus) |
| Legibility | add `.lg-dimmed` (35% dim layer, per HIG) | built in |

### The specular rim

Two mechanisms, both physically motivated:

1. **Fresnel bezel** (inset box-shadows): unpolarized reflectance R(θ) = ½(rs² + rp²) rises from 4% at normal incidence to 100% at the grazing rim, so the rim ring is a thin bright core with fast feathered decay. The top-to-bottom `0.18 : 0.25` asymmetry keeps the convex read (invert for concave).
2. **Measured ring** (`.liquid-glass-shine::before`): two axis-aligned gradients rather than a conic. Pixel traces of Control Center give bright top *and* bottom hairlines and dark flanks, holding bright to ~37° off vertical and dark to ~30° off horizontal. A conic cannot express that - it spreads one highlight around all four edges, brightening the flanks and dimming the horizontals as the angle sweeps, which is the opposite of the measurement. `.lg-interactive` restores the conic, driven by `--lg-light-angle` as before.

   Check this at the right resolution: a retina capture puts the rim peak at L 153, but integrated over one CSS pixel it is 129 over a 57 interior. Tuning to the raw peak lands the rim ~40% hot.

### The base tint

Sampled across two wallpapers - a near-black desktop and a violet one - the material follows a single compressive line:

```
glass_L = 0.48 * backdrop_L + 34
```

Black (L 9) lifts 4.3x to L 37; an already-light ground (L 53) barely moves, at 1.13x. One curve, which is why Apple's panels look the same on any wallpaper, and why fitting a single *ratio* overshoots in one direction and then the other.

In compositing terms the slope is `--lg-brightness` and the intercept is the tint alpha: 34/255 = 0.134, giving brightness 0.48/(1-0.134) = 0.56. The scrim is **neutral** - over a black desktop those panels measure `rgb(36,37,40)`, chroma 4 against a chroma-3 ground - so all colour comes from the backdrop, and `--lg-saturate` runs high to put back what dimming and a white scrim take out, landing glass chroma on the measured 1:1.

The #1 mistake in every glassmorphism tutorial is `background: rgba(255,255,255,0.1)` with `mix-blend-mode: overlay`, which vanishes on black. A *dark* scrim is the same error inverted: it drives the intercept the wrong way, so the panel disappears on black instead of lifting to 37. The tint layer is a plain partially-transparent light fill, no blend mode.

---

## Physics of Refraction

Standard glassmorphism uses `backdrop-filter: blur()`, which simulates **frosted glass** - light scattering uniformly. Apple describes Liquid Glass as the opposite: a material that "dynamically bends, shapes and concentrates light" - **lensing**, not scattering. That bending is refraction.

### The model

The glass is a slab resting on the background plane, with a **convex squircle** bezel profile (height vs normalized distance x from the outer edge):

```
f(x) = (1 - (1-x)^4)^(1/4)
```

The squircle's advantage over a circular arc `√(1-(1-x)²)`: a softer transition from flat interior to curved bezel, so no visible inflection artifact when the profile is swept around a rectangle.

A vertical viewing ray is traced through the slab:

```
θs(x) = atan f'(x)              surface tilt = angle of incidence
θr(x) = asin(sin θs / n)        Snell's law, n = 1.5168 (BK7 crown glass)
t(x)  = T0 + B·f(x)             glass thickness below the entry point
d(x)  = t(x) · tan(θs - θr)     lateral shift at the background plane
```

The exit face is flat and the background sits directly behind it, so the exit refraction adds no further shift. The displacement is additionally weighted by **Fresnel transmittance** `1 - R(θs)`: at the grazing rim the surface stops transmitting and starts reflecting - which is also the physical justification for the bright rim ring.

`d(x)` peaks essentially at the rim (x ≈ 0.01, value ≈ 0.76·B for n = 1.52 before the Fresnel fade) and decays monotonically inward - matching the strong edge-lensing of the real material.

> The 1.x model `d = f'/(1+f'²) = ½·sin 2θ` peaked at a 45° slope (x ≈ 0.16) and fell to ~0 at the rim - a dead zone exactly where lensing should be strongest. If you're upgrading: regenerate the map.

### Direction

The displacement vector points along the negated SDF gradient - **inward, toward the center**. A convex slab magnifies: each display pixel samples background from slightly closer to the center. (Some recreations describe this as content appearing "pushed outward" - same thing, seen from the other side.)

### Dispersion (chromatic aberration)

Refractive index varies with wavelength (Cauchy: n(λ) = A + B/λ²). For BK7 crown glass at the Fraunhofer lines:

| Channel | λ | n | relative displacement (n−1)/(n_d−1) |
|---|---|---|---|
| Red | 656 nm | 1.5143 | 0.99516 |
| Green | 588 nm | 1.5168 | 1.00000 |
| Blue | 486 nm | 1.5224 | 1.01084 |

Physically exact fringing is only ~1% - invisible at UI scale - so `dispersionScales(strength)` exaggerates the spread linearly (strength ≈ 8 gives a ~2px fringe on a hero card). The filter graph: three `feDisplacementMap` passes at the per-channel scales → `feColorMatrix` channel isolation → two `feBlend mode="screen"` recombines (channels are disjoint, so screen = add). Fringes appear only where displacement is non-zero, i.e. the rim - the interior stays clean automatically because the map is neutral there.

### Encoding as RGB

`feDisplacementMap` reads displacement from an image: R = X, G = Y, 128 = neutral, offset = scale × (channel/255 − 0.5). The LUT is normalized so its peak hits channel 255 (full 8-bit precision), and the filter's `scale` converts back to physical units:

- **Static filters** (`objectBoundingBox`): bezel = 48/512 = 9.4% of the element, peak = 0.524 × bezel ≈ 4.9% of element size, so the physically-exact scale is 2.008 × 0.049 ≈ **0.1** (the new default).
- **Lens filters** (`userSpaceOnUse`): scale = 2.008 × 0.524 × bezel_px ≈ 1.05 × bezel_px.

`colorInterpolationFilters="sRGB"` is mandatory - in linearRGB the 128-neutral drifts and the whole backdrop shifts.

### Generating the map

```bash
npm run generate-displacement-map
```

`scripts/generate-displacement-map.mjs` renders the vector field for a 512×512 rounded rect (radius 48, bezel 48) via the shared `lib/glass-optics.mjs` (exact rounded-rect SDF for direction, ray-trace LUT for magnitude, linear-interpolated sampling). The PNG must be **base64-inlined** into the SVG filter - `feImage` silently fails on external URLs from zero-size SVGs in some browsers.

### Applying via SVG

```css
backdrop-filter: blur(2px) saturate(180%) brightness(1.06) contrast(1.04) var(--lg-refract);
```

`--lg-refract` defaults to `url(#lg-refract-sm)` (inner cards) / `url(#lg-refract)` (macros); the lens hook swaps in its per-element filter by setting the variable inline.

**Chrome-only.** Safari and Firefox ignore `url()` in `backdrop-filter`, but they reach the blur-only fallback by different routes. Safari falls back through `-webkit-backdrop-filter`, a WebKit alias, so the blur-only declaration wins there. Gecko never implemented that alias, so `liquid-glass-core.css` gives Firefox its own blur-only declaration in an `@supports (-moz-appearance: none)` block — without it Firefox would parse only the `url()`-bearing declaration and drop the filter entirely. (WebKit has patches in flight for `backdrop-filter: url()` as of mid-2026; Firefox has no signal.) Graceful degradation, not feature parity.

---

## Performance

Running 20+ `backdrop-filter` elements over an animated particle canvas at 120fps requires aggressive gating:

| Gate | Effect | Savings |
|------|--------|---------|
| Single-pass displacement default | Dispersion off on fleet filters | avoids compositor stalls |
| Blur capped at 2px (clear) | Minimal blur cost | ~90% vs 28px |
| Particle canvas at 30fps | Halves backdrop-filter cache invalidation | ~50% composite cost |
| Touch gates `(hover: none)` | Disables spotlight, cursor, reveal, squash | 100% on mobile |
| `.lg-blur-only` (opt-in) | Drops inner-card SVG displacement | Lighter scroll recalc |
| `<FPSGuard>` (opt-in) | Auto-strips glass on sustained-low-fps devices | Graceful degradation |

**Dispersion budget:** the chromatic-aberration graph triples the displacement work. Measured on Chrome/Windows: 1 CA element fine, 5 CA elements stalled the compositor. Use dispersion on 1-3 hero surfaces only (lens mode, or `<LiquidGlassFilter dispersion={8}>` which applies it to the macro filter `#lg-refract` alone). The fleet filter `#lg-refract-sm` sits on every non-macro `.liquid-glass` and stays single-pass unless you explicitly raise `smDispersion`.

**Lens budget:** map generation is canvas work on resize only (rAF-debounced, ResizeObserver). Steady-state cost equals any other single-displacement backdrop filter plus the CA passes if enabled.

---

## API

### CSS Classes

| Class | Purpose |
|-------|---------|
| `.liquid-glass` | Container - applies all 4 layers when children are present |
| `.lg-macro` | Thicker glass: `#lg-refract`, wider rim, deeper shadows |
| `.lg-regular` | Apple's frosted adaptive variant (text-heavy surfaces) |
| `.lg-dimmed` | 35% dimming layer for clear glass over bright media (HIG) |
| `.lg-interactive` | Gel press: spring scale, rim energize, self-illumination |
| `.lg-mobile-flat` | Strips the container on screens ≤639px |
| `.lg-blur-only` | Opt-in perf lever - drops inner-card SVG refraction |
| `.lg-scroll-edge` (+`-top/-bottom/-hard`) | Scroll edge effect under floating glass |
| `.lg-navbar` | Dynamic Island pill with sticky positioning |
| `.lg-nav-btn` / `.lg-nav-link` | Circular icon button / text pill (+ `.is-active`) |
| `.lg-ai-gradient` | Animated rainbow border |
| `.lg-tag` | Small glass pill (tags, badges) |
| `.lg-search-input` / `.lg-spotlight-dropdown` | Spotlight-style input / dropdown |
| `.lg-mono` / `.lg-cursor-blink` / `.lg-logo-spin` | Utilities |

### Design tokens (CSS custom properties)

| Token | Default | Meaning |
|---|---|---|
| `--lg-blur` | `2px` (12px regular) | backdrop blur |
| `--lg-saturate` | `180%` | backdrop saturation |
| `--lg-brightness` / `--lg-contrast` | `1.06` / `1.04` | backdrop luminosity |
| `--lg-refract` | `url(#lg-refract-sm)` | SVG filter reference (lens overrides inline) |
| `--lg-radius` | `22px` | corner radius |
| `--lg-light-angle` | `315deg` | specular key-light direction (0° = up, clockwise) |

### HTML Class Toggles

| Class on `<html>` | Set by | Effect |
|---|---|---|
| `dark` | Theme toggle | Switches all glass to dark mode values |
| `glass-off` | `GlassToggle` / `FPSGuard` | Strips all `.liquid-glass` containers |
| `particles-off` | `ParticleBackground` / `FPSGuard` | Marks particle canvas disabled |
| `lg-blur-only` | You (opt-in) | Drops inner-card SVG refraction site-wide |
| `over-glass` | Cursor hook | Brightens sitewide spotlight |
| `scrolled` | Scroll hook | Shrinks sticky navbar |

### React Components

| Component | Props | Description |
|-----------|-------|-------------|
| `<LiquidGlass>` | `macro`, `variant` (`'clear'`\|`'regular'`), `dimmed`, `interactive`, `lens`, `lensOptions`, `mobileFlat`, `className`, `contentClassName` | 4-layer container |
| `<LiquidGlassFilter>` | `displacementMap` (base64 data URL), `scale` (default 0.1), `smScale`, `dispersion` (default 0, macro filter), `smDispersion` (default 0, fleet filter) | Shared SVG refraction filters |
| `<ParticleBackground>` | - | Canvas particle network + toggle button |
| `<FPSGuard>` | - | Auto-strips glass on sustained-low-fps devices; 7-day retest |
| `<GlassToggle>` | - | Strips glass containers via `html.glass-off` |
| `<FirstVisitTooltip>` / `<KeyboardHelpOverlay>` | - | UX helpers |

### Hooks

```jsx
import { useLiquidGlassEffects, Spotlight } from '@sohumsuthar/liquid-glass/hooks'

useLiquidGlassEffects({
  cursor: true,     // --mx/--my + --lg-light-angle on closest glass
  spotlight: true,  // --cx/--cy on :root
  reveal: true,     // IntersectionObserver entrance (+ rescue net)
  scroll: true,     // html.scrolled + --sv/--svmag
  routeKey: '/',    // re-scan on route change
})
```

```jsx
import { useLiquidLens } from '@sohumsuthar/liquid-glass/hooks/useLiquidLens'

const ref = useRef(null)
const lens = useLiquidLens(ref, { bezel: 14, refraction: 1, dispersion: 8 })
// <div ref={ref} className="liquid-glass" style={{ '--lg-refract': lens.filter }}>
//   {lens.svg} ...
```

### Optics library

```js
import {
  displacementProfile, buildDisplacementLUT, renderDisplacementMap,
  dispersionScales, fresnelReflectance, rimReflectanceProfile,
  sdfRoundedRect, sdfGradient, surfaces,
} from '@sohumsuthar/liquid-glass/optics'
```

Pure math, no DOM - shared by the Node map generator and the browser lens.

---

## Fidelity notes vs the real material

Grounded in WWDC25 219/356 and the HIG; useful if you're pushing further:

- **Adaptive light/dark flip** (glass senses background luminance and flips its own appearance) has no general web equivalent - the backdrop isn't readable from CSS/JS. Ship `dark` / not-dark classes from your theme instead. Apple also never flips *large* elements, only small ones.
- **Glass never samples glass** - Apple's rule. On the web the same constraint arrives as a hard one: anything that makes an ancestor a Backdrop Root (`isolation`, paint containment, `content-visibility`, `transform`, `opacity < 1`, `mask`, `will-change`) leaves a nested `backdrop-filter` with nothing to sample, and it fails silently. Don't nest glass on glass, and don't wrap glass in those properties.
- **Concentric corners:** nested radius = parent radius − padding. With tokens: `--lg-radius: calc(var(--parent-radius) - var(--inset))`.
- **Accessibility parity:** Reduce Transparency → frostier (built in); Increase Contrast → add a contrasting border; Reduce Motion → gel/squash/reveal disabled (built in).
- Not modeled: metaball morphing between glass elements (`GlassEffectContainer`), glow spilling onto *nearby* glass, device-tilt lighting on mobile (touch devices run blur-only), scroll-edge auto soft/hard switching.

---

## Files

```
lib/
  glass-optics.mjs          shared physics: ray trace, Fresnel, dispersion,
                            SDF, LUT builder, map renderer

css/
  liquid-glass-core.css     4-layer glass, variants, tokens, specular ring,
                            interactive gel, accessibility + perf gates
  liquid-glass-nav.css      navbar, buttons, links, tags, search
  liquid-glass-effects.css  cursor spotlight, scroll reveal, velocity squash,
                            scroll edge effects
  liquid-glass-dock.css     particle/glass/theme toggle pills, FPS-guard notice
  liquid-glass-utils.css    monospace, cursor blink, typography

components/
  LiquidGlass.jsx           <LiquidGlass macro variant lens interactive>
  LiquidGlassFilter.jsx     shared SVG filters (+ optional dispersion)
  ParticleBackground.jsx    canvas network (SoA typed arrays) + 30fps throttle
  FPSGuard.jsx              auto-degrade glass on sustained-low-fps devices
  GlassToggle.jsx           toggle strips glass containers
  FirstVisitTooltip.jsx     one-time dock hint
  KeyboardHelpOverlay.jsx   press ? for man-page shortcuts

hooks/
  useLiquidGlassEffects.js  cursor (+ light angle), spotlight, reveal, scroll
  useLiquidLens.js          per-element ray-traced refraction filter

scripts/
  generate-displacement-map.mjs   physics-based refraction PNG generator

demo/
  index.html                standalone browser demo (serve statically)
```

---

## License

MIT
