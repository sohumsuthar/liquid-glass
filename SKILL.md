---
name: apple-liquid-glass-system
description: Production-grade Apple iOS 26 Liquid Glass design system. Complete 4-layer architecture with real physics-based SVG refraction, performance gates for 20+ glass elements, control dock UX pattern, and specific measured values. Use when building polished glass-heavy UIs, not quick glassmorphism cards.
---

# Apple Liquid Glass System — Production-Grade

Build Apple iOS 26 / macOS Tahoe Liquid Glass UIs that scale to 20+ concurrent glass elements on a page without tanking FPS. Based on reverse-engineered Apple values and a real portfolio site that ships at 120fps.

For quick Tailwind glassmorphism cards, use `liquidglass-design.md`. This skill is for **full design systems** with navbars, cards, modals, search, and macros that all feel coherent.

Canonical reference implementation: `~/Documents/GitHub/suthar-portfolio` — see `css/extra.css`, `scripts/generate-displacement-map.mjs`, `pages/_app.js`, `components/ParticleBackground.js`.

## When to Use

- Building a full design system with 10+ glass surfaces (not a single demo card)
- Need physics-based refraction (not just blur)
- Targeting 60fps/120fps with concurrent animated content beneath glass
- Want user-facing controls to toggle glass/effects
- User mentions "Apple Liquid Glass", "iOS 26 material", "macOS Tahoe", "real refraction"
- The quick Tailwind glassmorphism approach isn't enough

## Core Insight: Glass Must Have a Base Color

The #1 mistake in every glass tutorial: `background: rgba(255,255,255,0.1)` with `mix-blend-mode: overlay`. This disappears on pure black backgrounds.

**Apple's actual Control Center panels show a VISIBLE dark-gray panel even over pure black.** The glass material has its own color, partially transparent, so you can see through it to blurred content beneath.

Measured values (from Apple.com inspection + reverse engineering):
- Dark mode inner: `rgba(28, 28, 32, 0.72)`
- Dark mode macro: `rgba(20, 20, 24, 0.66)`
- Light mode inner: `rgba(255, 255, 255, 0.78)`
- Light mode macro: `rgba(255, 255, 255, 0.70)`

No blend modes. Solid tint on top of backdrop-filtered content.

## 4-Layer Architecture

Every glass container is 4 absolutely-positioned siblings plus 2 pseudo-elements:

```html
<div class="liquid-glass">
  <div class="liquid-glass-effect" />   <!-- z:0 backdrop-filter -->
  <div class="liquid-glass-tint" />     <!-- z:1 base tint color -->
  <div class="liquid-glass-shine" />    <!-- z:2 inner rim highlights -->
  <div class="liquid-glass-content">    <!-- z:3 actual content -->
    {children}
  </div>
</div>
```

Plus `::before` (z:2, static noise grain) and `::after` (z:4, cursor-tracking glow) on the parent.

### Base container

```css
.liquid-glass {
  position: relative;
  overflow: hidden;
  border-radius: 22px; /* iOS squircle proportion */
  isolation: isolate;
  /* Performance: skip off-screen glass entirely */
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
  contain: layout paint;
  /* Outer shadow only — rim highlights live on .liquid-glass-shine */
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.06),
    0 8px 24px -8px rgba(0, 0, 0, 0.4),
    0 2px 6px -2px rgba(0, 0, 0, 0.3);
}
```

### Layer 0: Refraction (backdrop-filter)

**Inner cards (bulk, 10+ per page):**
```css
.liquid-glass-effect {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  backdrop-filter: blur(20px) saturate(170%) brightness(1.04) contrast(1.05);
  -webkit-backdrop-filter: blur(20px) saturate(170%) brightness(1.04) contrast(1.05);
}
```

**Macro wrappers (3-5 per page, get real refraction):**
```css
.lg-macro > .liquid-glass-effect {
  backdrop-filter: blur(28px) saturate(180%) brightness(1.06) contrast(1.06) url(#lg-refract);
  -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.06) contrast(1.06);
}
```

