// Turns the city layout into meshes: merged buildings, roads, ground, water and instanced props.
import * as THREE from 'three';
import { GeoBatch } from './geoBatch.js';
import { CITY, roadX, roadZ } from './layout.js';
import { RNG } from '../core/utils.js';
import {
  facadeTextures, storefrontTextures, roofTexture, sidewalkTexture,
  plazaTexture, grassTexture, dirtTexture, waterNormalTexture, glowTexture, makeTextTexture, roadMarkingsTexture, crosswalkTexture,
} from '../engine/textures.js';
import { FACADE, facadeMaterial } from '../engine/facades.js';
import { assets, pbr } from '../engine/assets.js';
import { makeTreeKit } from './foliage.js';

// real-world tile sizes (m) of the photographic texture sets
const TS = { asphalt: 3, pavers: 1.92, plaza: 2, grass: 2, yard: 3, roofgravel: 2.2, rooftiles: 3, planks: 2, concrete: 2.09, plaster: 2, metal: 0.5 };
import { carGeometry, CAR_MODELS, CAR_COLORS } from './carModels.js';

const STYLES = ['glass', 'office', 'brick', 'panel', 'industrial'];
const AWNING_COLORS = [[0.6, 0.12, 0.1], [0.1, 0.32, 0.22], [0.12, 0.2, 0.42], [0.55, 0.38, 0.1], [0.3, 0.3, 0.32], [0.45, 0.1, 0.3], [0.08, 0.38, 0.4]];
const CONTAINER_COLORS = [0xa33a2a, 0x2a5ea3, 0x2f8a4a, 0xc78a24, 0x6a6f74, 0x8a3a8a];

export class CityBuilder {
  constructor(layout, gfx, collision) {
    this.L = layout;
    this.gfx = gfx;
    this.col = collision;
    this.group = new THREE.Group();
    this.group.name = 'city';
    this.rng = new RNG(layout.seed + 7);
    this.signs = new Map();
    this.animated = [];
  }

  build() {
    this.makeMaterials();
    this.buildGround();
    this.buildBuildings();
    this.buildProps();
    this.buildHarbour();
    this.buildParked();
    this.buildBounds();
    return this.group;
  }

