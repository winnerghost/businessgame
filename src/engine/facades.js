// Building facade materials. A procedural window layout (colour/alpha mask, normal bevels,
// roughness/metalness, lit windows) is combined in-shader with real photographic wall textures
// (brick, plaster, concrete cladding, corrugated metal) tiled at true world scale.
import * as THREE from 'three';
import { RNG } from '../core/utils.js';
import { assets, tex } from './assets.js';

export const FACADE = { cols: 8, rows: 8, colW: 3.2, floorH: 3.6 };
const TILE_W = FACADE.cols * FACADE.colW; // 25.6 m
const TILE_H = FACADE.rows * FACADE.floorH; // 28.8 m
const DIMS = { brick: [1, 1], plaster: [2, 2], concrete: [2.09, 2.09], corrugated: [2.7, 2.7] };
const DETAIL = { office: 'concrete', brick: 'brick', panel: 'plaster', industrial: 'corrugated', glass: null };
const NEUTRAL = 0.2158; // linear value of sRGB 128
const DETAIL_GAIN = { office: 2.3, brick: 1.0, panel: 1.05, industrial: 1.1 };

const r = new RNG(2024);
const S = 1024;

function windowRect(style, col, row, cw, ch) {
  switch (style) {
    case 'glass': return [cw * 0.03, ch * 0.18, cw * 0.94, ch * 0.78];
    case 'office': return [cw * 0.12, ch * 0.2, cw * 0.76, ch * 0.6];
    case 'brick': return [cw * 0.27, ch * 0.18, cw * 0.46, ch * 0.62];
    case 'panel': return [cw * 0.07, ch * 0.26, cw * 0.86, ch * 0.5];
    case 'industrial': return row % 4 === 1 ? [cw * 0.04, ch * 0.32, cw * 0.92, ch * 0.3] : null;
    default: return null;
  }
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}
const rgb = (a, b, c, al = 1) => `rgba(${a | 0},${b | 0},${c | 0},${al})`;

// Bevel strips around a rectangle in a tangent-space normal map (OpenGL convention, canvas top = up).
function bevel(nx, x, y, w, h, t, inward = true) {
  const s = inward ? 1 : -1;
  nx.fillStyle = rgb(128, 128 - 70 * s, 200); nx.fillRect(x, y, w, t); // top edge: faces down (into opening)
  nx.fillStyle = rgb(128, 128 + 70 * s, 200); nx.fillRect(x, y + h - t, w, t); // bottom: faces up
  nx.fillStyle = rgb(128 + 70 * s, 128, 200); nx.fillRect(x, y, t, h); // left: faces right
  nx.fillStyle = rgb(128 - 70 * s, 128, 200); nx.fillRect(x + w - t, y, t, h); // right: faces left
}

