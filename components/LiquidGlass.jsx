/**
 * LiquidGlass — the 4-layer container.
 *
 *   <LiquidGlass macro>
 *     <h2>Hello</h2>
 *     <p>World</p>
 *   </LiquidGlass>
 *
 * `macro=true` → stronger blur + SVG displacement refraction.
 * `mobileFlat=true` → strips the wrapper on mobile (useful for
 * section-level macros so only their nested cards show on phones).
 * `className` / `style` pass through to the outer container.
 * `contentClassName` / `contentStyle` apply to the inner content layer.
 */
export default function LiquidGlass({
  macro = false,
  mobileFlat = false,
  className = '',
  style,
  contentClassName = '',
  contentStyle,
  children,
  ...rest
}) {
  const classes = ['liquid-glass']
  if (macro) classes.push('lg-macro')
  if (mobileFlat) classes.push('lg-mobile-flat')
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')} style={style} {...rest}>
      <div className="liquid-glass-effect" />
      <div className="liquid-glass-tint" />
      <div className="liquid-glass-shine" />
      <div className={`liquid-glass-content ${contentClassName}`} style={contentStyle}>
        {children}
      </div>
    </div>
  )
}
