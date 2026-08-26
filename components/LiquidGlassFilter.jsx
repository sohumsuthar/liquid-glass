/**
 * Inline SVG filters for physics-based glass refraction.
 * Mount once at the top of your page/document (below <Head> or
 * anywhere in <body>). The liquid-glass CSS references `#lg-refract`
 * (macros) and `#lg-refract-sm` (inner cards) via
 * `backdrop-filter: url(#lg-refract)`.
 *
 * IMPORTANT: the displacement map MUST be loaded via base64 data URL.
 * `feImage` silently fails to load PNGs from a display:none SVG in
 * some browsers. Read the PNG at build time / server-render time:
 *
 *   import fs from 'fs'
 *   import path from 'path'
 *   const buf = fs.readFileSync(
 *     path.join(process.cwd(), 'public/lg-displacement.png')
 *   )
 *   const DISP_MAP = `data:image/png;base64,${buf.toString('base64')}`
 *
 * Then pass to this component:
 *   <LiquidGlassFilter displacementMap={DISP_MAP} />
 *
 * Run `node scripts/generate-displacement-map.mjs` to create the PNG.
 *
 * Scale calibration (objectBoundingBox units): the map's bezel is
 * 48/512 = 9.4% of the element, and the ray-traced peak displacement is
 * 0.524 × bezel (see lib/glass-optics.mjs) ≈ 4.9% of the element size.
 * feDisplacementMap offsets by scale × (channel/255 − 0.5), so the
 * physically-exact scale is 2.008 × 0.049 ≈ 0.10.
 *
 * Chromatic dispersion: blue refracts more than red in crown glass
 * (n_F 1.5224 > n_C 1.5143). Each channel is displaced at its own
 * Snell scale, isolated with feColorMatrix, and screen-blended back
 * together (channels are disjoint, so screen == add). `dispersion`
 * exaggerates the physical 1% spread for visibility at UI scale.
 */
import { dispersionScales } from '../lib/glass-optics.mjs'

const PHYSICAL_SCALE = 0.1

function ChromaticDisplacement({ map, scale, dispersion }) {
  if (!dispersion) {
    return (
      <feDisplacementMap
        in="SourceGraphic"
        in2={map}
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    )
  }
  const ca = dispersionScales(dispersion)
  return (
    <>
      <feDisplacementMap in="SourceGraphic" in2={map} scale={scale * ca.red} xChannelSelector="R" yChannelSelector="G" result="dispR" />
      <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
      <feDisplacementMap in="SourceGraphic" in2={map} scale={scale} xChannelSelector="R" yChannelSelector="G" result="dispG" />
      <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
      <feDisplacementMap in="SourceGraphic" in2={map} scale={scale * ca.blue} xChannelSelector="R" yChannelSelector="G" result="dispB" />
      <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
      <feBlend in="chR" in2="chG" mode="screen" result="lgRG" />
      <feBlend in="lgRG" in2="chB" mode="screen" />
    </>
  )
}

/**
 * Props:
 *   displacementMap  base64 data URL of the generated PNG (required)
 *   scale            objectBoundingBox displacement scale
 *                    (default 0.1 = physically exact; was 0.45 pre-2.0)
 *   smScale          scale for the inner-card filter (default = scale)
 *   dispersion       chromatic-aberration strength; 0 = off (default),
 *                    1 = physically exact BK7, ~8 = visible fringe.
 *                    OFF by default for a reason: the CA graph runs THREE
 *                    feDisplacementMap passes over the backdrop, and with
 *                    many concurrent glass elements it can stall Chrome's
 *                    compositor (measured: 5 CA elements froze capture,
 *                    1 was fine). Enable it only on pages with 1-3 glass
 *                    surfaces, or use the per-element lens for heroes.
 */
export default function LiquidGlassFilter({
  displacementMap,
  scale = PHYSICAL_SCALE,
  smScale,
  dispersion = 0,
}) {
  if (!displacementMap) return null
  const filters = [
    { id: 'lg-refract', s: scale },
    { id: 'lg-refract-sm', s: smScale ?? scale },
  ]
  return (
    <svg
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {filters.map(({ id, s }) => (
        <filter
          key={id}
          id={id}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={displacementMap}
            xlinkHref={displacementMap}
            x="0"
            y="0"
            width="1"
            height="1"
            preserveAspectRatio="none"
            result="dispMap"
          />
          <ChromaticDisplacement map="dispMap" scale={s} dispersion={dispersion} />
        </filter>
      ))}
    </svg>
  )
}
