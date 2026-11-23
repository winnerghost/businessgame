// Deterministic city plan for Port Meridian: roads, blocks, lots, landmarks and props.
// Pure data — no Three.js — so game systems & minimap can use it too.
import { RNG, clamp } from '../core/utils.js';
import { DISTRICTS } from '../game/data/districts.js';

export const CITY = { NX: 10, NZ: 9, BLOCK: 96, ROAD: 14, SIDEWALK: 4, LANE: 2.2, PARK_LANE: 5.6 };
CITY.PITCH = CITY.BLOCK + CITY.ROAD;
CITY.W = CITY.NX * CITY.PITCH + CITY.ROAD;
CITY.H = CITY.NZ * CITY.PITCH + CITY.ROAD;
CITY.X0 = -CITY.W / 2;
CITY.Z0 = -CITY.H / 2;
CITY.SHORE_Z = CITY.Z0 + CITY.H + 44; // end of promenade / docks
CITY.CENTER = { x: 0, z: 0 };

export const roadX = (i) => CITY.X0 + CITY.ROAD / 2 + i * CITY.PITCH;
export const roadZ = (j) => CITY.Z0 + CITY.ROAD / 2 + j * CITY.PITCH;

export function blockBounds(bx, bz) {
  const x0 = roadX(bx) + CITY.ROAD / 2;
  const z0 = roadZ(bz) + CITY.ROAD / 2;
  return { x0, z0, x1: x0 + CITY.BLOCK, z1: z0 + CITY.BLOCK, cx: x0 + CITY.BLOCK / 2, cz: z0 + CITY.BLOCK / 2 };
}

const MAP = [
  'SRRRPPCCII',
  'SRRRPPCCII',
  'SRCCCCCCII',
  'SRCDDDDCII',
  'SCCDDDDCII',
  'SRCDDDDCII',
  'SRCCCCCCII',
  'SRRCCCCCII',
  'HHHHHHHHHH',
];
const CODE = { S: 'westbrook', R: 'northside', P: 'park', C: 'midtown', D: 'downtown', I: 'ironworks', H: 'harbor' };

export const AVENUES = ['Westgate Ave', 'Oak Ave', 'Maple Ave', 'Liberty Ave', 'Meridian Ave', 'Central Ave', 'Park Ave', 'Commerce Ave', 'Foundry Ave', 'Rail Ave', 'Eastport Ave'];
export const STREETS = ['North St', '1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', '7th St', 'Dock St', 'Harbor Blvd'];

export const LANDMARKS = {
  home: { name: 'Your Apartment', block: [1, 1], lot: 0, badge: 'HOME', color: '#68d391', desc: 'Rest, save your game and skip time.' },
  cityhall: { name: 'City Hall', block: [2, 4], whole: true, badge: 'GOV', color: '#f6c445', desc: 'Register companies, apply for permits & licenses, bid on city tenders.' },
  bank: { name: 'Meridian Trust Bank', block: [3, 3], lot: 0, badge: 'BANK', color: '#4fd1c5', desc: 'Business loans, mortgages, credit lines and your credit file.' },
  exchange: { name: 'Port Meridian Exchange', block: [6, 4], lot: 1, badge: 'PMX', color: '#63b3ed', desc: 'Trade equities and, one day, take your company public.' },
  recruiter: { name: 'TalentBridge Staffing', block: [7, 2], lot: 0, badge: 'JOBS', color: '#f687b3', desc: 'Premium recruiting: higher-skill candidates for a placement fee.' },
  realty: { name: 'Keystone Realty', block: [2, 2], lot: 0, badge: 'REAL', color: '#9ae6b4', desc: 'Commercial and residential property listings.' },
  wholesale: { name: 'Ironworks Wholesale Market', block: [8, 5], whole: true, badge: 'MKT', color: '#f6ad55', desc: 'Negotiate supplier contracts and buy stock in bulk.' },
  depot: { name: 'SwiftRoute Courier Depot', block: [6, 8], lot: 0, badge: 'GIG', color: '#fc8181', desc: 'Pick up delivery gigs for quick cash.' },
  dealer: { name: 'Meridian Motors', block: [2, 6], whole: true, badge: 'CARS', color: '#b794f4', desc: 'Buy and trade in vehicles.' },
};

