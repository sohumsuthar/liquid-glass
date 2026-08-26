// Generates a physics-based displacement map PNG for Liquid Glass refraction.
//
// The map encodes the lateral shift of a vertical viewing ray traced through
// a glass slab with a convex squircle bezel (see glass-optics.mjs for the
// full model: Snell refraction at the curved top surface, propagation
// through the slab thickness, Fresnel-transmittance fade at the grazing rim).
//
// Output: public/static/images/lg-displacement.png
//
// Run: node scripts/generate-displacement-map.mjs
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDisplacementLUT, renderDisplacementMap } from '../lib/glass-optics.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ── Configuration ──────────────────────────────────────────────────────────
const SIZE = 512
const RADIUS = 48 // rounded-rect corner radius (in map pixels)
const BEZEL = 48 // bezel zone width (in map pixels)
const CHANNEL_DEPTH = 127 // max pixel offset per channel (8-bit signed)

async function generate() {
  const { lut, peak } = buildDisplacementLUT(255)
  const buffer = Buffer.alloc(SIZE * SIZE * 4)
  renderDisplacementMap(buffer, {
    width: SIZE,
    height: SIZE,
    radius: RADIUS,
    bezel: BEZEL,
    lut,
    channelDepth: CHANNEL_DEPTH,
  })

  const out = path.join(root, 'public/static/images/lg-displacement.png')
  await sharp(buffer, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out)

  console.log(`✓ ${out}`)
  console.log(`  size: ${SIZE}×${SIZE}  radius: ${RADIUS}  bezel: ${BEZEL}`)
  console.log(`  physical peak displacement: ${(peak * BEZEL).toFixed(1)} map px (${peak.toFixed(3)} × bezel)`)
  console.log(`  → for 1:1 pixels use feDisplacementMap scale ≈ ${(2 * (peak * BEZEL) * (255 / 254)).toFixed(0)} in userSpaceOnUse`)
}

generate().catch((e) => {
  console.error(e)
  process.exit(1)
})