function build(style) {
  const cw = S / FACADE.cols, ch = S / FACADE.rows;
  const cm = canvas(), cx = cm.getContext('2d'); // colour (rgb) + wall mask (alpha)
  const cn = canvas(), nx = cn.getContext('2d'); // normals
  const cr = canvas(), rx = cr.getContext('2d'); // G roughness, B metalness
  const ce = canvas(), ex = ce.getContext('2d'); // emissive
  const hasDetail = !!DETAIL[style] && assets.ok;
  nx.fillStyle = rgb(128, 128, 255); nx.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);

  if (style === 'glass') {
    cx.fillStyle = rgb(40, 52, 64); cx.fillRect(0, 0, S, S);
    rx.fillStyle = rgb(0, 60, 190); rx.fillRect(0, 0, S, S);
    for (let row = 0; row < FACADE.rows; row++) for (let col = 0; col < FACADE.cols; col++) {
      const [x, y, w, h] = windowRect(style, col, row, cw, ch);
      const k = r.float(0.9, 1.08);
      cx.fillStyle = rgb(150 * k, 172 * k, 190 * k);
      cx.fillRect(col * cw + x, row * ch + y, w, h);
      rx.fillStyle = rgb(0, r.int(6, 18), 235);
      rx.fillRect(col * cw + x, row * ch + y, w, h);
    }
    // mullions & transoms (brushed aluminium)
    cx.fillStyle = rgb(150, 156, 162); rx.fillStyle = rgb(0, 95, 220);
    for (let col = 0; col <= FACADE.cols; col++) { cx.fillRect(col * cw - 3, 0, 6, S); rx.fillRect(col * cw - 3, 0, 6, S); bevel(nx, col * cw - 4, 0, 8, S, 2, false); }
    for (let row = 0; row <= FACADE.rows; row++) { cx.fillRect(0, row * ch - 2, S, 5); rx.fillRect(0, row * ch - 2, S, 5); }
  } else {
    // wall: tint value (neutral grey = texture as-is), alpha 1 = use detail texture
    const base = hasDetail ? 128 : { office: 120, brick: 110, panel: 200, industrial: 130 }[style];
    cx.fillStyle = hasDetail ? rgb(base, base, base) : { office: '#8d8a84', brick: '#7a3b2a', panel: '#d8d0c2', industrial: '#7d8388' }[style];
    cx.fillRect(0, 0, S, S);
    rx.fillStyle = rgb(0, style === 'industrial' ? 150 : 235, style === 'industrial' ? 120 : 0);
    rx.fillRect(0, 0, S, S);
    if (style === 'office' || style === 'panel') {
      // precast floor bands slightly darker
      for (let row = 0; row < FACADE.rows; row++) {
        cx.fillStyle = hasDetail ? rgb(112, 112, 112) : 'rgba(0,0,0,0.12)';
        cx.fillRect(0, row * ch + ch * 0.86, S, ch * 0.14);
        nx.fillStyle = rgb(128, 170, 230); nx.fillRect(0, row * ch + ch * 0.86, S, 3);
      }
    }
    if (style === 'panel') {
      for (let i = 0; i <= FACADE.cols * 2; i++) { nx.fillStyle = rgb(90, 128, 230); nx.fillRect((i * cw) / 2 - 1, 0, 2, S); }
    }
    for (let row = 0; row < FACADE.rows; row++) for (let col = 0; col < FACADE.cols; col++) {
      const rect = windowRect(style, col, row, cw, ch);
      if (!rect) continue;
      const [x, y, w, h] = rect;
      const X = col * cw + x, Y = row * ch + y;
      const frame = style === 'brick' ? 9 : 6;
      // surround / frame (not wall-textured)
      if (style === 'brick') {
        cx.fillStyle = rgb(214, 205, 188, 1); cx.fillRect(X - 10, Y - 12, w + 20, 12); // lintel
        cx.fillRect(X - 12, Y + h, w + 24, 10); // sill
        rx.fillStyle = rgb(0, 200, 0); rx.fillRect(X - 10, Y - 12, w + 20, 12); rx.fillRect(X - 12, Y + h, w + 24, 10);
        nx.fillStyle = rgb(128, 190, 220); nx.fillRect(X - 12, Y + h, w + 24, 4);
      }
      cx.fillStyle = style === 'industrial' ? rgb(70, 76, 80) : style === 'brick' ? rgb(232, 228, 220) : rgb(62, 66, 70);
      cx.fillRect(X - frame, Y - frame, w + frame * 2, h + frame * 2);
      rx.fillStyle = rgb(0, 120, style === 'brick' ? 0 : 160);
      rx.fillRect(X - frame, Y - frame, w + frame * 2, h + frame * 2);
      bevel(nx, X - frame - 4, Y - frame - 4, w + frame * 2 + 8, h + frame * 2 + 8, 4, true);
      // glass
      const g = cx.createLinearGradient(0, Y, 0, Y + h);
      const k = r.float(0.85, 1.12);
      g.addColorStop(0, rgb(118 * k, 136 * k, 150 * k)); g.addColorStop(1, rgb(62 * k, 74 * k, 84 * k));
      cx.fillStyle = g; cx.fillRect(X, Y, w, h);
      rx.fillStyle = rgb(0, r.int(8, 22), 120); rx.fillRect(X, Y, w, h);
      // glazing bars
      if (style === 'brick' || style === 'industrial') {
        cx.fillStyle = style === 'brick' ? rgb(232, 228, 220) : rgb(90, 96, 100);
        const bars = style === 'industrial' ? 4 : 1;
        for (let b = 1; b <= bars; b++) cx.fillRect(X + (w * b) / (bars + 1) - 2, Y, 4, h);
        if (style === 'brick') cx.fillRect(X, Y + h * 0.42, w, 4);
      } else if (style === 'office') {
        cx.fillStyle = rgb(62, 66, 70); cx.fillRect(X + w / 2 - 2, Y, 4, h);
      }
    }
  }
  // lit windows at night
  const lit = { glass: 0.3, office: 0.3, brick: 0.42, panel: 0.38, industrial: 0.5 }[style];
  for (let row = 0; row < FACADE.rows; row++) for (let col = 0; col < FACADE.cols; col++) {
    const rect = windowRect(style, col, row, cw, ch);
    if (!rect || !r.chance(lit)) continue;
    const [x, y, w, h] = rect;
    const warm = r.chance(style === 'glass' || style === 'office' ? 0.55 : 0.85);
    const k = r.float(0.35, 0.9);
    const c = warm ? [255 * k, 190 * k, 115 * k] : [205 * k, 222 * k, 255 * k];
    const g = ex.createLinearGradient(0, row * ch + y, 0, row * ch + y + h);
    g.addColorStop(0, rgb(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6));
    g.addColorStop(1, rgb(c[0], c[1], c[2]));
    ex.fillStyle = g; ex.fillRect(col * cw + x, row * ch + y, w, h);
    if (r.chance(0.45)) { ex.fillStyle = 'rgba(0,0,0,0.55)'; ex.fillRect(col * cw + x, row * ch + y, w, h * r.float(0.1, 0.55)); }
  }
  // wall mask -> red channel of the roughness/metalness map (alpha would be premultiplied away)
  if (hasDetail) {
    const ci = cx.getImageData(0, 0, S, S).data;
    const mi = rx.getImageData(0, 0, S, S);
    const d = mi.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = ci[i];
      d[i] = v === ci[i + 1] && v === ci[i + 2] && (v === 128 || v === 112) ? 255 : 0;
    }
    rx.putImageData(mi, 0, 0);
  }
  const T = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: T(cm, true), normal: T(cn, false), mr: T(cr, false), emissive: T(ce, true), hasDetail };
}