const GLASS_TINTS = [[0.85, 1.0, 1.15], [0.8, 1.05, 1.05], [1.1, 1.0, 0.85], [0.95, 0.98, 1.0], [0.75, 0.9, 1.2], [1.0, 0.9, 0.8]];
const OFFICE_TINTS = [[1, 1, 1], [1.05, 1.0, 0.92], [0.92, 0.95, 1.0], [0.85, 0.85, 0.85], [1.08, 1.02, 0.95]];
const BRICK_TINTS = [[1, 1, 1], [0.85, 0.8, 0.8], [1.1, 0.95, 0.85], [0.75, 0.7, 0.7], [1.15, 1.05, 0.95]];
const PANEL_TINTS = [[1, 1, 1], [1.0, 0.95, 0.85], [0.9, 0.93, 0.98], [1.0, 0.92, 0.88], [0.93, 1.0, 0.93], [0.82, 0.82, 0.84]];
const HOUSE_COLORS = [[0.93, 0.9, 0.84], [0.78, 0.84, 0.88], [0.9, 0.82, 0.7], [0.75, 0.8, 0.72], [0.95, 0.95, 0.93], [0.7, 0.62, 0.55], [0.86, 0.76, 0.76]];
const ROOF_COLORS = [[0.35, 0.22, 0.18], [0.25, 0.27, 0.3], [0.42, 0.3, 0.22], [0.2, 0.2, 0.22], [0.5, 0.33, 0.25]];

