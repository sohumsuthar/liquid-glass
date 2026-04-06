# Liquid Glass

A production-grade implementation of Apple's iOS 26 Liquid Glass material for the web.

4-layer compositing architecture, physics-based SVG refraction using Snell's law and the convex squircle surface profile, performance-gated to run 20+ concurrent glass elements at 120fps.

---

## Quick Start

```bash
# Copy the CSS into your project
cp css/liquid-glass-core.css   your-project/styles/
cp css/liquid-glass-nav.css    your-project/styles/  # optional
cp css/liquid-glass-effects.css your-project/styles/ # optional
```

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

React:

```jsx
import { LiquidGlass } from './components'

<LiquidGlass macro contentStyle={{ padding: '24px' }}>
  <h2>Hello</h2>
</LiquidGlass>
```

---

## Architecture

Every glass surface is four absolutely-positioned layers inside a container, plus two pseudo-elements on the container itself:

```
┌─ .liquid-glass ──────────────────────────────────────┐
│  ::before (z:2)  → static noise grain, soft-light    │
│                                                       │
│  ┌─ .liquid-glass-effect (z:0) ─────────────────┐    │
│  │  backdrop-filter: blur saturate brightness    │    │
│  │  + url(#lg-refract) on macros (SVG physics)   │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-tint (z:1) ───────────────────┐    │
│  │  solid base color - visible even on black     │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-shine (z:2) ──────────────────┐    │
│  │  4 inset box-shadows (lit bezel)              │    │
│  └───────────────────────────────────────────────┘    │
│  ┌─ .liquid-glass-content (z:3) ────────────────┐    │
│  │  your content                                 │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ::after (z:4)   → cursor-tracking glow, screen      │
└───────────────────────────────────────────────────────┘
```

### Why four layers?

A single `backdrop-filter` element can't simultaneously:
- Blur the background (layer 0)
- Provide a visible base tint that shows on pure-black backgrounds (layer 1)
- Render sub-pixel inset rim highlights that track border-radius (layer 2)
- Keep content above all material effects (layer 3)

The split architecture lets each layer use a different `z-index`, blend mode, and composition strategy independently.

### The lit bezel

Apple's glass has a characteristic bright edge just inside the rounded border. This is four stacked `inset` box-shadows:

```css
box-shadow:
  inset 0 0 0 1px rgba(255, 255, 255, 0.06),     /* 1px ring */
  inset 0 0 6px 0 rgba(255, 255, 255, 0.04),     /* feathered glow */
  inset 0 2px 4px -2px rgba(255, 255, 255, 0.18), /* top specular */
  inset 0 -2px 4px -2px rgba(0, 0, 0, 0.25);     /* bottom shadow */
```

The top-to-bottom opacity ratio is $0.18 : 0.25 \approx 1 : 1.4$. This asymmetry is what makes the glass read as **convex** rather than flat. Invert the ratio for concave; equal values for flat.

### The base tint

The #1 mistake in every glassmorphism tutorial: using `background: rgba(255,255,255,0.1)` with `mix-blend-mode: overlay`. This vanishes on pure-black backgrounds.

Apple's Control Center panels have a **visible dark-gray fill** even on black. The tint layer uses a solid color with opacity:

| Mode | Inner cards | Macro wrappers |
|------|-------------|----------------|
| Dark | `rgba(28, 28, 32, 0.72)` | `rgba(20, 20, 24, 0.66)` |
| Light | `rgba(255, 255, 255, 0.78)` | `rgba(255, 255, 255, 0.70)` |

No blend mode. Just a partially-transparent fill.

---

## Physics of Refraction

Standard glassmorphism uses `backdrop-filter: blur()` which simulates **frosted glass** - light scattering uniformly. Real glass doesn't just scatter; it **bends** light based on surface curvature. This bending is refraction.

### Snell's Law

When light passes from a medium with refractive index $n_1$ into a medium with index $n_2$, the relationship between the incident angle $\theta_1$ and the refracted angle $\theta_2$ is:

$$n_1 \sin(\theta_1) = n_2 \sin(\theta_2)$$

For air ($n_1 = 1.0$) into glass ($n_2 = 1.5$):

$$\sin(\theta_2) = \frac{\sin(\theta_1)}{1.5}$$

The refracted ray bends **toward** the surface normal when entering a denser medium, then bends **away** when exiting. For thin glass viewed head-on, this produces a lateral displacement of the background - content behind the glass edge appears shifted inward.

### Surface Function

The amount of bending depends on the **slope** of the glass surface at each point. We define the glass cross-section as a height function $f(x)$ where $x \in [0, 1]$ is the normalized distance from the outer border ($x = 0$) to the inner flat surface ($x = 1$).

Apple's iOS 26 uses the **convex squircle** (superellipse) profile:

$$f(x) = \sqrt[4]{1 - (1-x)^4}$$

This is the fourth root of a quartic complement. Compare with a simple circular arc:

