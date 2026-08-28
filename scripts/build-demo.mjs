// Builds demo/index.html from demo/index.template.html by inlining the
// displacement map. feImage silently fails on external URLs from a zero-size
// SVG in some browsers, so the map has to be a data URL.
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const map = path.join(root, 'public/static/images/lg-displacement.png')
if (!fs.existsSync(map)) {
  console.error('missing displacement map — run: npm run generate-displacement-map')
  process.exit(1)
}
const dataUrl = 'data:image/png;base64,' + fs.readFileSync(map).toString('base64')
const tpl = fs.readFileSync(path.join(root, 'demo/index.template.html'), 'utf8')
const out = path.join(root, 'demo/index.html')
fs.writeFileSync(out, tpl.replaceAll('__MAP__', dataUrl))
console.log(`✓ demo/index.html  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)