export function buildLayout(seed = 20261123) {
  const rng = new RNG(seed);
  const L = {
    seed, CITY, blocks: [], buildings: [], lamps: [], trees: [], benches: [], hydrants: [], bushes: [],
    signals: [], parked: [], containers: [], cranes: [], piers: [], fountains: [], ponds: [], landmarks: {},
    nodes: [], segments: [],
  };

  const landmarkByBlock = {};
  for (const [id, lm] of Object.entries(LANDMARKS)) landmarkByBlock[lm.block.join(',')] = { id, ...lm };

  const cx = (roadX(4) + roadX(7)) / 2, cz = (roadZ(3) + roadZ(6)) / 2; // downtown centre
  CITY.CENTER = { x: cx, z: cz };

  let bid = 0;
  for (let bz = 0; bz < CITY.NZ; bz++) {
    for (let bx = 0; bx < CITY.NX; bx++) {
      const district = CODE[MAP[bz][bx]];
      const B = blockBounds(bx, bz);
      const block = { bx, bz, district, ...B, ground: 'plaza', lots: [] };
      L.blocks.push(block);
      const SW = CITY.SIDEWALK;
      const ix0 = B.x0 + SW, ix1 = B.x1 - SW, iz0 = B.z0 + SW, iz1 = B.z1 - SW;
      const inner = ix1 - ix0; // 88
      const lm = landmarkByBlock[`${bx},${bz}`];
      const centrality = clamp(1 - Math.hypot(B.cx - cx, B.cz - cz) / 520, 0, 1);

      const addBuilding = (o) => {
        const b = {
          id: `b${bid++}`, bx, bz, district, landmark: null, floors: Math.max(1, Math.round(o.h / 3.6)),
          tint: [1, 1, 1], storefront: false, ...o,
        };
        // facing & door
        const north = b.z < B.cz;
        b.face = o.face || (north ? 'N' : 'S');
        if (b.face === 'N') { b.door = { x: b.x, z: B.z0 + SW * 0.55 }; b.street = STREETS[bz]; }
        else if (b.face === 'S') { b.door = { x: b.x, z: B.z1 - SW * 0.55 }; b.street = STREETS[bz + 1]; }
        else if (b.face === 'W') { b.door = { x: B.x0 + SW * 0.55, z: b.z }; b.street = AVENUES[bx]; }
        else { b.door = { x: B.x1 - SW * 0.55, z: b.z }; b.street = AVENUES[bx + 1]; }
        const along = b.face === 'N' || b.face === 'S' ? b.x - CITY.X0 : b.z - CITY.Z0;
        b.number = 10 + 2 * Math.round(along / 4) + (b.face === 'N' || b.face === 'W' ? 1 : 0);
        b.address = `${b.number} ${b.street}`;
        const corner = Math.abs(b.x - B.cx) > inner * 0.28 ? 1.12 : 1.0;
        b.foot = DISTRICTS[district].foot * (0.75 + centrality * 0.5) * corner * rng.float(0.88, 1.12);
        L.buildings.push(b);
        block.lots.push(b.id);
        return b;
      };

      if (lm && lm.whole) {
        block.ground = lm.id === 'dealer' ? 'asphalt' : 'plaza';
        if (lm.id === 'cityhall') {
          const b = addBuilding({ x: B.cx, z: B.cz + 6, w: 62, d: 40, h: 22, kind: 'landmark', style: 'office', tint: [1.12, 1.08, 1.0], face: 'N' });
          b.landmark = 'cityhall'; b.door = { x: B.cx, z: B.z0 + SW * 0.55 };
          L.fountains.push({ x: B.cx, z: B.z0 + 14 });
        } else if (lm.id === 'wholesale') {
          const b = addBuilding({ x: B.cx, z: B.cz + 4, w: 74, d: 54, h: 15, kind: 'market', style: 'industrial', tint: [1.0, 0.95, 0.9], face: 'N' });
          b.landmark = 'wholesale';
          for (let k = 0; k < 6; k++) L.parked.push({ x: ix0 + 8 + k * 12, z: iz0 + 7, rot: Math.PI / 2, lot: true });
        } else if (lm.id === 'dealer') {
          const b = addBuilding({ x: B.cx, z: iz0 + 17, w: 54, d: 30, h: 10, kind: 'showroom', style: 'glass', tint: [1.0, 1.05, 1.1], face: 'N' });
          b.landmark = 'dealer';
          for (let r_ = 0; r_ < 3; r_++) for (let k = 0; k < 9; k++) {
            if (rng.chance(0.85)) L.parked.push({ x: ix0 + 6 + k * 9.5, z: iz0 + 46 + r_ * 13, rot: 0, lot: true, showroom: true });
          }
        }
        L.landmarks[lm.id] = { ...lm, buildingId: L.buildings[L.buildings.length - 1].id };
        continue;
      }

      if (district === 'park') {
        block.ground = 'grass';
        for (let k = 0; k < 70; k++) {
          const x = rng.float(ix0, ix1), z = rng.float(iz0, iz1);
          if (Math.abs(x - B.cx) < 4 || Math.abs(z - B.cz) < 4) continue; // paths
          if (bx === 5 && bz === 0 && Math.hypot(x - B.cx, z - B.cz) < 26) continue; // pond
          L.trees.push({ x, z, s: rng.float(0.8, 1.5), kind: rng.chance(0.3) ? 'pine' : 'round' });
        }
        if (bx === 5 && bz === 0) L.ponds.push({ x: B.cx, z: B.cz, r: 22 });
        if (bx === 4 && bz === 1) L.fountains.push({ x: B.cx, z: B.cz, big: true });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          L.benches.push({ x: B.cx + Math.cos(a) * 9, z: B.cz + Math.sin(a) * 9, rot: -a + Math.PI / 2 });
        }
        continue;
      }

      if (district === 'downtown') {
        const single = rng.chance(0.25) && !lm;
        const hBase = 70 + centrality * 150;
        if (single) {
          const w = rng.float(46, 58), d = rng.float(46, 58);
          addBuilding({ x: B.cx, z: B.cz, w, d, h: hBase * rng.float(1.0, 1.35), kind: 'tower', style: rng.chance(0.75) ? 'glass' : 'office', tint: rng.pick(GLASS_TINTS), storefront: true, face: rng.chance(0.5) ? 'N' : 'S' });
          for (let k = 0; k < 10; k++) L.trees.push({ x: rng.float(ix0 + 2, ix1 - 2), z: rng.chance(0.5) ? iz0 + 3 : iz1 - 3, s: 0.8, kind: 'round', planter: true });
        } else {
          const lw = (inner - 2) / 2;
          for (let r_ = 0; r_ < 2; r_++) for (let c = 0; c < 2; c++) {
            const lx = ix0 + c * (lw + 2) + lw / 2, lz = iz0 + r_ * (lw + 2) + lw / 2;
            const inset = rng.float(1, 5);
            const glass = rng.chance(0.68);
            addBuilding({
              x: lx, z: lz, w: lw - inset * 2, d: lw - inset * 2, h: Math.max(40, hBase * rng.float(0.45, 1.15)),
              kind: 'tower', style: glass ? 'glass' : 'office', tint: glass ? rng.pick(GLASS_TINTS) : rng.pick(OFFICE_TINTS), storefront: true,
            });
          }
        }
      } else if (district === 'midtown' || district === 'northside' || (district === 'harbor')) {
        const cols = 3, rows = 2;
        const lw = (inner - (cols - 1)) / cols, ld = (inner - 1) / rows;
        for (let r_ = 0; r_ < rows; r_++) for (let c = 0; c < cols; c++) {
          const lx = ix0 + c * (lw + 1) + lw / 2, lz = iz0 + r_ * (ld + 1) + ld / 2;
          if (district === 'harbor' && r_ === 0) {
            // warehouses on the inland side of the harbour
            if (c === 1) continue;
            const w = c === 0 ? lw * 1.45 : lw * 1.45;
            const x = c === 0 ? ix0 + w / 2 : ix1 - w / 2;
            addBuilding({ x, z: lz, w: w - 3, d: ld - 4, h: rng.float(8, 13), kind: 'warehouse', style: 'industrial', tint: rng.pick(OFFICE_TINTS) });
            continue;
          }
          if (district === 'northside' && rng.chance(0.12)) {
            for (let k = 0; k < 4; k++) L.trees.push({ x: lx + rng.float(-8, 8), z: lz + rng.float(-12, 12), s: rng.float(0.8, 1.2), kind: 'round' });
            continue;
          }
          let h, style, tint;
          if (district === 'midtown') {
            h = rng.float(14, 30) + centrality * 30;
            style = rng.pick(['office', 'panel', 'brick', 'office', 'glass']);
          } else if (district === 'northside') {
            h = rng.float(10, 24);
            style = rng.chance(0.65) ? 'brick' : 'panel';
          } else {
            h = rng.float(10, 20);
            style = rng.pick(['panel', 'brick', 'office']);
          }
          tint = style === 'glass' ? rng.pick(GLASS_TINTS) : style === 'brick' ? rng.pick(BRICK_TINTS) : style === 'panel' ? rng.pick(PANEL_TINTS) : rng.pick(OFFICE_TINTS);
          addBuilding({ x: lx, z: lz, w: lw - rng.float(0.4, 2), d: ld - rng.float(2, 6), h, kind: 'midrise', style, tint, storefront: district !== 'northside' || rng.chance(0.55) });
        }
        if (district !== 'harbor') {
          // street trees
          for (let k = 0; k < 7; k++) {
            const t = (k + 0.5) / 7;
            L.trees.push({ x: B.x0 + 8 + t * (CITY.BLOCK - 16), z: B.z0 + 1.6, s: 0.75, kind: 'round', street: true });
            L.trees.push({ x: B.x0 + 8 + t * (CITY.BLOCK - 16), z: B.z1 - 1.6, s: 0.75, kind: 'round', street: true });
          }
        }
      } else if (district === 'westbrook') {
        block.ground = 'grass';
        const cols = 4, rows = 2;
        const lw = inner / cols, ld = inner / rows;
        for (let r_ = 0; r_ < rows; r_++) for (let c = 0; c < cols; c++) {
          const lx = ix0 + c * lw + lw / 2;
          const north = r_ === 0;
          const hw = rng.float(10, 13), hd = rng.float(10, 13);
          const lz = north ? iz0 + 7 + hd / 2 : iz1 - 7 - hd / 2;
          addBuilding({ x: lx, z: lz, w: hw, d: hd, h: rng.float(5.5, 7.5), kind: 'house', style: 'house', tint: rng.pick(HOUSE_COLORS), roofTint: rng.pick(ROOF_COLORS), face: north ? 'N' : 'S' });
          for (let k = 0; k < 3; k++) L.trees.push({ x: lx + rng.float(-9, 9), z: north ? iz0 + 26 + rng.float(0, 14) : iz1 - 26 - rng.float(0, 14), s: rng.float(0.9, 1.4), kind: rng.chance(0.4) ? 'pine' : 'round' });
          L.bushes.push({ x: lx - hw / 2 - 1.5, z: lz, s: 1 }, { x: lx + hw / 2 + 1.5, z: lz, s: 1 });
          if (rng.chance(0.6)) L.parked.push({ x: lx + hw / 2 + 4, z: north ? iz0 + 4 : iz1 - 4, rot: 0, lot: true });
        }
      } else if (district === 'ironworks') {
        block.ground = 'dirt';
        const two = rng.chance(0.5);
        if (two) {
          for (let r_ = 0; r_ < 2; r_++) {
            const lz = iz0 + r_ * (inner / 2) + inner / 4;
            const factory = rng.chance(0.4);
            addBuilding({ x: B.cx, z: lz, w: inner - rng.float(8, 18), d: inner / 2 - rng.float(6, 12), h: rng.float(9, 16), kind: factory ? 'factory' : 'warehouse', style: 'industrial', tint: rng.pick(OFFICE_TINTS) });
          }
        } else {
          for (let r_ = 0; r_ < 2; r_++) for (let c = 0; c < 2; c++) {
            const lw = inner / 2;
            const lx = ix0 + c * lw + lw / 2, lz = iz0 + r_ * lw + lw / 2;
            addBuilding({ x: lx, z: lz, w: lw - rng.float(6, 12), d: lw - rng.float(8, 14), h: rng.float(7, 13), kind: rng.chance(0.3) ? 'factory' : 'warehouse', style: 'industrial', tint: rng.pick(OFFICE_TINTS) });
          }
        }
        for (let k = 0; k < 5; k++) L.containers.push({ x: rng.float(ix0 + 4, ix1 - 4), z: rng.chance(0.5) ? iz0 + 3 : iz1 - 3, rot: Math.PI / 2 * (rng.chance(0.5) ? 1 : 0), stack: rng.int(1, 2), color: rng.int(0, 5) });
      }

      if (lm && !lm.whole) {
        const b = L.buildings.find((bb) => bb.bx === bx && bb.bz === bz && block.lots.indexOf(bb.id) === Math.min(lm.lot, block.lots.length - 1));
        if (b) { b.landmark = lm.id; L.landmarks[lm.id] = { ...lm, buildingId: b.id }; }
      }
    }
  }

  // ------------------------------------------------ road network
  for (let j = 0; j <= CITY.NZ; j++) for (let i = 0; i <= CITY.NX; i++) {
    L.nodes.push({ i, j, x: roadX(i), z: roadZ(j), id: j * (CITY.NX + 1) + i });
  }
  const nodeAt = (i, j) => L.nodes[j * (CITY.NX + 1) + i];
  L.nodeAt = nodeAt;
  for (let j = 0; j <= CITY.NZ; j++) for (let i = 0; i < CITY.NX; i++) L.segments.push({ a: nodeAt(i, j), b: nodeAt(i + 1, j), dir: 'x', name: STREETS[j] });
  for (let i = 0; i <= CITY.NX; i++) for (let j = 0; j < CITY.NZ; j++) L.segments.push({ a: nodeAt(i, j), b: nodeAt(i, j + 1), dir: 'z', name: AVENUES[i] });

  // lamps + parked cars along segments
  const R2 = CITY.ROAD / 2;
  for (const s of L.segments) {
    const len = CITY.PITCH - CITY.ROAD;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      for (const side of [-1, 1]) {
        if ((k + (side > 0 ? 1 : 0)) % 2) continue; // staggered
        if (s.dir === 'x') {
          const x = s.a.x + R2 + t * len;
          L.lamps.push({ x, z: s.a.z + side * (R2 + 0.6), rot: side > 0 ? Math.PI : 0, axis: 'x' });
        } else {
          const z = s.a.z + R2 + t * len;
          L.lamps.push({ x: s.a.x + side * (R2 + 0.6), z, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, axis: 'z' });
        }
      }
    }
    // curbside parking
    for (let k = 0; k < 6; k++) {
      if (!rng.chance(0.28)) continue;
      const t = 0.12 + (k / 6) * 0.78;
      const side = rng.chance(0.5) ? -1 : 1;
      if (s.dir === 'x') L.parked.push({ x: s.a.x + R2 + t * len, z: s.a.z + side * CITY.PARK_LANE, rot: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
      else L.parked.push({ x: s.a.x + side * CITY.PARK_LANE, z: s.a.z + R2 + t * len, rot: side > 0 ? Math.PI : 0 });
    }
    // hydrants
    if (rng.chance(0.4)) {
      if (s.dir === 'x') L.hydrants.push({ x: s.a.x + R2 + rng.float(10, len - 10), z: s.a.z + (R2 + 0.8) * (rng.chance(0.5) ? 1 : -1) });
      else L.hydrants.push({ x: s.a.x + (R2 + 0.8) * (rng.chance(0.5) ? 1 : -1), z: s.a.z + R2 + rng.float(10, len - 10) });
    }
  }
  // traffic signals at intersections
  for (const n of L.nodes) {
    const deg = (n.i > 0) + (n.i < CITY.NX) + (n.j > 0) + (n.j < CITY.NZ);
    if (deg >= 3) L.signals.push({ node: n.id, x: n.x, z: n.z, phase: rng.float(0, 30) });
  }

  // ------------------------------------------------ harbour docks
  const quayZ = CITY.Z0 + CITY.H; // southern edge of Harbor Blvd
  for (let k = 0; k < 4; k++) {
    const x = roadX(1) + 40 + k * 150;
    L.piers.push({ x, z: CITY.SHORE_Z + 40, w: 22, d: 80 });
  }
  for (let k = 0; k < 4; k++) L.cranes.push({ x: roadX(7) + 15 + k * 40, z: CITY.SHORE_Z - 6 });
  for (let k = 0; k < 40; k++) {
    L.containers.push({ x: roadX(6) + 20 + rng.float(0, 340), z: quayZ + rng.float(8, 30), rot: rng.chance(0.85) ? 0 : Math.PI / 2, stack: rng.int(1, 3), color: rng.int(0, 5) });
  }
  for (let k = 0; k < 14; k++) L.benches.push({ x: roadX(0) + 30 + k * 34, z: quayZ + 6, rot: Math.PI });
  for (let k = 0; k < 18; k++) L.trees.push({ x: roadX(0) + 14 + k * 30, z: quayZ + 3, s: 0.8, kind: 'palm' });

  L.buildingById = Object.fromEntries(L.buildings.map((b) => [b.id, b]));
  L.districtAt = (x, z) => districtAt(x, z);
  return L;
}

