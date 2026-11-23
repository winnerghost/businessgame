// Renderer, HDRI sky with time-of-day blending, image-based lighting, weather and post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { clamp, lerp, smoothstep, RNG } from '../core/utils.js';
import { setMaxAnisotropy } from './textures.js';
import { assets, SKIES } from './assets.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, shadows: false, shadowSize: 1024, bloom: false, ao: false, msaa: 0, cars: 26, peds: 70, shadowRange: 70 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: true, shadowSize: 2048, bloom: true, ao: false, msaa: 0, cars: 42, peds: 130, shadowRange: 95 },
  high: { label: 'High', pixelRatio: 1.25, shadows: true, shadowSize: 4096, bloom: true, ao: true, msaa: 4, cars: 58, peds: 190, shadowRange: 120 },
  ultra: { label: 'Ultra', pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, ao: true, msaa: 4, cars: 74, peds: 250, shadowRange: 160 },
};

// Per-sky brightness so each HDRI sits correctly against the sun/hemisphere lights.
const SKY_GAIN = { day: 1.0, sunset: 1.35, overcast: 0.85, night: 0.22 };
const ENV_GAIN = { day: 0.55, sunset: 0.6, overcast: 0.7, night: 0.35 };

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`;
const envVert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
function skyFrag(hdr) {
  return `
  uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3;
  uniform vec4 w; uniform vec4 rot; uniform vec4 gain; uniform vec3 fogColor; uniform float haze; uniform float flash;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  vec2 eq(vec3 d, float off){ float phi = atan(d.z, d.x) - off; return vec2(fract(phi/(2.0*PI) + 0.5), 1.0 - acos(clamp(d.y,-1.0,1.0))/PI); }
  vec3 smp(sampler2D t, vec3 d, float off){ vec3 c = texture2D(t, eq(d, off)).rgb; ${hdr ? 'return min(c, vec3(24.0));' : 'return pow(c, vec3(2.2));'} }
  void main(){
    vec3 d = normalize(vDir);
    d.y = max(d.y, ${hdr ? '-1.0' : '0.004'});
    vec3 c = vec3(0.0);
    if (w.x > 0.001) c += w.x * gain.x * smp(t0, d, rot.x);
    if (w.y > 0.001) c += w.y * gain.y * smp(t1, d, rot.y);
    if (w.z > 0.001) c += w.z * gain.z * smp(t2, d, rot.z);
    if (w.w > 0.001) c += w.w * gain.w * smp(t3, d, rot.w);
    ${hdr ? '' : 'float h = smoothstep(0.0, 0.22, normalize(vDir).y); c = mix(fogColor, c, mix(1.0, h, haze));'}
    c += flash * vec3(0.6, 0.65, 0.8);
    gl_FragColor = vec4(c, 1.0);
  }`;
}

// Subtle cinematic grade applied in display space: contrast, saturation, vignette, grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.05 }, saturation: { value: 1.08 }, vignette: { value: 0.32 }, warmth: { value: 0.0 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float vignette; uniform float warmth; uniform float time; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126,0.7152,0.0722)); col = mix(vec3(l), col, saturation);
      col += vec3(warmth, warmth*0.4, -warmth) * 0.06;
      vec2 q = vUv - 0.5; col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(q,q)*2.2);
      col += (rand(vUv*vec2(1920.0,1080.0) + time) - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(col,0.0,1.0), c.a); }`,
};

export class Graphics {
  constructor(container, qualityKey = 'high') {
    this.container = container;
    this.qualityKey = QUALITY[qualityKey] ? qualityKey : 'high';
    this.q = QUALITY[this.qualityKey];
    this.timeOfDay = 9;
    this.night = 0;
    this.weather = { rain: 0, cloud: 0.2, fog: 0 };
    this.wetness = 0;
    this.flash = 0;
    this.lightsOn = 0;
    this._envTimer = 0;
    this._envKey = '';
    this.nightMaterials = [];
    this.wetMaterials = [];
    this.nightBasic = [];
    this.nightOpacity = [];
    this.init();
  }

