# liquid-glass

Production-grade Apple iOS 26 Liquid Glass design system. 4-layer material architecture with physics-based SVG refraction, performance gates for 20+ concurrent glass elements, and a user-facing control dock.

Built during a weekend session on [sohumsuthar.com](https://www.sohumsuthar.com). This repo extracts the reusable patterns for use in future projects.

## Quick start

```bash
# 1. Copy the CSS files into your project
cp css/*.css your-project/styles/

# 2. Import them (order matters)
@import 'liquid-glass-core.css';
@import 'liquid-glass-nav.css';
@import 'liquid-glass-effects.css';
@import 'liquid-glass-dock.css';
@import 'liquid-glass-utils.css';

# 3. Use the 4-layer HTML structure
```

```html
<div class="liquid-glass">
  <div class="liquid-glass-effect"></div>
  <div class="liquid-glass-tint"></div>
  <div class="liquid-glass-shine"></div>
  <div class="liquid-glass-content" style="padding: 24px;">
    Your content here
  </div>
</div>
```

Or with React:

```jsx
import { LiquidGlass } from './components'

<LiquidGlass macro>
  <h2>Hello</h2>
</LiquidGlass>
```

## Architecture

Every glass surface is 4 absolutely-positioned layers + 2 pseudo-elements:

| Layer | Class | z-index | Role |
|-------|-------|---------|------|
| Effect | `.liquid-glass-effect` | 0 | `backdrop-filter: blur + saturate + brightness + contrast` |
| Tint | `.liquid-glass-tint` | 1 | Solid base color (visible on pure black) |
| Shine | `.liquid-glass-shine` | 2 | 4 inset box-shadows = lit bezel |
| Content | `.liquid-glass-content` | 3 | Your content |
| Grain | `::before` | 2 | Static SVG noise, `soft-light` blend |
| Cursor | `::after` | 4 | Radial gradient at `--mx/--my` |

### Variants

- `.lg-macro` — bigger outer wrappers (3-5 per page). Stronger blur (28px) + SVG refraction via `url(#lg-refract)`.
- `.lg-mobile-flat` — strips the wrapper on small screens, keeps nested cards.

## Physics-based refraction

Generate the displacement map (requires `sharp`):

```bash
npm install
npm run generate-displacement-map
```

This renders a 512×512 PNG using the convex squircle surface function `y = ⁴√(1−(1−x)⁴)` — Apple's iOS 26 profile. 127-sample precomputed displacement LUT along one bezel radius, reflected via SDF gradient.

Mount the SVG filter in your document:

```jsx
import LiquidGlassFilter from './components/LiquidGlassFilter'

// Read the PNG at build/server time
const buf = fs.readFileSync('public/lg-displacement.png')
const DISP_MAP = `data:image/png;base64,${buf.toString('base64')}`

// In your layout:
<LiquidGlassFilter displacementMap={DISP_MAP} />
```

The macro CSS automatically chains `url(#lg-refract)` with `backdrop-filter`. **Chrome-only** — Safari/Firefox gracefully fall back to blur without refraction.

## React hooks

```jsx
import { useLiquidGlassEffects, Spotlight } from './hooks/useLiquidGlassEffects'

function App() {
  useLiquidGlassEffects({ routeKey: router.asPath })

  return (
    <>
      <Spotlight />
      <LiquidGlassFilter displacementMap={DISP_MAP} />
      <main>...</main>
    </>
  )
}
```

The hook mounts 4 global effects (all desktop-only, auto-disabled on touch):

| Effect | What it does |
|--------|-------------|
| **cursor** | Writes `--mx/--my` on the closest `.liquid-glass` on mousemove |
| **spotlight** | Writes `--cx/--cy` on `:root` for the sitewide glow layer |
| **reveal** | `IntersectionObserver` adds `data-reveal="in"` for entrance animation |
| **scroll** | Tracks scroll velocity → `--sv/--svmag` on `<html>` for macro squash |

## Performance

The system ships 20+ glass elements at 120fps by:

1. **`content-visibility: auto`** — off-screen glass skips rendering entirely
2. **`contain: layout paint`** — isolates repaint scope per card
3. **`isolation: isolate`** — 30-40% backdrop-filter cost reduction
4. **SVG displacement only on macros** (3-5 per page, not every card)
5. **Blur capped at 28px** (Safari downsamples past 25px)
6. **Touch gates** — `(hover: none)` disables spotlight, cursor glow, scroll reveal, velocity squash
7. **Particle canvas at 30fps** — halves backdrop-filter recomputation cost

## Control dock

Optional user-facing toggles (desktop only):

- **`ParticleBackground`** — canvas particle network at `bottom: 14px`
- **`GlassToggle`** — strips all `.liquid-glass` containers via `html.glass-off` at `bottom: 46px`
- **`FirstVisitTooltip`** — one-time "adjust UI here" hint with localStorage gate

## Key values (measured from Apple.com)

| Property | Inner cards | Macros |
|----------|------------|--------|
| Blur | 20px | 28px |
| Saturate | 170% | 180% |
| Brightness | 1.04 | 1.06 |
| Contrast | 1.05 | 1.06 |
| SVG displacement | ❌ | ✅ scale 0.06 |
| Dark tint | `rgba(28,28,32,0.72)` | `rgba(20,20,24,0.66)` |
| Light tint | `rgba(255,255,255,0.78)` | `rgba(255,255,255,0.70)` |
| Border-radius | 22px | 22px |

## Files

```
css/
  liquid-glass-core.css    # 4-layer glass + glass-off + touch gates
  liquid-glass-nav.css     # Navbar, buttons, links, tags, search
  liquid-glass-effects.css # Cursor spotlight, scroll reveal, squash
  liquid-glass-dock.css    # Particle toggle, glass toggle, tooltip
  liquid-glass-utils.css   # Monospace, cursor blink, typography

components/
  LiquidGlass.jsx          # <LiquidGlass macro> wrapper component
  LiquidGlassFilter.jsx    # Inline SVG filter (displacement map)
  ParticleBackground.jsx   # Canvas particle network
  GlassToggle.jsx          # Toggle strips glass containers
  FirstVisitTooltip.jsx    # One-time dock hint
  KeyboardHelpOverlay.jsx  # Press ? for man-page shortcuts
  index.js                 # Re-exports

hooks/
  useLiquidGlassEffects.js # 4-in-1 hook: cursor, spotlight, reveal, scroll

scripts/
  generate-displacement-map.mjs  # Physics-based refraction PNG
```

## License

Private — Sohum Suthar. Not for redistribution.
