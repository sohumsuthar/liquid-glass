// Generates a physics-based displacement map PNG for Liquid Glass refraction.
// Convex squircle surface (y = ⁴√(1-(1-x)⁴))
// with bezel-zone displacement only.
//
// Output: public/static/images/lg-displacement.png
//
// Run: node scripts/generate-displacement-map.mjs
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ── Configuration ──────────────────────────────────────────────────────────
const SIZE = 512
const RADIUS = 48 // rounded-rect corner radius (in map pixels)
const BEZEL = 48 // bezel zone width (in map pixels)
const CHANNEL_DEPTH = 127 // max pixel offset per channel (8-bit signed)

// ── Surface functions (height at normalized distance from edge, 0→1) ──────
// Apple's Liquid Glass uses a convex squircle — softer flat→curve transition
const surfaces = {
  squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25),
  circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
}
const SURFACE = 'squircle'
const f = surfaces[SURFACE]

// Numerical derivative f'(x)
const delta = 0.001
function fPrime(x) {
  const x1 = Math.max(0, x - delta)
  const x2 = Math.min(1, x + delta)
  return (f(x2) - f(x1)) / (x2 - x1)
}

// ── Signed Distance Field for rounded rectangle ────────────────────────────
// Returns negative inside, positive outside, zero on edge
function sdfRoundedRect(px, py, w, h, r) {
  const cx = w / 2
  const cy = h / 2
  const qx = Math.abs(px - cx) - cx + r
  const qy = Math.abs(py - cy) - cy + r
  const outsideDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const insideDist = Math.min(Math.max(qx, qy), 0)
  return outsideDist + insideDist - r
}

// Gradient of SDF = outward-pointing unit normal
function sdfGradient(px, py, w, h, r) {
  const e = 0.75
  const dx = sdfRoundedRect(px + e, py, w, h, r) - sdfRoundedRect(px - e, py, w, h, r)
  const dy = sdfRoundedRect(px, py + e, w, h, r) - sdfRoundedRect(px, py - e, w, h, r)
  const mag = Math.hypot(dx, dy) || 1
  return { x: dx / mag, y: dy / mag }
}

// ── Precompute displacement magnitudes along one radius (bezel slice) ──────
// Uses a simplified refraction model: displacement ∝ slope × thickness factor.
// For glass with index 1.5: physical shift = thickness × (1 − cos(θᵢ)/cos(θₜ))
// We approximate with: disp = slope / (1 + slope²) (monotonic, well-behaved)
const SAMPLES = 127
const dispLUT = new Float32Array(SAMPLES + 1)
let maxDisp = 0
for (let i = 0; i <= SAMPLES; i++) {
  const x = i / SAMPLES
  const slope = fPrime(x)
  const d = slope / (1 + slope * slope)
  dispLUT[i] = d
  if (d > maxDisp) maxDisp = d
}
// Normalize so peak = 1
for (let i = 0; i <= SAMPLES; i++) dispLUT[i] /= maxDisp

function sampleDispLUT(t) {
  const idx = Math.min(SAMPLES, Math.max(0, Math.floor(t * SAMPLES)))
  return dispLUT[idx]
}

// ── Render the displacement map ────────────────────────────────────────────
async function generate() {
  const W = SIZE
  const H = SIZE
  const buffer = Buffer.alloc(W * H * 4)

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Distance INSIDE the shape (positive when inside, 0 at edge)
      const sdf = sdfRoundedRect(px + 0.5, py + 0.5, W, H, RADIUS)
      const dist = -sdf // positive inside

      const idx = (py * W + px) * 4
      let r = 128
      let g = 128

      if (dist > 0 && dist < BEZEL) {
        // In the bezel zone — compute displacement vector
        const t = dist / BEZEL // 0 at edge, 1 at inner bezel boundary
        const mag = sampleDispLUT(t)

        // SDF gradient points OUTWARD (from surface); for convex glass the
        // displacement pulls light INWARD (toward center), so negate.
        const n = sdfGradient(px + 0.5, py + 0.5, W, H, RADIUS)
        // Refracted ray displacement = −normal × magnitude
        const dx = -n.x * mag
        const dy = -n.y * mag

        r = Math.round(128 + dx * CHANNEL_DEPTH)
        g = Math.round(128 + dy * CHANNEL_DEPTH)
        r = Math.max(0, Math.min(255, r))
        g = Math.max(0, Math.min(255, g))
      }
      // else: interior or exterior — neutral (128, 128) = no displacement

      buffer[idx] = r
      buffer[idx + 1] = g
      buffer[idx + 2] = 128 // blue ignored
      buffer[idx + 3] = 255 // opaque
    }
  }

  const out = path.join(root, 'public/static/images/lg-displacement.png')
  await sharp(buffer, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out)

  // Also emit the maximum physical displacement for the SVG filter scale
  console.log(`✓ ${out}`)
  console.log(`  size: ${W}×${H}  radius: ${RADIUS}  bezel: ${BEZEL}`)
  console.log(`  surface: ${SURFACE}  samples: ${SAMPLES}`)
  console.log(`  → SVG feDisplacementMap scale should be ~${BEZEL} for 1:1 pixels`)
}

generate().catch((e) => {
  console.error(e)
  process.exit(1)
})