  init() {
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = this.q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0xa9b8c8, 0.0009);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 7000);
    this.camera = camera;

    this.sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
    this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const R = this.q.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 10, far: 1400 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6f0, 0x5b5142, 0.4);
    scene.add(this.hemi);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.buildSky();

    // Rain streaks around the camera
    const N = 9000;
    const pos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    const rr = new RNG(99);
    for (let i = 0; i < N; i++) {
      const x = rr.float(-60, 60), y = rr.float(0, 60), z = rr.float(-60, 60);
      pos.set([x, y, z, x + 0.04, y - 0.8, z + 0.02], i * 6);
      this.rainVel[i] = rr.float(24, 32);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8c4d2, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.buildHorizon();
    this.setupComposer();
    window.addEventListener('resize', () => this.resize());
  }

  buildSky() {
    const ok = assets.ok;
    const texs = SKIES.map((s) => {
      if (!ok) return null;
      const t = new THREE.Texture(assets.images[`sky_${s}`]);
      t.needsUpdate = true;
      t.wrapS = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    });
    const placeholder = new THREE.DataTexture(new Uint8Array([140, 170, 210, 255]), 1, 1);
    placeholder.needsUpdate = true;
    const info = assets.skyInfo || {};
    this.skyGain = new THREE.Vector4(...SKIES.map((s) => (info[s] ? 1 / info[s].k : 1) * SKY_GAIN[s] * 0.62));
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        t0: { value: texs[0] || placeholder }, t1: { value: texs[1] || placeholder }, t2: { value: texs[2] || placeholder }, t3: { value: texs[3] || placeholder },
        w: { value: new THREE.Vector4(1, 0, 0, 0) }, rot: { value: new THREE.Vector4() }, gain: { value: this.skyGain },
        fogColor: { value: new THREE.Color() }, haze: { value: 0.35 }, flash: { value: 0 },
      },
      vertexShader: skyVert, fragmentShader: skyFrag(false), side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), this.skyMat);
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // HDR copy for image-based lighting
    this.envScene = new THREE.Scene();
    const hdr = SKIES.map((s) => assets.sky[s]?.hdr || placeholder);
    this.envMat = new THREE.ShaderMaterial({
      uniforms: {
        t0: { value: hdr[0] }, t1: { value: hdr[1] }, t2: { value: hdr[2] }, t3: { value: hdr[3] },
        w: this.skyMat.uniforms.w, rot: this.skyMat.uniforms.rot, gain: { value: new THREE.Vector4(...SKIES.map((s) => ENV_GAIN[s])) },
        fogColor: { value: new THREE.Color() }, haze: { value: 0 }, flash: this.skyMat.uniforms.flash,
      },
      vertexShader: envVert, fragmentShader: skyFrag(true), side: THREE.BackSide, depthWrite: false,
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMat));
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = null;

    // horizon colours (linear) for fog matching
    this.horizon = SKIES.map((s) => {
      const img = assets.images[`sky_${s}`];
      if (!img) return new THREE.Color(0.6, 0.68, 0.78);
      const c = document.createElement('canvas');
      c.width = 64; c.height = 32;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 64, 32);
      const d = x.getImageData(0, 14, 64, 2).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    });
  }

  buildHorizon() {
    // Distant ridgelines on the landward sides (fBm profile), shaded with height & distance.
    const r = new RNG(42);
    const noise = (a, f, ph) => Math.sin(a * f + ph) * 0.5 + Math.sin(a * f * 2.13 + ph * 1.7) * 0.25 + Math.sin(a * f * 4.7 + ph * 0.3) * 0.125;
    const ph = [r.float(0, 9), r.float(0, 9), r.float(0, 9)];
    for (const [R, scale, tint] of [[3000, 1, [0.22, 0.27, 0.27]], [2400, 0.55, [0.2, 0.26, 0.2]]]) {
      const segs = 720, rows = 6;
      const verts = [], cols = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const southness = Math.max(0, Math.sin(a));
        const mask = 1 - smoothstep(0.15, 0.6, southness);
        const h = Math.max(0, (180 + 170 * noise(a, 3, ph[0]) + 90 * noise(a, 9, ph[1]) + 30 * noise(a, 27, ph[2])) * scale * mask);
        for (let j = 0; j <= rows; j++) {
          const t = j / rows;
          const rr = R + (1 - t) * 260 * scale;
          const y = -4 + h * Math.pow(t, 0.85);
          verts.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          const k = 0.75 + t * 0.35;
          cols.push(tint[0] * k, tint[1] * k, tint[2] * k);
        }
        if (i < segs) for (let j = 0; j < rows; j++) {
          const p0 = i * (rows + 1) + j, p1 = p0 + rows + 1;
          idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
    }
  }

  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = null;
    if (this.q.ao) {
      try {
        const g = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
        g.output = GTAOPass.OUTPUT.Default;
        g.blendIntensity = 0.9;
        g.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 2.5, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
        g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
        this.composer.addPass(g);
        this.gtao = g;
      } catch (e) { console.warn('GTAO unavailable', e); }
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.3, 0.6, 0.9);
    this.bloom.enabled = this.q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setQuality(key) {
    if (!QUALITY[key] || key === this.qualityKey) return;
    this.qualityKey = key;
    this.q = QUALITY[key];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const R = this.q.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
    this.composer.dispose?.();
    this.setupComposer();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  registerNightMaterial(mat, day, night) { this.nightMaterials.push({ mat, day, night }); }
  registerWetMaterial(mat) { this.wetMaterials.push({ mat, dry: mat.roughness, dryEnv: mat.envMapIntensity ?? 1 }); }
  registerNightBasic(mat, day, night) { this.nightBasic.push({ mat, day, night }); }
  registerNightOpacity(mat, max) { this.nightOpacity.push({ mat, max }); }

  update(dt, timeOfDay, weather, focus) {
    this.timeOfDay = timeOfDay;
    this.weather = weather;
    const t = timeOfDay;
    const dayFrac = (t - 6) / 13.5;
    const elev = Math.sin(clamp(dayFrac, -0.25, 1.25) * Math.PI) * 58;
    const azim = lerp(100, 260, clamp(dayFrac, 0, 1));
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
    const sunUp = smoothstep(-3, 10, elev);
    this.night = 1 - smoothstep(-7, 3, elev);
    const golden = smoothstep(22, 3, elev) * smoothstep(-6, 1, elev);
    const cloud = clamp(weather.cloud, 0, 1);
    const rain = clamp(weather.rain, 0, 1);

    // ---- sky blend weights: day / sunset / overcast / night
    const wNight = this.night;
    const wSunset = golden * (1 - wNight) * (1 - cloud * 0.7);
    const rest = Math.max(0, 1 - wNight - wSunset);
    const wOver = rest * smoothstep(0.35, 0.85, cloud);
    const wDay = rest - wOver;
    this.skyMat.uniforms.w.value.set(wDay, wSunset, wOver, wNight);
    // rotate each HDRI so its sun sits at our sun azimuth
    const info = assets.skyInfo || {};
    const worldPhi = Math.atan2(this.sunDir.z, this.sunDir.x);
    const rot = SKIES.map((s) => (info[s] ? worldPhi - (info[s].sunU - 0.5) * Math.PI * 2 : 0));
    this.skyMat.uniforms.rot.value.set(...rot);
    this.skyDome.position.copy(this.camera.position);

    // ---- lights
    const overcast = 1 - cloud * 0.72;
    const moonDir = this.sunDir.clone().multiplyScalar(-1);
    moonDir.y = Math.abs(moonDir.y) * 0.7 + 0.35;
    moonDir.normalize();
    const lightDir = elev > -2 ? this.sunDir : moonDir;
    const sunCol = new THREE.Color().setRGB(1, lerp(0.96, 0.6, golden), lerp(0.9, 0.36, golden));
    this.sun.color.copy(elev > -2 ? sunCol : new THREE.Color(0.55, 0.66, 1));
    this.sun.intensity = elev > -2 ? lerp(0, 3.4, sunUp) * overcast : 0.22 * (1 - cloud * 0.6);
    this.flash = Math.max(0, this.flash - dt * 4);
    if (rain > 0.75 && Math.random() < dt * 0.06) this.flash = 1.2;
    this.skyMat.uniforms.flash.value = this.flash * 0.6;
    this.hemi.intensity = lerp(0.05, 0.32, sunUp) + this.flash;
    this.hemi.color.setRGB(lerp(0.35, 0.72, sunUp), lerp(0.42, 0.8, sunUp), lerp(0.62, 0.95, sunUp));
    this.hemi.groundColor.setRGB(lerp(0.06, 0.32, sunUp), lerp(0.06, 0.29, sunUp), lerp(0.08, 0.24, sunUp));

    const R = this.q.shadowRange;
    const texel = (2 * R) / this.q.shadowSize;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(lightDir, 600);
    this.sun.target.updateMatrixWorld();

    // ---- fog matches horizon of blended sky
    const w = this.skyMat.uniforms.w.value;
    const g = this.skyGain;
    const fc = new THREE.Color(0, 0, 0);
    const parts = [[w.x, g.x, 0], [w.y, g.y, 1], [w.z, g.z, 2], [w.w, g.w, 3]];
    for (const [wt, gain, i] of parts) if (wt > 0) fc.add(this.horizon[i].clone().multiplyScalar(wt * gain * (assets.skyInfo ? 0.7 : 1)));
    const rainCol = new THREE.Color(0.32, 0.35, 0.39).multiplyScalar(lerp(1, 0.15, this.night));
    fc.lerp(rainCol, rain * 0.6);
    this.scene.fog.color.copy(fc);
    this.skyMat.uniforms.fogColor.value.copy(fc);
    this.skyMat.uniforms.haze.value = lerp(0.35, 1, Math.max(rain, weather.fog || 0));
    this.scene.fog.density = lerp(0.0007, 0.0026, Math.max(rain * 0.9, weather.fog || 0)) + this.night * 0.00015;

    // ---- rain
    this.rain.material.opacity = rain * 0.34;
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array;
      const cam = this.camera.position;
      for (let i = 0; i < this.rainVel.length; i++) {
        const k = i * 6;
        const dy = this.rainVel[i] * dt;
        p[k + 1] -= dy; p[k + 4] -= dy;
        if (p[k + 1] < cam.y - 30) {
          const x = cam.x + (Math.random() - 0.5) * 120, z = cam.z + (Math.random() - 0.5) * 120, y = cam.y + 30 + Math.random() * 10;
          p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x + 0.04; p[k + 4] = y - 0.8; p[k + 5] = z + 0.02;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.wetness = lerp(this.wetness, rain > 0.15 ? 1 : 0, 1 - Math.exp(-dt * 0.1));
    for (const m of this.wetMaterials) {
      m.mat.roughness = lerp(m.dry, 0.12, this.wetness);
      m.mat.envMapIntensity = lerp(m.dryEnv, 1.8, this.wetness);
    }

    // ---- night lights
    const lightsOn = smoothstep(0.12, 0.65, this.night + cloud * rain * 0.3);
    this.lightsOn = lightsOn;
    for (const n of this.nightMaterials) n.mat.emissiveIntensity = lerp(n.day, n.night, lightsOn);
    for (const n of this.nightBasic) n.mat.color.setScalar(lerp(n.day, n.night, lightsOn));
    for (const n of this.nightOpacity) { n.mat.opacity = n.max * lightsOn; n.mat.visible = lightsOn > 0.02; }
    if (this.bloom) {
      this.bloom.strength = lerp(0.12, 0.7, lightsOn);
      this.bloom.threshold = lerp(1.0, 0.75, lightsOn);
    }
    this.renderer.toneMappingExposure = lerp(0.88, 1.25, this.night) * lerp(1, 1.12, cloud);
    if (this.grade) {
      this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
      this.grade.uniforms.warmth.value = golden * 0.8 - this.night * 0.3;
      this.grade.uniforms.saturation.value = lerp(1.1, 0.88, rain);
    }

    // ---- image-based lighting refresh
    this._envTimer -= dt;
    const key = `${w.x.toFixed(2)}_${w.y.toFixed(2)}_${w.z.toFixed(2)}_${Math.round(worldPhi * 20)}`;
    if (this._envTimer <= 0 && key !== this._envKey) {
      this._envTimer = 1.5;
      this._envKey = key;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
      this.scene.environment = this.envRT.texture;
      if (old) old.dispose();
    }
    this.scene.environmentIntensity = lerp(0.35, 1.0, sunUp) * lerp(1, 0.8, cloud);
  }

  render() { this.composer.render(); }
}