$$f_{\text{circle}}(x) = \sqrt{1 - (1-x)^2}$$

The squircle's advantage: it has a **softer transition** from flat interior to curved bezel. The circular arc creates a harsh inflection point where the curve meets the flat zone, producing visible refraction artifacts when stretched into rectangles. The squircle keeps gradients smooth.

### Computing Displacement

At each point in the bezel zone, the surface slope determines how much a light ray is displaced:

$$\text{slope}(x) = f'(x) = \frac{d}{dx} \sqrt[4]{1 - (1-x)^4}$$

Numerically approximated:

$$f'(x) \approx \frac{f(x + \delta) - f(x - \delta)}{2\delta}, \quad \delta = 0.001$$

The displacement magnitude is derived from a simplified single-refraction model:

$$d(x) = \frac{f'(x)}{1 + f'(x)^2}$$

This has the desired property: maximum at the border (where slope is steepest), decaying to zero at the flat interior.

We precompute 127 displacement samples along one radius (matching the 8-bit channel resolution of the displacement map):

```js
for (let i = 0; i <= 127; i++) {
  const x = i / 127
  const slope = fPrime(x)
  dispLUT[i] = slope / (1 + slope * slope)
}
```

### Vector Field

The displacement map needs both **magnitude** and **direction** at every pixel. Direction is determined by the **gradient of the signed distance field** (SDF) of the rounded rectangle:

$$\vec{n}(p) = \nabla \, \text{SDF}(p)$$

This gradient always points **orthogonal to the nearest border**, exactly the direction a refracted ray would shift. For convex glass, the displacement is **inward** (toward the center):

$$\vec{d}(p) = -\vec{n}(p) \cdot \frac{d(\lVert p - \text{border} \rVert / w)}{d_{\max}}$$

where $w$ is the bezel width and $d_{\max}$ normalizes the output to $[-1, 1]$.

### Encoding as RGB

SVG's `<feDisplacementMap>` reads displacement from an image. Each pixel's red channel encodes the X displacement, green encodes Y. The neutral value (no displacement) is 128:

$$R = 128 + d_x \cdot 127$$
$$G = 128 + d_y \cdot 127$$
$$B = 128, \quad A = 255$$

The `scale` attribute on `<feDisplacementMap>` multiplies the decoded displacement:

- A pixel with $R = 255$ displaces by $+\text{scale}$ pixels in X
- $R = 0$ displaces by $-\text{scale}$ pixels
- $R = 128$ is neutral

With `filterUnits="objectBoundingBox"` and `primitiveUnits="objectBoundingBox"`, scale is a fraction of the element's dimensions. A scale of `0.06` produces a maximum displacement of 6% of the element width - roughly 42 pixels on a 700px macro panel.

### Generating the Map

```bash
npm run generate-displacement-map
```

This runs `scripts/generate-displacement-map.mjs` which:

1. Creates a 512×512 canvas
2. For each pixel, computes the SDF distance to a rounded rectangle (radius 48px, bezel 48px)
3. If inside the bezel zone, looks up the precomputed displacement magnitude
4. Computes the SDF gradient for direction
5. Encodes as R/G pixel values
6. Writes the PNG

The output is a color-encoded vector field where the bezel ring shows up as colored bands (red/green/cyan/magenta gradients) and the flat interior is neutral gray (128, 128).

### Applying via SVG

The displacement PNG must be **base64-inlined** in the SVG. `feImage` silently fails to load external URLs from zero-size SVGs in some browsers:

```jsx
<LiquidGlassFilter displacementMap={base64DataUrl} />
```

The CSS chains it with `backdrop-filter`:

```css
backdrop-filter: blur(28px) saturate(180%) url(#lg-refract);
```

**Chrome-only.** Safari and Firefox ignore `url()` in `backdrop-filter` and fall back to the blur-only `-webkit-backdrop-filter`. Graceful degradation, not feature parity.

---

## Performance

Running 20+ `backdrop-filter` elements over an animated particle canvas at 120fps requires aggressive gating:

| Gate | Effect | Savings |
|------|--------|---------|
| `content-visibility: auto` | Off-screen glass skips rendering | ~80% with 20+ cards |
| `contain: layout paint` | Isolates repaint scope per card | ~20% paint reduction |
| `isolation: isolate` | Reduces backdrop sample region | 30-40% filter cost |
| SVG displacement on macros only | 3-5 filter passes instead of 20+ | ~75% displacement cost |
| Blur capped at 28px | Safari downsamples past 25px anyway | ~45% vs 50px |
| Particle canvas at 30fps | Halves backdrop-filter cache invalidation | ~50% composite cost |
| Touch gates `(hover: none)` | Disables spotlight, cursor, reveal, squash | 100% on mobile |

### Touch Device Behavior

On `(hover: none)` / `(pointer: coarse)` devices:
- Cursor spotlight → hidden
- Scroll reveal → elements visible immediately, no animation
- Per-glass cursor glow → hidden
- Scroll-velocity squash → disabled
- Particle canvas → hidden
- `content-visibility` → reverted to `visible`
- Lighter blur (16-22px)