const cache = {};
export function facadeMaterial(style) {
  if (cache[style]) return cache[style];
  const t = build(style);
  const glass = style === 'glass';
  const m = new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normal, roughnessMap: t.mr, metalnessMap: t.mr, emissiveMap: t.emissive,
    emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 1, metalness: 1,
    envMapIntensity: glass ? 1.5 : 1.15,
  });
  const det = DETAIL[style];
  if (t.hasDetail && det) {
    const dims = DIMS[det];
    const u = {
      detailMap: { value: tex(`${det}_diff`) },
      detailNormal: { value: tex(`${det}_nor`) },
      detailRepeat: { value: new THREE.Vector2(TILE_W / dims[0], TILE_H / dims[1]) },
      detailGain: { value: DETAIL_GAIN[style] ?? 1 },
    };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform sampler2D detailMap; uniform sampler2D detailNormal; uniform vec2 detailRepeat; uniform float detailGain;`)
        .replace('#include <map_fragment>', `
          vec4 fMap = texture2D( map, vMapUv );
          float wallMask = texture2D( roughnessMap, vRoughnessMapUv ).r;
          vec3 dCol = texture2D( detailMap, vMapUv * detailRepeat ).rgb * detailGain;
          diffuseColor.rgb *= mix( fMap.rgb, dCol * ( fMap.rgb / ${NEUTRAL.toFixed(4)} ), wallMask );`)
        .replace('#include <normal_fragment_maps>', `
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
            float wallM = texture2D( roughnessMap, vRoughnessMapUv ).r;
            vec3 detN = texture2D( detailNormal, vNormalMapUv * detailRepeat ).xyz * 2.0 - 1.0;
            mapN.xy += detN.xy * wallM * 1.1;
            mapN.xy *= normalScale;
            normal = normalize( tbn * normalize(mapN) );
          #endif`);
    };
    m.customProgramCacheKey = () => `facade_${style}`;
  }
  cache[style] = m;
  return m;
}

export function facadeStyles() { return ['glass', 'office', 'brick', 'panel', 'industrial']; }