**Light mode:** drop saturation by ~40% (white backgrounds don't need as much compensation):
```css
html:not(.dark) .liquid-glass-effect {
  backdrop-filter: blur(20px) saturate(135%) brightness(1.02);
}
```

**Blur values measured from Apple.com:** max blur is 28px. Anything past 30px is wasted (Safari downsamples at 25px, Chrome cost scales linearly). Saturation 170-180% compensates for blur's desaturation.

### Layer 1: Tint (the base color)

```css
.liquid-glass-tint {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
  background: rgba(28, 28, 32, 0.72);
}
.lg-macro > .liquid-glass-tint {
  background: rgba(20, 20, 24, 0.66);
}
html:not(.dark) .liquid-glass-tint {
  background: rgba(255, 255, 255, 0.78);
}
```

**No blend mode.** Just a solid tint with opacity.

### Layer 2: Shine (inset rim highlights — the "lit bezel")

This is Apple's signature lit edge. 4 inset box-shadows that track the border-radius:

```css
.liquid-glass-shine {
  position: absolute;
  z-index: 2;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),    /* 1px ring inside border */
    inset 0 0 6px 0 rgba(255, 255, 255, 0.04),    /* 6px feathered inner glow */
    inset 0 2px 4px -2px rgba(255, 255, 255, 0.18), /* top specular highlight */
    inset 0 -2px 4px -2px rgba(0, 0, 0, 0.25);    /* bottom depth shadow */
}
html:not(.dark) .liquid-glass-shine {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.6),
    inset 0 0 6px 0 rgba(255, 255, 255, 0.3),
    inset 0 2px 4px -2px rgba(255, 255, 255, 0.9),
    inset 0 -2px 4px -2px rgba(0, 0, 0, 0.06);
}
```

**The 1:2 ratio matters.** Top highlight 0.18 vs bottom shadow 0.25 = glass reads as convex (not flat). Invert the ratio to read as concave. Equal = flat.

### Grain overlay (::before)

Inline SVG data URL, ~400 bytes gzipped. Static (do NOT animate):

```css
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.035;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}
html:not(.dark) .liquid-glass::before {
  opacity: 0.05;
  mix-blend-mode: multiply;
}
```

`baseFrequency='0.9'` = fine ~1px grain that reads as real frosted glass. Higher values look like noise artifacts.

## Physics-Based SVG Refraction

For real light bending (not just blur), generate a displacement map from the convex squircle surface.

### Surface function

Apple uses the squircle profile: `y = ⁴√(1−(1−x)⁴)` where `x ∈ [0,1]` is distance from border and `y` is glass thickness. Softer flat→curve transition than a circle, no harsh edges when stretched to rectangles.

### Build the displacement map (Node + sharp)

```js
// scripts/generate-displacement-map.mjs
import sharp from 'sharp'

const SIZE = 512
const RADIUS = 48   // corner radius in map pixels
const BEZEL = 48    // bezel zone width
const CHANNEL_DEPTH = 127

const f = (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25)
const fPrime = (x) => {
  const delta = 0.001
  const x1 = Math.max(0, x - delta)
  const x2 = Math.min(1, x + delta)
  return (f(x2) - f(x1)) / (x2 - x1)
}

function sdfRoundedRect(px, py, w, h, r) {
  const qx = Math.abs(px - w / 2) - w / 2 + r
  const qy = Math.abs(py - h / 2) - h / 2 + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdfGradient(px, py, w, h, r) {
  const e = 0.75
  const dx = sdfRoundedRect(px + e, py, w, h, r) - sdfRoundedRect(px - e, py, w, h, r)
  const dy = sdfRoundedRect(px, py + e, w, h, r) - sdfRoundedRect(px, py - e, w, h, r)
  const mag = Math.hypot(dx, dy) || 1
  return { x: dx / mag, y: dy / mag }
}

// Precomputed LUT of displacement magnitudes along one radius (symmetric around the bezel)
const SAMPLES = 127
const dispLUT = new Float32Array(SAMPLES + 1)
let maxDisp = 0
for (let i = 0; i <= SAMPLES; i++) {
  const slope = fPrime(i / SAMPLES)
  const d = slope / (1 + slope * slope)
  dispLUT[i] = d
  if (d > maxDisp) maxDisp = d
}
for (let i = 0; i <= SAMPLES; i++) dispLUT[i] /= maxDisp

// Render: for each pixel in the bezel zone, compute displacement vector
const buf = Buffer.alloc(SIZE * SIZE * 4)
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const dist = -sdfRoundedRect(px + 0.5, py + 0.5, SIZE, SIZE, RADIUS)
    const idx = (py * SIZE + px) * 4
    let r = 128, g = 128
    if (dist > 0 && dist < BEZEL) {
      const t = dist / BEZEL
      const mag = dispLUT[Math.min(SAMPLES, Math.floor(t * SAMPLES))]
      const n = sdfGradient(px + 0.5, py + 0.5, SIZE, SIZE, RADIUS)
      // Convex glass pulls light INWARD → negate the outward normal
      r = Math.max(0, Math.min(255, Math.round(128 - n.x * mag * CHANNEL_DEPTH)))
      g = Math.max(0, Math.min(255, Math.round(128 - n.y * mag * CHANNEL_DEPTH)))
    }
    buf[idx] = r
    buf[idx + 1] = g
    buf[idx + 2] = 128
    buf[idx + 3] = 255
  }
}

await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile('public/static/images/lg-displacement.png')
```

### SVG filter (inline in `_document.js` or similar)

**Critical:** embed the displacement PNG as a base64 data URL inside the SVG. `feImage` sometimes fails to load from `display:none` SVGs:

```jsx
import fs from 'fs'
import path from 'path'

let DISP_MAP_DATA_URL = ''
try {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public/static/images/lg-displacement.png'))
  DISP_MAP_DATA_URL = `data:image/png;base64,${buf.toString('base64')}`
} catch {}

// In the rendered page body:
<svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
  <filter id="lg-refract"
    x="0%" y="0%" width="100%" height="100%"
    filterUnits="objectBoundingBox"
    primitiveUnits="objectBoundingBox"
    colorInterpolationFilters="sRGB">
    <feImage href={DISP_MAP_DATA_URL} xlinkHref={DISP_MAP_DATA_URL}
      x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="dispMap" />
    <feDisplacementMap in="SourceGraphic" in2="dispMap"
      scale="0.06" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

**Chain with backdrop-filter:** `backdrop-filter: blur(28px) saturate(180%) url(#lg-refract)`

**Chrome-only.** Safari/Firefox ignore `url()` in backdrop-filter → just shows blur. Graceful fallback, not parity.

## Performance Gates (Critical for 20+ Glass Elements)

The portfolio ships with 20+ concurrent glass surfaces at 120fps by following these rules strictly.

### 1. Restrict SVG displacement to ~5 elements max

```css
/* ❌ DON'T: displacement on every card (20+ filter passes) */
.liquid-glass-effect { backdrop-filter: blur(20px) url(#lg-refract); }

/* ✅ DO: only macro wrappers get displacement */
.lg-macro > .liquid-glass-effect { backdrop-filter: blur(28px) url(#lg-refract); }
```

### 2. Cap blur radius

Safari downsamples at 25px. Chrome cost is linear. Never exceed 28-30px. 50px+ is wasteful on both engines.

### 3. content-visibility on all glass

```css
.liquid-glass {
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
  contain: layout paint;
}
/* Touch devices skip this (timing bugs on some mobile browsers) */
@media (hover: none), (pointer: coarse) {
  .liquid-glass { content-visibility: visible; contain: none; }
}
```

Chrome skips rendering off-screen glass entirely. 80%+ savings with 20+ cards per page.

### 4. isolation: isolate

```css
.liquid-glass { isolation: isolate; }
```

Creates stacking context, reduces backdrop-filter sample region by 30-40%.

### 5. Touch-device gates

Disable expensive effects on hover:none devices (mobile, trackpads with touch):

```css
@media (hover: none), (pointer: coarse) {
  /* Kill sitewide cursor spotlight */
  .lg-spotlight { display: none; }
  /* No scroll reveal animations */
  .liquid-glass[data-reveal],
  .liquid-glass[data-reveal="in"] {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
    transition: none !important;
  }
  /* No per-glass hover cursor glow */
  .liquid-glass::after { display: none !important; }
  /* No hover transforms */
  .lg-nav-btn:hover, .lg-action-btn:hover { transform: none !important; }
}
```

### 6. Throttle animated backgrounds

If you have a particle canvas / video / animated gradient behind the glass, every frame the canvas updates invalidates EVERY glass element's backdrop-filter. Throttle to 30fps to halve the cost:

```js
let skipFrame = false
const drawThrottled = () => {
  if (!running) return
  if (!skipFrame) draw()
  skipFrame = !skipFrame
  rafRef.current = requestAnimationFrame(drawThrottled)
}
// Double the velocity to compensate for 30fps rendering (looks identical)
```

### 7. Cursor tracker: closest-only, not all-ancestors

When tracking cursor position for glow effects, update only the closest matching element, not every ancestor:

```js
const handler = (e) => {
  const closest = e.target.closest('.liquid-glass, .lg-nav-btn')
  if (closest) {
    const rect = closest.getBoundingClientRect()
    closest.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    closest.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }
}
```

## Apple Motion Curves (CSS variables)

```css
:root {
  --ease-apple-out: cubic-bezier(0.32, 0.72, 0, 1);       /* standard exit */
  --ease-apple-morph: cubic-bezier(0.4, 0, 0.2, 1);       /* Dynamic Island */
  --ease-apple-liquid: cubic-bezier(0.3, 0, 0, 1.3);      /* overshoot settle */
  --ease-apple-magnetic: cubic-bezier(0.34, 1.56, 0.64, 1); /* spring snap */
}
```

Use `--ease-apple-out` for most transitions. `--ease-apple-magnetic` for bouncy hover states. `--ease-apple-liquid` for reveal animations.

## Control Dock UX Pattern (user-facing UI toggles)

Nobody else ships this but it's a huge win: let users turn off the glass.

Bottom-left stack of pill buttons, desktop only:
- Particle/background toggle
- Glass toggle (strips all `.liquid-glass` containers via `html.glass-off` class)
- Theme toggle (replaces navbar ThemeSwitch on desktop)

First-visit tooltip ("adjust UI to your preference here") with arrow, localStorage-gated.

```css
html.glass-off .liquid-glass {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
  overflow: visible !important;
  isolation: auto !important;
  contain: none !important;
}
html.glass-off .liquid-glass-effect,
html.glass-off .liquid-glass-tint,
html.glass-off .liquid-glass-shine,
html.glass-off .liquid-glass::before,
html.glass-off .liquid-glass::after {
  display: none !important;
}
```

## Common Pitfalls

1. **Transparent overlay tint** — glass must have visible base color on pure black
2. **blur > 30px** — wasted, Safari caps
3. **SVG url() on every element** — 20+ `feDisplacementMap` passes kills GPU
4. **Animated backgrounds at 60fps** — invalidates every backdrop-filter each frame
5. **Nested isolation** without content-visibility — paint scope explodes
6. **Box-shadow pulse animations** — expensive, use opacity pulse on pseudo-element instead
7. **display:none SVG** with feImage — image may not load; use `position:absolute; width:0; height:0; overflow:hidden`
8. **will-change: transform + transform override** — breaks GPU layer caching
9. **No touch-device gates** — glass refraction + cursor glow + particles on phones = 10fps
10. **Forgetting prefers-reduced-motion** — accessibility regression

## Quick Start Checklist

- [ ] Copy the 4-layer `.liquid-glass` CSS (container + effect + tint + shine + content)
- [ ] Add Apple motion curve CSS variables
- [ ] Add touch-device media query gates
- [ ] Add `content-visibility: auto` + `contain` for perf
- [ ] Optional: generate displacement map via `generate-displacement-map.mjs` pattern
- [ ] Optional: add the SVG filter inline with base64 data URL
- [ ] Optional: add control dock toggles + `html.glass-off` CSS
- [ ] Test with 20+ glass elements at 60fps
- [ ] Test on mobile — should gracefully degrade
- [ ] Test on pure-black background — tint should be visible