export function blockAt(x, z) {
  const bx = Math.floor((x - CITY.X0 - CITY.ROAD / 2) / CITY.PITCH);
  const bz = Math.floor((z - CITY.Z0 - CITY.ROAD / 2) / CITY.PITCH);
  return { bx: clamp(bx, 0, CITY.NX - 1), bz: clamp(bz, 0, CITY.NZ - 1) };
}

export function districtAt(x, z) {
  if (z > CITY.Z0 + CITY.H) return 'harbor';
  const { bx, bz } = blockAt(x, z);
  return CODE[MAP[bz][bx]];
}

// Is (x,z) on a road surface (not sidewalk/block)?
export function onRoad(x, z) {
  const fx = ((x - CITY.X0) % CITY.PITCH + CITY.PITCH) % CITY.PITCH;
  const fz = ((z - CITY.Z0) % CITY.PITCH + CITY.PITCH) % CITY.PITCH;
  return fx < CITY.ROAD || fz < CITY.ROAD || z > CITY.Z0 + CITY.H - CITY.ROAD;
}

export function groundHeight(x, z) {
  if (x < CITY.X0 || x > CITY.X0 + CITY.W || z < CITY.Z0) return 0;
  if (z > CITY.Z0 + CITY.H) return z < CITY.SHORE_Z ? 0.15 : 0;
  return onRoad(x, z) ? 0 : 0.15;
}
