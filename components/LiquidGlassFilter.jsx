/**
 * Inline SVG filter for physics-based glass refraction.
 * Mount once at the top of your page/document (below <Head> or
 * anywhere in <body>). The liquid-glass CSS references `#lg-refract`
 * via `backdrop-filter: url(#lg-refract)` on macro elements.
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
 */
export default function LiquidGlassFilter({ displacementMap }) {
  if (!displacementMap) return null
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
      <filter
        id="lg-refract"
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
        <feDisplacementMap
          in="SourceGraphic"
          in2="dispMap"
          scale="0.45"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
      {/* Same scale for inner cards (unified config across all surfaces) */}
      <filter
        id="lg-refract-sm"
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
        <feDisplacementMap
          in="SourceGraphic"
          in2="dispMap"
          scale="0.45"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  )
}