  makeMaterials() {
    const g = this.gfx;
    const M = (this.M = {});
    const real = assets.ok;
    for (const st of STYLES) {
      M[st] = facadeMaterial(st);
      g.registerNightMaterial(M[st], 0, st === 'industrial' ? 0.8 : st === 'glass' || st === 'office' ? 1.05 : 1.3);
    }
    const sf = storefrontTextures();
    M.store = new THREE.MeshStandardMaterial({ map: sf.map, emissiveMap: sf.emissive, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.18, metalness: 0.35, vertexColors: true, envMapIntensity: 1.2 });
    g.registerNightMaterial(M.store, 0.25, 1.15);
    M.roof = real ? pbr('roofgravel', { vertexColors: true }) : new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.95, vertexColors: true });
    M.rooftiles = real ? pbr('rooftiles', { vertexColors: true, normalStrength: 1.4 }) : new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true });
    M.solid = real ? pbr('plaster', { vertexColors: true, normalStrength: 0.6 }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
    M.metal = real ? pbr('metal', { vertexColors: true, metalness: 0.7, roughness: 0.9, normalStrength: 0.5 }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.6 });
    if (real) { M.metal.map = null; M.metal.aoMap = null; }
    M.lights = new THREE.MeshBasicMaterial({ vertexColors: true });
    g.registerNightBasic(M.lights, 1.0, 4.0);
    M.houseWin = new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.05, metalness: 0.3, emissive: 0xffc47a, emissiveIntensity: 0, envMapIntensity: 1.5 });
    g.registerNightMaterial(M.houseWin, 0, 1.3);

    M.road = real ? pbr('asphalt', { normalStrength: 0.8 }) : new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 0.9 });
    M.inter = M.road;
    M.marks = new THREE.MeshStandardMaterial({ map: roadMarkingsTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.cross = new THREE.MeshStandardMaterial({ map: crosswalkTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.side = real ? pbr('pavers', { normalStrength: 1.2 }) : new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.9 });
    M.plaza = real ? pbr('plaza') : new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.85 });
    M.grass = real ? pbr('grass', { normalStrength: 1.3, color: 0xc8e0b0 }) : new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1.0 });
    M.dirt = real ? pbr('yard') : new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 0.95 });
    M.asphalt = M.road;
    M.planks = real ? pbr('planks') : new THREE.MeshStandardMaterial({ color: 0x6b5440, roughness: 0.9 });
    for (const k of ['road', 'side', 'plaza', 'marks', 'cross']) g.registerWetMaterial(M[k]);
    let land;
    if (real) {
      land = pbr('grass', { color: 0x9fb48a });
      land.map = land.map.clone(); land.map.repeat.set(1400, 1400); land.map.needsUpdate = true;
      land.normalMap = null; land.roughnessMap = null; land.aoMap = null;
    } else {
      const lt = grassTexture().clone(); lt.repeat.set(220, 220); lt.needsUpdate = true;
      land = new THREE.MeshStandardMaterial({ map: lt, roughness: 1, color: 0xb8c0a8 });
    }
    Object.assign(land, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    M.land = land;
    const wn = waterNormalTexture();
    wn.repeat.set(70, 70);
    M.water = new THREE.MeshStandardMaterial({ color: 0x0d2a38, roughness: 0.04, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.6 });
    const wn2 = wn.clone(); wn2.repeat.set(4, 4); wn2.needsUpdate = true;
    M.pond = new THREE.MeshStandardMaterial({ color: 0x173a3a, roughness: 0.04, metalness: 0.15, normalMap: wn2, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4 });
    this.waterTex = [wn, wn2];
    // automotive clearcoat paint for parked cars (instance colour tints the white body)
    this.carBodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 });
  }

  mesh(batch, mat, { cast = true, receive = true, name = '' } = {}) {
    if (batch.empty) return null;
    const m = new THREE.Mesh(batch.toGeometry(), mat);
    m.castShadow = cast && this.gfx.q.shadows;
    m.receiveShadow = receive;
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    return m;
  }

  // -------------------------------------------------------------- ground
  buildGround() {
    const { M, L } = this;
    const R2 = CITY.ROAD / 2;
    const road = new GeoBatch(), inter = new GeoBatch(), side = new GeoBatch(), marks = new GeoBatch(), cross = new GeoBatch();
    const plaza = new GeoBatch(), grass = new GeoBatch(), dirt = new GeoBatch(), asphalt = new GeoBatch();
    const top = (b, x0, z0, x1, z1, y, s = 8) => b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[x0 / s, -z1 / s], [x1 / s, -z1 / s], [x1 / s, -z0 / s], [x0 / s, -z0 / s]]);

    const A = TS.asphalt;
    for (const s of L.segments) {
      const len = CITY.PITCH - CITY.ROAD;
      const U = len / 24;
      let x0, x1, z0, z1;
      if (s.dir === 'x') { x0 = s.a.x + R2; x1 = s.b.x - R2; z0 = s.a.z - R2; z1 = s.a.z + R2; }
      else { z0 = s.a.z + R2; z1 = s.b.z - R2; x0 = s.a.x - R2; x1 = s.a.x + R2; }
      road.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [[x0 / A, -z1 / A], [x1 / A, -z1 / A], [x1 / A, -z0 / A], [x0 / A, -z0 / A]]);
      if (s.dir === 'x') marks.quad([x0, 0.012, z1], [x1, 0.012, z1], [x1, 0.012, z0], [x0, 0.012, z0], [0, 1, 0], [[0, 0], [U, 0], [U, 1], [0, 1]]);
      else marks.quad([x0, 0.012, z1], [x1, 0.012, z1], [x1, 0.012, z0], [x0, 0.012, z0], [0, 1, 0], [[U, 0], [U, 1], [0, 1], [0, 0]]);
    }
    for (const n of L.nodes) {
      const x0 = n.x - R2, x1 = n.x + R2, z0 = n.z - R2, z1 = n.z + R2;
      inter.quad([x0, 0.001, z1], [x1, 0.001, z1], [x1, 0.001, z0], [x0, 0.001, z0], [0, 1, 0], [[x0 / A, -z1 / A], [x1 / A, -z1 / A], [x1 / A, -z0 / A], [x0 / A, -z0 / A]]);
      cross.quad([x0, 0.013, z1], [x1, 0.013, z1], [x1, 0.013, z0], [x0, 0.013, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    const H = 0.15, SW = CITY.SIDEWALK;
    for (const b of L.blocks) {
      const { x0, z0, x1, z1 } = b;
      // sidewalk ring
      const P = TS.pavers;
      top(side, x0, z0, x1, z0 + SW, H, P);
      top(side, x0, z1 - SW, x1, z1, H, P);
      top(side, x0, z0 + SW, x0 + SW, z1 - SW, H, P);
      top(side, x1 - SW, z0 + SW, x1, z1 - SW, H, P);
      const target = b.ground === 'grass' ? grass : b.ground === 'dirt' ? dirt : b.ground === 'asphalt' ? asphalt : plaza;
      top(target, x0 + SW, z0 + SW, x1 - SW, z1 - SW, H, b.ground === 'grass' ? TS.grass : b.ground === 'dirt' ? TS.yard : b.ground === 'asphalt' ? TS.asphalt : TS.plaza);
      // curbs
      const U = (a) => [[0, 0], [a / 4, 0], [a / 4, 0.04], [0, 0.04]];
      side.quad([x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], U(x1 - x0));
      side.quad([x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1], U(x1 - x0));
      side.quad([x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0], U(z1 - z0));
      side.quad([x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], U(z1 - z0));
      // park paths
      if (b.district === 'park') {
        top(side, b.cx - 3, z0 + SW, b.cx + 3, z1 - SW, H + 0.01, TS.pavers);
        top(side, x0 + SW, b.cz - 3, x1 - SW, b.cz + 3, H + 0.012, TS.pavers);
      }
    }
    // Waterfront promenade
    const pz0 = CITY.Z0 + CITY.H, pz1 = CITY.SHORE_Z;
    const px0 = CITY.X0 - 60, px1 = CITY.X0 + CITY.W + 60;
    top(plaza, px0, pz0, px1, pz1, H, TS.plaza);
    side.quad([px1, 0, pz0], [px0, 0, pz0], [px0, H, pz0], [px1, H, pz0], [0, 0, -1], [[0, 0], [1, 0], [1, 0.04], [0, 0.04]]);
    // quay wall
    side.quad([px0, -2, pz1], [px1, -2, pz1], [px1, H, pz1], [px0, H, pz1], [0, 0, 1], [[0, 0], [(px1 - px0) / 4, 0], [(px1 - px0) / 4, 0.6], [0, 0.6]]);

    this.mesh(road, M.road, { cast: false, name: 'roads' });
    this.mesh(inter, M.inter, { cast: false });
    this.mesh(marks, M.marks, { cast: false });
    this.mesh(cross, M.cross, { cast: false });
    this.mesh(side, M.side, { cast: false });
    this.mesh(plaza, M.plaza, { cast: false });
    this.mesh(grass, M.grass, { cast: false });
    this.mesh(dirt, M.dirt, { cast: false });
    this.mesh(asphalt, M.asphalt, { cast: false });

    // Land & sea
    const landGeo = new THREE.PlaneGeometry(7000, 3500 + CITY.SHORE_Z);
    landGeo.rotateX(-Math.PI / 2);
    landGeo.translate(0, -0.2, (-3500 + CITY.SHORE_Z) / 2);
    const land = new THREE.Mesh(landGeo, M.land);
    land.receiveShadow = true;
    this.group.add(land);
    const seaGeo = new THREE.PlaneGeometry(9000, 4000);
    seaGeo.rotateX(-Math.PI / 2);
    seaGeo.translate(0, -1.1, CITY.SHORE_Z + 2000 - 1);
    const sea = new THREE.Mesh(seaGeo, M.water);
    sea.receiveShadow = true;
    this.group.add(sea);
    this.sea = sea;
  }

  // -------------------------------------------------------------- buildings
  facadeBox(batch, roof, x, y0, z, w, h, d, tint, uo, vo) {
    const CW = FACADE.cols * FACADE.colW, CH = FACADE.rows * FACADE.floorH;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y0 + h;
    const v0 = vo + y0 / CH, v1 = vo + y1 / CH;
    const su = Math.max(1, Math.round(w / FACADE.colW)) / FACADE.cols;
    const sd = Math.max(1, Math.round(d / FACADE.colW)) / FACADE.cols;
    const q = (a, b, c, e, n, u0, span) => batch.quad(a, b, c, e, n, [[u0, v0], [u0 + span, v0], [u0 + span, v1], [u0, v1]], tint);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uo, su);
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uo + 0.375, su);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uo + 0.625, sd);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uo + 0.25, sd);
    const s = TS.roofgravel;
    roof.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s], [x0 / s, z0 / s]], [tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9]);
  }

  parapet(batch, x, y, z, w, d, col, t = 0.35, hh = 0.9) {
    batch.box(x, y, z - d / 2 + t / 2, w, hh, t, col);
    batch.box(x, y, z + d / 2 - t / 2, w, hh, t, col);
    batch.box(x - w / 2 + t / 2, y, z, t, hh, d - t * 2, col);
    batch.box(x + w / 2 - t / 2, y, z, t, hh, d - t * 2, col);
  }

  storefront(store, b, h = 4.6) {
    const { x, z, w, d } = b;
    const o = 0.18;
    const x0 = x - w / 2 - o, x1 = x + w / 2 + o, z0 = z - d / 2 - o, z1 = z + d / 2 + o;
    const bays = (len) => Math.max(1, Math.round(len / 4.2)) / 8;
    const uo = this.rng.int(0, 7) / 8;
    const tint = [1, 1, 1];
    const U = (span) => [[uo, 0], [uo + span, 0], [uo + span, 1], [uo, 1]];
    const y0 = 0.15, y1 = h;
    if (b.face === 'S') store.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U(bays(w)), tint);
    if (b.face === 'N') store.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U(bays(w)), tint);
    if (b.face === 'E' || b.kind === 'tower') store.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], U(bays(d)), tint);
    if (b.face === 'W' || b.kind === 'tower') store.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], U(bays(d)), tint);
    if (b.kind === 'tower') {
      if (b.face !== 'S') store.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U(bays(w)), tint);
      if (b.face !== 'N') store.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U(bays(w)), tint);
    }
  }

  buildBuildings() {
    const { M, L, rng } = this;
    const fb = Object.fromEntries(STYLES.map((s) => [s, new GeoBatch()]));
    const roof = new GeoBatch(), solid = new GeoBatch(), metal = new GeoBatch(), lights = new GeoBatch(), store = new GeoBatch(), win = new GeoBatch(), tiles = new GeoBatch();
    this.chimneys = [];

    for (const b of L.buildings) {
      const uo = rng.int(0, 7) / 8, vo = rng.int(0, 7) / 8;
      const base = 0.15;
      this.col.addBox(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, b.h + base, { building: b.id });

      if (b.kind === 'house') { this.buildHouse(b, solid, win, tiles); continue; }

      if (b.kind === 'tower') {
        const tiers = b.h > 120 ? [[0.6, 1], [0.26, 0.8], [0.14, 0.6]] : b.h > 75 ? [[0.72, 1], [0.28, 0.78]] : [[1, 1]];
        let y = base;
        let tw = b.w, td = b.d;
        for (const [f, sc] of tiers) {
          const hh = b.h * f;
          tw = b.w * sc; td = b.d * sc;
          this.facadeBox(fb[b.style], roof, b.x, y, b.z, tw, hh, td, b.tint, uo, vo);
          y += hh;
          this.parapet(solid, b.x, y, b.z, tw + 0.1, td + 0.1, [0.55, 0.57, 0.6], 0.3, 0.8);
        }
        // crown light strip
        const lc = rng.pick([[0.8, 0.95, 1], [1, 0.85, 0.6], [0.6, 1, 0.9], [1, 1, 1]]);
        for (const s of [-1, 1]) {
          lights.box(b.x, y - 0.5, b.z + s * (td / 2 + 0.06), tw, 0.25, 0.08, lc, { top: false });
          lights.box(b.x + s * (tw / 2 + 0.06), y - 0.5, b.z, 0.08, 0.25, td, lc, { top: false });
        }
        if (b.h > 110 && rng.chance(0.7)) {
          metal.box(b.x, y, b.z, 0.8, b.h * 0.12, 0.8, [0.7, 0.7, 0.72]);
          lights.box(b.x, y + b.h * 0.12, b.z, 0.9, 0.9, 0.9, [1, 0.08, 0.05]);
        }
        for (let k = 0; k < rng.int(2, 5); k++) solid.box(b.x + rng.float(-tw / 3, tw / 3), y, b.z + rng.float(-td / 3, td / 3), rng.float(2, 5), rng.float(1.5, 3), rng.float(2, 5), [0.62, 0.63, 0.64]);
        // podium canopy at entrance
        const fz = b.face === 'N' ? b.z - b.d / 2 - 1.2 : b.z + b.d / 2 + 1.2;
        metal.box(b.x, 4.8, fz, Math.min(14, b.w * 0.5), 0.35, 2.6, [0.22, 0.23, 0.25]);
        lights.box(b.x, 4.75, fz, Math.min(14, b.w * 0.5) - 0.6, 0.06, 2.0, [1, 0.92, 0.8], { top: false, bottom: true });
        this.storefront(store, b, 4.6);
        continue;
      }

      if (b.kind === 'midrise' || b.kind === 'landmark' || b.kind === 'showroom') {
        this.facadeBox(fb[b.style], roof, b.x, base, b.z, b.w, b.h, b.d, b.tint, uo, vo);
        const pc = b.style === 'brick' ? [0.5, 0.25, 0.18] : [0.62, 0.6, 0.57];
        this.parapet(solid, b.x, b.h + base, b.z, b.w + 0.2, b.d + 0.2, [pc[0] * b.tint[0], pc[1] * b.tint[1], pc[2] * b.tint[2]], 0.35, 1.0);
        // cornice band
        solid.box(b.x, b.h * 0.25 + 3, b.z, b.w + 0.3, 0.25, b.d + 0.3, [0.7, 0.68, 0.64], { top: false });
        if (b.storefront) {
          this.storefront(store, b, 4.6);
          if (b.district !== 'downtown' && rng.chance(0.7)) {
            const ac = rng.pick(AWNING_COLORS);
            const fz = b.face === 'N' ? b.z - b.d / 2 - 0.9 : b.z + b.d / 2 + 0.9;
            solid.box(b.x, 3.6, fz, b.w * 0.9, 0.18, 1.8, ac, { bottom: true });
            solid.box(b.x, 3.3, b.face === 'N' ? fz - 0.85 : fz + 0.85, b.w * 0.9, 0.45, 0.06, ac);
          }
        }
        if (b.kind === 'midrise') {
          for (let k = 0; k < rng.int(1, 4); k++) solid.box(b.x + rng.float(-b.w / 3, b.w / 3), b.h + base, b.z + rng.float(-b.d / 3, b.d / 3), rng.float(1.5, 3.5), rng.float(1, 2.2), rng.float(1.5, 3.5), [0.6, 0.61, 0.62]);
          if (b.style === 'brick' && rng.chance(0.35)) this.waterTower(solid, b.x + b.w * 0.2, b.h + base, b.z - b.d * 0.15);
        }
        if (b.landmark === 'cityhall') this.buildCityHall(b, solid, metal, lights);
        if (b.kind === 'showroom') metal.box(b.x, b.h + base, b.z, b.w + 1, 0.6, b.d + 1, [0.25, 0.25, 0.28]);
        continue;
      }

      if (b.kind === 'warehouse' || b.kind === 'factory' || b.kind === 'market') {
        this.facadeBox(fb.industrial, roof, b.x, base, b.z, b.w, b.h, b.d, b.tint, uo, vo);
        // loading bays on the front
        const n = Math.max(1, Math.floor(b.w / 12));
        const fz = b.face === 'N' ? b.z - b.d / 2 - 0.05 : b.z + b.d / 2 + 0.05;
        for (let k = 0; k < n; k++) {
          const x = b.x - b.w / 2 + (k + 0.5) * (b.w / n);
          solid.box(x, base, fz, 4.2, 4.6, 0.12, [0.32, 0.34, 0.36]);
          lights.box(x, 5.0, fz + (b.face === 'N' ? -0.1 : 0.1), 0.5, 0.15, 0.15, [1, 0.8, 0.55]);
        }
        for (let k = 0; k < rng.int(2, 6); k++) metal.cylinder(b.x + rng.float(-b.w / 3, b.w / 3), b.h + base, b.z + rng.float(-b.d / 3, b.d / 3), rng.float(0.4, 0.9), rng.float(0.8, 1.6), [0.7, 0.72, 0.74], 8);
        if (b.kind === 'factory') {
          for (let k = 0; k < rng.int(1, 3); k++) {
            const cx = b.x + b.w * 0.3 - k * 6, cz = b.z + b.d * 0.15;
            const hh = b.h + rng.float(14, 26);
            solid.cylinder(cx, base, cz, 1.4, hh, [0.55, 0.28, 0.22], 12);
            solid.cylinder(cx, hh - 3, cz, 1.45, 1.2, [0.9, 0.9, 0.9], 12, false);
            lights.box(cx, hh + 0.1, cz, 0.4, 0.4, 0.4, [1, 0.1, 0.05]);
            this.chimneys.push({ x: cx, y: hh + base, z: cz });
          }
        }
        if (b.kind === 'market') {
          const arch = new THREE.CylinderGeometry(b.d / 2, b.d / 2, b.w - 2, 24, 1, false, 0, Math.PI);
          arch.rotateZ(Math.PI / 2);
          arch.rotateX(0);
          const am = new THREE.Mesh(arch, new THREE.MeshStandardMaterial({ color: 0x7d8a92, roughness: 0.45, metalness: 0.6 }));
          am.scale.set(1, 0.32, 1);
          am.position.set(b.x, b.h + base, b.z);
          am.castShadow = this.gfx.q.shadows;
          this.group.add(am);
        }
      }
    }

    for (const s of STYLES) this.mesh(fb[s], M[s], { name: `facade_${s}` });
    this.mesh(roof, M.roof);
    this.mesh(solid, M.solid);
    this.mesh(metal, M.metal);
    this.mesh(lights, M.lights, { cast: false, receive: false });
    this.mesh(store, M.store, { cast: false });
    this.mesh(win, M.houseWin, { cast: false });
    this.mesh(tiles, M.rooftiles);

    // Landmark name signs
    for (const [id, lm] of Object.entries(L.landmarks)) {
      if (id === 'home') continue;
      const b = L.buildingById[lm.buildingId];
      this.addSign(b, lm.name.toUpperCase(), { bg: '#0f1318', fg: lm.color, sub: null, key: `lm_${id}` });
    }
  }

  buildHouse(b, solid, win, tiles) {
    const base = 0.15;
    const wallH = b.h - 2.4;
    const c = b.tint;
    solid.box(b.x, base, b.z, b.w, wallH, b.d, c);
    // foundation
    solid.box(b.x, base, b.z, b.w + 0.3, 0.5, b.d + 0.3, [0.45, 0.44, 0.42], { top: false });
    // gable roof, ridge along x
    const rc = b.roofTint, y0 = base + wallH, rh = 2.6, o = 0.5;
    const x0 = b.x - b.w / 2 - o, x1 = b.x + b.w / 2 + o, z0 = b.z - b.d / 2 - o, z1 = b.z + b.d / 2 + o;
    const ny = (b.d / 2 + o), nz = rh;
    const l = Math.hypot(ny, nz);
    const tu = (x1 - x0) / TS.rooftiles, tv = l / TS.rooftiles;
    const rt = [rc[0] * 2.2, rc[1] * 2.2, rc[2] * 2.2];
    tiles.quad([x0, y0, z1], [x1, y0, z1], [x1, y0 + rh, b.z], [x0, y0 + rh, b.z], [0, ny / l, nz / l], [[0, 0], [tu, 0], [tu, tv], [0, tv]], rt);
    tiles.quad([x1, y0, z0], [x0, y0, z0], [x0, y0 + rh, b.z], [x1, y0 + rh, b.z], [0, ny / l, -nz / l], [[0, 0], [tu, 0], [tu, tv], [0, tv]], rt);
    solid.tri([b.x - b.w / 2, y0, b.z - b.d / 2], [b.x - b.w / 2, y0, b.z + b.d / 2], [b.x - b.w / 2, y0 + rh - 0.1, b.z], c);
    solid.tri([b.x + b.w / 2, y0, b.z + b.d / 2], [b.x + b.w / 2, y0, b.z - b.d / 2], [b.x + b.w / 2, y0 + rh - 0.1, b.z], c);
    // chimney
    solid.box(b.x + b.w * 0.25, y0 + 0.5, b.z + b.d * 0.1, 0.9, rh + 0.6, 0.9, [0.5, 0.3, 0.25]);
    // door & windows
    const front = b.face === 'N' ? -1 : 1;
    const fz = b.z + front * (b.d / 2 + 0.03);
    solid.box(b.x - b.w * 0.15, base, fz, 1.1, 2.2, 0.08, [0.25, 0.16, 0.1]);
    const winQuad = (cx, cy, cz, w, h, nx, nz) => {
      if (nz !== 0) {
        const z = cz;
        if (nz > 0) win.quad([cx - w / 2, cy, z], [cx + w / 2, cy, z], [cx + w / 2, cy + h, z], [cx - w / 2, cy + h, z], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        else win.quad([cx + w / 2, cy, z], [cx - w / 2, cy, z], [cx - w / 2, cy + h, z], [cx + w / 2, cy + h, z], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      } else {
        const x = cx;
        if (nx > 0) win.quad([x, cy, cz + w / 2], [x, cy, cz - w / 2], [x, cy + h, cz - w / 2], [x, cy + h, cz + w / 2], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        else win.quad([x, cy, cz - w / 2], [x, cy, cz + w / 2], [x, cy + h, cz + w / 2], [x, cy + h, cz - w / 2], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    };
    for (const s of [1, -1]) {
      const z = b.z + s * (b.d / 2 + 0.02);
      winQuad(b.x + b.w * 0.22, base + 1.0, z, 1.6, 1.3, 0, s);
      winQuad(b.x - b.w * 0.25, base + 2.6 + (s === front ? 0 : -1.6), z, 1.4, 1.2, 0, s);
      winQuad(b.x + s * b.w * 0.05, base + 2.7, z, 1.3, 1.1, 0, s);
      const x = b.x + s * (b.w / 2 + 0.02);
      winQuad(x, base + 1.2, b.z, 1.4, 1.2, s, 0);
    }
  }

  waterTower(solid, x, y, z) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid.box(x + dx * 1.2, y, z + dz * 1.2, 0.2, 3, 0.2, [0.3, 0.25, 0.2]);
    solid.cylinder(x, y + 3, z, 1.9, 3.6, [0.48, 0.36, 0.26], 12);
    // cone cap approximated
    solid.cylinder(x, y + 6.6, z, 1.3, 0.5, [0.35, 0.28, 0.22], 12);
  }

  buildCityHall(b, solid, metal, lights) {
    const base = 0.15;
    const fz = b.z - b.d / 2;
    const stone = [0.92, 0.9, 0.84];
    for (let k = 0; k < 4; k++) solid.box(b.x, base + k * 0.3, fz - 6 + k * 1.1, 36 - k * 1.2, 0.3, 2.4 + (3 - k) * 0.1, [0.8, 0.79, 0.75]);
    for (let k = 0; k < 8; k++) solid.cylinder(b.x - 15.75 + k * 4.5, base + 1.2, fz - 3.2, 0.75, 12, stone, 14, false);
    solid.box(b.x, base + 13.2, fz - 3.2, 36, 1.8, 5.2, stone);
    // pediment
    const y0 = base + 15, x0 = b.x - 18, x1 = b.x + 18, zf = fz - 5.8, zb = fz - 0.6;
    solid.tri([x1, y0, zf], [x0, y0, zf], [b.x, y0 + 5, zf], stone);
    const l = Math.hypot(18, 5);
    solid.quad([x0, y0, zf], [x0, y0, zb], [b.x, y0 + 5, zb], [b.x, y0 + 5, zf], [-5 / l, 18 / l, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.55, 0.6, 0.58]);
    solid.quad([b.x, y0 + 5, zf], [b.x, y0 + 5, zb], [x1, y0, zb], [x1, y0, zf], [5 / l, 18 / l, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.55, 0.6, 0.58]);
    // drum + dome
    solid.cylinder(b.x, b.h + base, b.z, 9, 6, stone, 24);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f9c8a, roughness: 0.35, metalness: 0.7 }));
    dome.position.set(b.x, b.h + base + 6, b.z);
    dome.castShadow = this.gfx.q.shadows;
    this.group.add(dome);
    metal.box(b.x, b.h + base + 15, b.z, 0.25, 6, 0.25, [0.8, 0.8, 0.8]);
    // flag
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshStandardMaterial({ color: 0x1d4f91, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(b.x + 1.6, b.h + base + 20, b.z);
    this.group.add(flag);
    this.animated.push((t) => { flag.rotation.y = Math.sin(t * 2) * 0.25; });
  }

  addSign(b, text, { bg = '#111', fg = '#fff', key, sub = null, height } = {}) {
    if (this.signs.has(key)) { this.group.remove(this.signs.get(key)); this.signs.get(key).geometry.dispose(); }
    const tex = makeTextTexture(text, { bg, fg, sub, border: fg });
    const w = Math.min(b.w * 0.8, 16);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 });
    this.gfx.registerNightMaterial(mat, 0.6, 2.2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), mat);
    const y = height ?? (b.kind === 'house' ? 3 : 6.2);
    const off = 0.4;
    if (b.face === 'N') { m.position.set(b.x, y, b.z - b.d / 2 - off); m.rotation.y = Math.PI; }
    else if (b.face === 'S') { m.position.set(b.x, y, b.z + b.d / 2 + off); }
    else if (b.face === 'E') { m.position.set(b.x + b.w / 2 + off, y, b.z); m.rotation.y = Math.PI / 2; }
    else { m.position.set(b.x - b.w / 2 - off, y, b.z); m.rotation.y = -Math.PI / 2; }
    this.group.add(m);
    this.signs.set(key, m);
    return m;
  }
  removeSign(key) {
    const m = this.signs.get(key);
    if (m) { this.group.remove(m); m.geometry.dispose(); m.material.map?.dispose(); this.signs.delete(key); }
  }

  // -------------------------------------------------------------- props
  instanced(geo, mat, count, { cast = true, receive = true } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    m.count = count;
    m.castShadow = cast && this.gfx.q.shadows;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  buildProps() {
    const { L, rng } = this;
    const dummy = new THREE.Object3D();
    const base = 0.15;
    // ---- trees (leaf-card foliage)
    const kit = makeTreeKit(this.gfx.q.shadows);
    const groups = { round: [], pine: [], palm: [] };
    for (const t of L.trees) groups[t.kind].push(t);
    const col = new THREE.Color();
    const tints = { round: [0xffffff, 0xe8f0d8, 0xf4ffe6, 0xdfe8c8, 0xfff2d8], pine: [0xffffff, 0xe6efe6], palm: [0xffffff, 0xeef5dc] };
    for (const kind of ['round', 'pine', 'palm']) {
      const list = groups[kind];
      if (!list.length) continue;
      const wood = this.instanced(kit[kind].wood, kit.barkMat, list.length);
      const leaves = this.instanced(kit[kind].leaves, kit.leafMat(kind), list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, base, t.z);
        dummy.rotation.set(0, rng.float(0, 6.28), 0);
        const sc = t.s * (kind === 'palm' ? 1 : 0.9);
        dummy.scale.set(sc, sc * rng.float(0.9, 1.15), sc);
        dummy.updateMatrix();
        wood.setMatrixAt(i, dummy.matrix);
        leaves.setMatrixAt(i, dummy.matrix);
        col.setHex(rng.pick(tints[kind])).multiplyScalar(rng.float(0.8, 1.05));
        leaves.setColorAt(i, col);
        this.col.addCircle(t.x, t.z, 0.35 * t.s, 6, null);
      });
    }
    // ---- street lamps
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7.2, 6); poleGeo.translate(0, 3.6, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.8); armGeo.translate(0, 7.1, 0.85);
    const pole = mergeSimple([poleGeo, armGeo]);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.7 });
    const poles = this.instanced(pole, poleMat, L.lamps.length);
    const headGeo = new THREE.BoxGeometry(0.42, 0.14, 0.7); headGeo.translate(0, 6.98, 1.65);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    this.gfx.registerNightBasic(headMat, 0.6, 6);
    const heads = this.instanced(headGeo, headMat, L.lamps.length, { cast: false, receive: false });
    const poolGeo = new THREE.PlaneGeometry(13, 13); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,214,150,0.9)', 'rgba(255,190,110,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    this.gfx.registerNightOpacity(poolMat, 0.5);
    const pools = this.instanced(poolGeo, poolMat, L.lamps.length, { cast: false, receive: false });
    L.lamps.forEach((l, i) => {
      dummy.position.set(l.x, base, l.z); dummy.rotation.set(0, l.rot, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
      const fx = l.x + Math.sin(l.rot) * 1.65, fz = l.z + Math.cos(l.rot) * 1.65;
      dummy.position.set(fx, 0.03, fz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
      this.col.addCircle(l.x, l.z, 0.18, 8);
    });
    // ---- benches
    const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5); seat.translate(0, 0.45, 0);
    const back = new THREE.BoxGeometry(1.8, 0.45, 0.06); back.translate(0, 0.75, -0.24);
    const leg1 = new THREE.BoxGeometry(0.08, 0.45, 0.45); leg1.translate(-0.8, 0.22, 0);
    const leg2 = leg1.clone(); leg2.translate(1.6, 0, 0);
    const bench = this.instanced(mergeSimple([seat, back, leg1, leg2]), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 }), L.benches.length);
    L.benches.forEach((b, i) => { dummy.position.set(b.x, base, b.z); dummy.rotation.set(0, b.rot, 0); dummy.updateMatrix(); bench.setMatrixAt(i, dummy.matrix); });
    // ---- hydrants
    const hyd = new THREE.CylinderGeometry(0.14, 0.17, 0.75, 8); hyd.translate(0, 0.37, 0);
    const hm = this.instanced(hyd, new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }), L.hydrants.length);
    L.hydrants.forEach((h, i) => { dummy.position.set(h.x, base, h.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); hm.setMatrixAt(i, dummy.matrix); this.col.addCircle(h.x, h.z, 0.2, 1); });
    // ---- bushes
    const bushGeo = new THREE.IcosahedronGeometry(0.9, 0); bushGeo.translate(0, 0.6, 0);
    const bm = this.instanced(bushGeo, new THREE.MeshStandardMaterial({ color: 0x41702f, roughness: 0.9, flatShading: true }), L.bushes.length);
    L.bushes.forEach((b, i) => { dummy.position.set(b.x, base, b.z); dummy.scale.set(1.2, 1, 1.2); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix); });
    dummy.scale.set(1, 1, 1);

    // ---- traffic signals: 4 poles per intersection, one head each
    const R2 = CITY.ROAD / 2 + 0.9;
    const sp = new THREE.CylinderGeometry(0.1, 0.12, 4.4, 6); sp.translate(0, 2.2, 0);
    const sh = new THREE.BoxGeometry(0.38, 1.1, 0.32); sh.translate(0, 4.3, 0);
    const sigPoles = this.instanced(mergeSimple([sp, sh]), poleMat, L.signals.length * 4);
    const lampGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.gfx.registerNightBasic(lampMat, 2.0, 4.5);
    const sigLamps = this.instanced(lampGeo, lampMat, L.signals.length * 4, { cast: false, receive: false });
    this.signalLamps = sigLamps;
    this.signalLampAxis = [];
    const corners = [
      { dx: 1, dz: 1, face: 0, axis: 'z' }, // SE faces +z (south)
      { dx: -1, dz: -1, face: Math.PI, axis: 'z' }, // NW faces -z
      { dx: 1, dz: -1, face: Math.PI / 2, axis: 'x' }, // NE faces +x
      { dx: -1, dz: 1, face: -Math.PI / 2, axis: 'x' }, // SW faces -x
    ];
    let k = 0;
    for (const s of L.signals) {
      for (const c of corners) {
        const x = s.x + c.dx * R2, z = s.z + c.dz * R2;
        dummy.position.set(x, base, z); dummy.rotation.set(0, c.face, 0); dummy.updateMatrix();
        sigPoles.setMatrixAt(k, dummy.matrix);
        dummy.position.set(x + Math.sin(c.face) * 0.18, base + 4.3, z + Math.cos(c.face) * 0.18); dummy.updateMatrix();
        sigLamps.setMatrixAt(k, dummy.matrix);
        sigLamps.setColorAt(k, new THREE.Color(0x30ff60));
        this.signalLampAxis.push(c.axis);
        this.col.addCircle(x, z, 0.2, 5);
        k++;
      }
    }

    // ---- fountains & ponds
    for (const f of L.fountains) {
      const g = new GeoBatch();
      const R = f.big ? 7 : 5;
      g.cylinder(f.x, base, f.z, R, 0.7, [0.75, 0.74, 0.7], 24);
      g.cylinder(f.x, base, f.z, 0.8, 2.6, [0.75, 0.74, 0.7], 12);
      g.cylinder(f.x, base + 2.0, f.z, 2.0, 0.3, [0.75, 0.74, 0.7], 16);
      this.mesh(g, this.M.solid);
      const w = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 24), this.M.pond);
      w.rotation.x = -Math.PI / 2; w.position.set(f.x, base + 0.6, f.z);
      this.group.add(w);
      this.col.addCircle(f.x, f.z, R, 0.8);
    }
    for (const p of L.ponds) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), this.M.pond);
      w.rotation.x = -Math.PI / 2; w.position.set(p.x, base + 0.02, p.z);
      this.group.add(w);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.35, 6, 40), new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 0.9 }));
      rim.rotation.x = -Math.PI / 2; rim.position.set(p.x, base + 0.05, p.z);
      this.group.add(rim);
      this.col.addCircle(p.x, p.z, p.r, 0.5);
    }
  }

  buildHarbour() {
    const { L } = this;
    const dummy = new THREE.Object3D();
    // containers
    let n = 0;
    for (const c of L.containers) n += c.stack;
    const cg = new THREE.BoxGeometry(6.06, 2.59, 2.44); cg.translate(0, 1.3, 0);
    const ct = facadeTextures('industrial').map;
    const cm = this.instanced(cg, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6, metalness: 0.4 }), n);
    let i = 0;
    const color = new THREE.Color();
    for (const c of L.containers) {
      for (let s = 0; s < c.stack; s++) {
        dummy.position.set(c.x, 0.15 + s * 2.6, c.z); dummy.rotation.set(0, c.rot, 0); dummy.updateMatrix();
        cm.setMatrixAt(i, dummy.matrix);
        color.setHex(CONTAINER_COLORS[(c.color + s) % CONTAINER_COLORS.length]).multiplyScalar(1.6);
        cm.setColorAt(i, color);
        i++;
      }
      const hw = c.rot ? 1.25 : 3.05, hd = c.rot ? 3.05 : 1.25;
      this.col.addBox(c.x - hw, c.z - hd, c.x + hw, c.z + hd, c.stack * 2.6);
    }
    // cranes
    const g = new GeoBatch();
    const orange = [0.85, 0.42, 0.1];
    for (const c of L.cranes) {
      for (const dx of [-5, 5]) for (const dz of [-4, 4]) { g.box(c.x + dx, 0.15, c.z + dz, 0.9, 34, 0.9, orange); this.col.addBox(c.x + dx - 0.5, c.z + dz - 0.5, c.x + dx + 0.5, c.z + dz + 0.5, 34); }
      g.box(c.x, 34, c.z, 12, 2.2, 10, orange);
      g.box(c.x, 36.2, c.z + 14, 2.2, 1.6, 52, orange);
      g.box(c.x, 36.2, c.z - 10, 2.2, 1.6, 10, [0.3, 0.3, 0.3]);
      g.box(c.x, 37.8, c.z - 2, 4, 3, 4, [0.9, 0.9, 0.88]);
    }
    this.mesh(g, this.M.metal);
    // piers
    const pg = new GeoBatch();
    for (const p of L.piers) {
      pg.box(p.x, -0.4, p.z, p.w, 0.55, p.d, [0.42, 0.33, 0.25]);
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) pg.box(p.x + s * (p.w / 2 - 0.4), -3, p.z - p.d / 2 + 4 + k * ((p.d - 8) / 5), 0.6, 3, 0.6, [0.3, 0.24, 0.18]);
      // railings
      pg.box(p.x - p.w / 2 + 0.1, 0.15, p.z, 0.15, 1.0, p.d, [0.55, 0.55, 0.55]);
      pg.box(p.x + p.w / 2 - 0.1, 0.15, p.z, 0.15, 1.0, p.d, [0.55, 0.55, 0.55]);
      pg.box(p.x, 0.15, p.z + p.d / 2 - 0.1, p.w, 1.0, 0.15, [0.55, 0.55, 0.55]);
    }
    this.mesh(pg, this.M.planks);
    // ships moored offshore
    for (let k = 0; k < 2; k++) this.buildShip(roadX(7) + 40 + k * 110, CITY.SHORE_Z + 22, k);
    // boats at piers
    for (const p of L.piers) this.buildBoat(p.x + p.w / 2 + 4, p.z + 10);
  }

  buildShip(x, z, k) {
    const g = new GeoBatch();
    g.box(x, -1.5, z, 90, 9, 18, [0.15, 0.2, 0.3]);
    g.box(x, 7.5, z, 90, 0.6, 18, [0.6, 0.15, 0.12]);
    g.box(x - 34, 8, z, 14, 14, 15, [0.92, 0.92, 0.9]);
    g.box(x - 34, 22, z, 10, 2, 13, [0.25, 0.25, 0.28]);
    const n = 9;
    for (let i = 0; i < n; i++) for (let s = 0; s < 3; s++) for (const dz of [-5, 0, 5]) {
      if (this.rng.chance(0.15)) continue;
      const c = new THREE.Color(CONTAINER_COLORS[this.rng.int(0, 5)]);
      g.box(x - 22 + i * 6.3, 8.1 + s * 2.6, z + dz, 6, 2.5, 2.4, [c.r * 1.3, c.g * 1.3, c.b * 1.3]);
    }
    this.mesh(g, this.M.solid);
    this.col.addBox(x - 45, z - 9, x + 45, z + 9, 30);
  }

  buildBoat(x, z) {
    const g = new GeoBatch();
    g.box(x, -1.0, z, 3, 1.4, 10, [0.95, 0.95, 0.95]);
    g.box(x, 0.4, z - 1, 2.2, 1.4, 3.5, [0.85, 0.88, 0.9]);
    const m = this.mesh(g, this.M.solid);
    if (m) {
      m.matrixAutoUpdate = true;
      const ph = this.rng.float(0, 6);
      this.animated.push((t) => { m.position.y = Math.sin(t * 1.3 + ph) * 0.15; m.rotation.z = Math.sin(t * 0.9 + ph) * 0.01; });
    }
  }

  buildParked() {
    const { L } = this;
    const dummy = new THREE.Object3D();
    const byModel = {};
    const models = ['sedan', 'hatch', 'suv', 'sedan', 'hatch', 'van', 'sports'];
    for (const p of L.parked) {
      const m = p.showroom ? this.rng.pick(['sports', 'suv', 'sedan']) : this.rng.pick(models);
      (byModel[m] ||= []).push(p);
    }
    const bodyMat = this.carBodyMat;
    const color = new THREE.Color();
    for (const [model, list] of Object.entries(byModel)) {
      const g = carGeometry(model);
      const im = this.instanced(g.body, bodyMat, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.lot ? 0.15 : 0, p.z); dummy.rotation.set(0, p.rot, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        color.setHex(this.rng.pick(CAR_COLORS));
        im.setColorAt(i, color);
        const along = Math.abs(Math.sin(p.rot)) > 0.5; // facing x
        const hl = g.spec.L / 2, hw = g.spec.W / 2;
        if (along) this.col.addBox(p.x - hl, p.z - hw, p.x + hl, p.z + hw, 1.6);
        else this.col.addBox(p.x - hw, p.z - hl, p.x + hw, p.z + hl, 1.6);
      });
    }
  }

  buildBounds() {
    const m = 160;
    const x0 = CITY.X0 - m, x1 = CITY.X0 + CITY.W + m, z0 = CITY.Z0 - m;
    this.col.addBox(x0 - 10, z0 - 10, x1 + 10, z0, 999);
    this.col.addBox(x0 - 10, z0, x0, CITY.SHORE_Z + 10, 999);
    this.col.addBox(x1, z0, x1 + 10, CITY.SHORE_Z + 10, 999);
    // shoreline, with gaps for piers
    const piers = [...this.L.piers].sort((a, b) => a.x - b.x);
    let cur = x0;
    for (const p of piers) {
      this.col.addBox(cur, CITY.SHORE_Z, p.x - p.w / 2, CITY.SHORE_Z + 4, 999);
      this.col.addBox(p.x - p.w / 2 - 1, CITY.SHORE_Z, p.x - p.w / 2, p.z + p.d / 2 + 1, 999);
      this.col.addBox(p.x + p.w / 2, CITY.SHORE_Z, p.x + p.w / 2 + 1, p.z + p.d / 2 + 1, 999);
      this.col.addBox(p.x - p.w / 2, p.z + p.d / 2, p.x + p.w / 2, p.z + p.d / 2 + 1, 999);
      cur = p.x + p.w / 2;
    }
    this.col.addBox(cur, CITY.SHORE_Z, x1, CITY.SHORE_Z + 4, 999);
  }

  update(dt, t) {
    for (const w of this.waterTex) { w.offset.x += dt * 0.004; w.offset.y += dt * 0.0025; }
    for (const a of this.animated) a(t);
  }
}

function mergeSimple(geos) {
  // merge geometries keeping only position+normal (+uv if all have it)
  const parts = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

export { CAR_MODELS };
