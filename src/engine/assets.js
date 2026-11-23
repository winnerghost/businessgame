// Loads the CC0 PBR texture sets (Poly Haven) and HDR skies, with progress reporting.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const BASE = 'assets/';
export const TEX_SETS = ['asphalt', 'pavers', 'plaza', 'grass', 'brick', 'concrete', 'plaster', 'corrugated', 'rooftiles', 'roofgravel', 'planks', 'yard', 'metal'];
export const SKIES = ['day', 'sunset', 'overcast', 'night'];

export const assets = {
  images: {}, // HTMLImageElement by key, e.g. brick_diff
  tex: {}, // THREE.Texture by key
  sky: {}, // { bg: Texture, hdr: DataTexture }
  skyInfo: null,
  ok: false,
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + url));
    img.src = url;
  });
}

export async function loadAssets(onProgress = () => {}) {
  const jobs = [];
  for (const s of TEX_SETS) for (const k of ['diff', 'nor', 'arm']) jobs.push({ kind: 'img', key: `${s}_${k}`, url: `${BASE}tex/${s}_${k}.jpg` });
  for (const s of SKIES) {
    jobs.push({ kind: 'img', key: `sky_${s}`, url: `${BASE}sky/${s}.jpg` });
    jobs.push({ kind: 'hdr', key: s, url: `${BASE}sky/${s}_1k.hdr` });
  }
  jobs.push({ kind: 'json', key: 'manifest', url: `${BASE}sky/manifest.json` });
  let done = 0;
  const rgbe = new RGBELoader();
  rgbe.setDataType(THREE.HalfFloatType);
  const tick = (label) => { done++; onProgress(done / jobs.length, label); };
  try {
    await Promise.all(jobs.map(async (j) => {
      if (j.kind === 'img') {
        assets.images[j.key] = await loadImage(j.url);
      } else if (j.kind === 'hdr') {
        const t = await rgbe.loadAsync(j.url);
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        (assets.sky[j.key] ||= {}).hdr = t;
      } else if (j.kind === 'json') {
        assets.skyInfo = await (await fetch(j.url)).json();
      }
      tick(j.key);
    }));
    assets.ok = true;
  } catch (e) {
    console.warn('[assets] falling back to procedural materials:', e.message);
    assets.ok = false;
  }
  return assets;
}

// Texture from a loaded image (cached), with repeat wrapping & anisotropy.
export function tex(key, { srgb = null, aniso = 8 } = {}) {
  const cacheKey = key;
  if (assets.tex[cacheKey]) return assets.tex[cacheKey];
  const img = assets.images[key];
  if (!img) return null;
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  const isColor = srgb ?? key.endsWith('_diff');
  if (isColor) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  assets.tex[cacheKey] = t;
  return t;
}

// A PBR material from a texture set. repeat in metres per tile is handled by geometry UVs.
export function pbr(set, opts = {}) {
  const { normalStrength = 1, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${set}_diff`), normalMap: tex(`${set}_nor`), roughnessMap: tex(`${set}_arm`), aoMap: tex(`${set}_arm`),
    roughness: 1, metalness: 0, aoMapIntensity: 0.8, ...rest,
  });
  m.normalScale = new THREE.Vector2(normalStrength, normalStrength);
  return m;
}
