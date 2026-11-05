import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import pngToIco from 'png-to-ico'

await mkdir('build/licenses', { recursive: true })
const image = new PNG({ width: 256, height: 256 })
for (let vertical = 0; vertical < 256; vertical++) {
  for (let horizontal = 0; horizontal < 256; horizontal++) {
    const cx = (horizontal - 128) / 100
    const cy = (vertical - 128) / 100
    const radius = Math.hypot(cx, cy)
    const ring = Math.exp(-(((radius - 0.65) / 0.04) ** 2))
    const disk = Math.exp(-((cy / 0.045) ** 2)) * Math.exp(-((cx / 1.15) ** 4))
    const glow = Math.exp(-(((radius - 0.65) / 0.17) ** 2)) * 0.14
    const light = Math.min(1, ring * 0.92 + disk + glow)
    const offset = (vertical * 256 + horizontal) * 4
    image.data.set([6 + light * 205, 10 + light * 222, 18 + light * 236, 255], offset)
  }
}
await writeFile('build/icon.png', PNG.sync.write(image))
await writeFile('build/icon.ico', await pngToIco('build/icon.png'))
await readFile('node_modules/three/LICENSE', 'utf8')
await copyFile('node_modules/three/LICENSE', 'build/licenses/three.txt')
console.log('Prepared Black Hole Wallpaper icon and license files.')
