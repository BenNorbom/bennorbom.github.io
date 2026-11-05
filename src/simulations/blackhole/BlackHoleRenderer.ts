import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import fragmentShader from './blackHole.frag.glsl?raw'
import { SPIN, iscoRadius, GRAVITATIONAL_RADIUS_KM, TIME_COMPRESSION } from './physics'
import { flightAt, type FlightPose } from './flight'

function createProceduralTextures() {
  let seed = 74629
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const noise = new Uint8Array(256 * 256 * 4)
  for (let index = 0; index < noise.length; index += 4) {
    const value = random() * 255
    noise.set([value, value, value, 255], index)
  }
  const grain = new THREE.DataTexture(noise.slice(0, 256 * 45 * 4), 256, 45)
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  grain.magFilter = THREE.LinearFilter
  grain.minFilter = THREE.LinearMipmapLinearFilter
  grain.generateMipmaps = true
  grain.needsUpdate = true

  const width = 2048
  const height = 1024
  const stars = new Uint8Array(width * height * 4)
  for (let index = 0; index < stars.length; index += 4) stars[index + 3] = 255
  for (let index = 0; index < 9500; index++) {
    const longitude = Math.floor(random() * width)
    const latitude = Math.floor((Math.acos(1 - random() * 2) / Math.PI) * height)
    const intensity = 45 + random() ** 3 * 210
    const tint = random()
    const offset = (latitude * width + longitude) * 4
    stars[offset] = intensity * (tint < 0.3 ? 0.65 : 1)
    stars[offset + 1] = intensity * (tint > 0.8 ? 0.68 : 0.94)
    stars[offset + 2] = intensity * (tint > 0.8 ? 0.5 : 1)
  }
  const sky = new THREE.DataTexture(stars, width, height)
  sky.wrapS = THREE.RepeatWrapping
  sky.magFilter = THREE.LinearFilter
  sky.minFilter = THREE.LinearMipmapLinearFilter
  sky.generateMipmaps = true
  sky.needsUpdate = true
  return { grain, sky }
}

export class BlackHoleRenderer {
  readonly gpu: THREE.WebGLRenderer
  readonly material: THREE.ShaderMaterial
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.Camera()
  readonly assets = createProceduralTextures()
  scale = 0.52
  width = 0
  height = 0
  frames = 0
  private zoom = 1
  private lookYaw = 0
  private lookPitch = 0
  private geometry = new THREE.PlaneGeometry(2, 2)

  constructor(canvas: HTMLCanvasElement) {
    this.gpu = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.gpu.toneMapping = THREE.ACESFilmicToneMapping
    this.gpu.toneMappingExposure = 0.85
    this.material = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      uniforms: {
        resolution: { value: new THREE.Vector2() },
        observer: { value: new THREE.Vector3() },
        spin: { value: SPIN },
        innerRadius: { value: iscoRadius(SPIN) },
        elapsed: { value: 0 },
        fieldOfView: { value: (48 * Math.PI) / 180 },
        cameraRoll: { value: 0 },
        lookYaw: { value: 0 },
        lookPitch: { value: 0 },
        grainTexture: { value: this.assets.grain },
        skyTexture: { value: this.assets.sky },
        exposure: { value: 1 },
        stepScale: { value: 0.14 },
        maxSteps: { value: 360 },
        debugMode: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.scene.add(new THREE.Mesh(this.geometry, this.material))
    this.composer = new EffectComposer(this.gpu)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(320, 200), 0.12, 0.35, 1.35)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.resize()
  }

  setLook(yaw: number, pitch: number, zoom: number) {
    this.lookYaw = yaw
    this.lookPitch = pitch
    this.zoom = zoom
  }

  setExposure(exposure: number) {
    this.material.uniforms.exposure.value = exposure
  }

  resize() {
    const viewportWidth = this.gpu.domElement.clientWidth || window.innerWidth
    const viewportHeight = this.gpu.domElement.clientHeight || window.innerHeight
    const cap = Math.min(1, 1920 / viewportWidth, 1200 / viewportHeight)
    const effectiveScale = Math.min(1, this.scale * Math.max(1, 1000 / Math.max(1, viewportWidth)))
    this.width = Math.max(1, Math.round(viewportWidth * effectiveScale * cap))
    this.height = Math.max(1, Math.round(viewportHeight * effectiveScale * cap))
    this.gpu.setSize(this.width, this.height, false)
    this.composer.setSize(this.width, this.height)
    this.material.uniforms.resolution.value.set(this.width, this.height)
  }

  render(orbitSeconds: number, materialSeconds = orbitSeconds): FlightPose {
    const flight = flightAt(orbitSeconds)
    this.material.uniforms.observer.value.set(flight.radius, flight.theta, flight.phi)
    this.material.uniforms.elapsed.value = (materialSeconds * TIME_COMPRESSION) / (GRAVITATIONAL_RADIUS_KM / 299792.458)
    this.material.uniforms.cameraRoll.value = flight.roll
    this.material.uniforms.lookYaw.value = flight.lookYaw + this.lookYaw
    this.material.uniforms.lookPitch.value = flight.lookPitch + this.lookPitch
    this.bloom.strength = flight.bloom
    const aspect = Math.max(0.2, this.width / this.height)
    this.material.uniforms.fieldOfView.value =
      2 * Math.atan(Math.tan((flight.fov * this.zoom * Math.PI) / 360) * Math.max(1, 1.25 / aspect))
    this.composer.render()
    this.frames++
    return flight
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
    this.assets.grain.dispose()
    this.assets.sky.dispose()
    for (const pass of this.composer.passes) pass.dispose?.()
    this.composer.dispose()
    this.gpu.dispose()
  }
}