---

## API

### CSS Classes

| Class | Purpose |
|-------|---------|
| `.liquid-glass` | Container - applies all 4 layers when children are present |
| `.lg-macro` | Stronger blur + SVG refraction (use on 3-5 outer wrappers per page) |
| `.lg-mobile-flat` | Strips the container on screens ≤639px |
| `.lg-navbar` | Dynamic Island pill with sticky positioning |
| `.lg-nav-btn` | Circular icon button |
| `.lg-nav-link` | Text pill nav link (+ `.is-active`) |
| `.lg-ai-gradient` | Animated rainbow border (`@property --lg-ai-angle`) |
| `.lg-tag` | Small glass pill (tags, badges) |
| `.lg-search-input` | Spotlight-style input |
| `.lg-spotlight-dropdown` | Glass dropdown panel |
| `.lg-mono` | SF Mono / JetBrains Mono monospace |
| `.lg-cursor-blink` | Terminal cursor blink animation |
| `.lg-logo-spin` | Loading spinner rotation (2.4s) |

### HTML Class Toggles

| Class on `<html>` | Set by | Effect |
|---|---|---|
| `dark` | Theme toggle | Switches all glass to dark mode values |
| `glass-off` | `GlassToggle` | Strips all `.liquid-glass` containers |
| `particles-off` | `ParticleBackground` | Marks particle canvas disabled |
| `over-glass` | Cursor hook | Brightens sitewide spotlight |
| `scrolled` | Scroll hook | Shrinks sticky navbar |

### React Components

| Component | Props | Description |
|-----------|-------|-------------|
| `<LiquidGlass>` | `macro`, `mobileFlat`, `className`, `contentClassName` | 4-layer container |
| `<LiquidGlassFilter>` | `displacementMap` (base64 data URL) | Inline SVG refraction filter |
| `<ParticleBackground>` | - | Canvas particle network + toggle button |
| `<GlassToggle>` | - | Strips glass containers via `html.glass-off` |
| `<FirstVisitTooltip>` | - | One-time "adjust UI here" hint |
| `<KeyboardHelpOverlay>` | - | Press `?` for man-page shortcuts |

### Hook

```jsx
import { useLiquidGlassEffects, Spotlight } from './hooks/useLiquidGlassEffects'

useLiquidGlassEffects({
  cursor: true,     // --mx/--my on closest glass
  spotlight: true,   // --cx/--cy on :root
  reveal: true,      // IntersectionObserver entrance
  scroll: true,      // html.scrolled + --sv/--svmag
  routeKey: '/',     // re-scan on route change
})
```

---

## Measured Values

From Apple.com DOM inspection and WWDC 2025 reverse engineering:

| Property | Inner cards | Macro wrappers |
|----------|-------------|----------------|
| Blur radius | 20px | 28px |
| Saturate | 170% | 180% |
| Brightness | 1.04 | 1.06 |
| Contrast | 1.05 | 1.06 |
| SVG displacement | - | scale 0.06 |
| Dark tint | `rgba(28,28,32,0.72)` | `rgba(20,20,24,0.66)` |
| Light tint | `rgba(255,255,255,0.78)` | `rgba(255,255,255,0.70)` |
| Border-radius | 22px | 22px |

Apple motion curves:

| Name | Value | Use |
|------|-------|-----|
| `--ease-apple-out` | `cubic-bezier(0.32, 0.72, 0, 1)` | Standard transitions |
| `--ease-apple-morph` | `cubic-bezier(0.4, 0, 0.2, 1)` | Dynamic Island morph |
| `--ease-apple-liquid` | `cubic-bezier(0.3, 0, 0, 1.3)` | Overshoot entrance |
| `--ease-apple-magnetic` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Spring snap |

---

## Files

```
css/
  liquid-glass-core.css     4-layer glass, glass-off mode, touch gates
  liquid-glass-nav.css      navbar, buttons, links, tags, search
  liquid-glass-effects.css  cursor spotlight, scroll reveal, velocity squash
  liquid-glass-dock.css     particle/glass/theme toggle pills
  liquid-glass-utils.css    monospace, cursor blink, typography

components/
  LiquidGlass.jsx           <LiquidGlass macro> wrapper
  LiquidGlassFilter.jsx     SVG displacement filter (inline)
  ParticleBackground.jsx    canvas network + 30fps throttle + mouse interaction
  GlassToggle.jsx           toggle strips glass containers
  FirstVisitTooltip.jsx     one-time dock hint
  KeyboardHelpOverlay.jsx   press ? for man-page shortcuts

hooks/
  useLiquidGlassEffects.js  4-in-1: cursor, spotlight, reveal, scroll

scripts/
  generate-displacement-map.mjs   physics-based refraction PNG generator

SKILL.md                    LLM-readable skill for Claude Code / Cursor
```

---

## License

MIT
