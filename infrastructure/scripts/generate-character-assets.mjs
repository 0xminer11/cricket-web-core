/**
 * Generates the TEMPORARY PLACEHOLDER character assets for Module 5 so the whole pipeline
 * (skinned clothing, rigid gear, morph targets, animation, manifest, validation, caching) is
 * exercised without waiting for final art. Output is deterministic: same script, same bytes.
 *
 *   pnpm assets:generate
 *
 * Writes:  apps/web/public/game-assets/{characters,kits,bats,ui}/...   (runtime GLB / SVG)
 *          packages/game-core/src/assets/character-assets.generated.ts (manifest with sizes + SHA-256)
 *
 * Real artwork replaces these by dropping optimized GLBs with the same asset ids (see
 * docs/character-3d/owner-asset-guide.md); nothing downstream changes.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import {
  ITEMS,
  LOGICAL_BONES,
  CANONICAL_SKELETON_MAP,
  SKELETON_DEFINITION,
  restPositions,
  HAIR_VISUALS,
  BEARD_VISUALS,
  EQUIPMENT_VISUALS,
  BASE_CHARACTER_ASSETS,
  ANIMATION_CLIP_MAP,
} from '../../packages/game-core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(ROOT, 'apps/web/public/game-assets');
const VERSION = '1';
const rest = restPositions();

// ------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
    1,
  ];
};
const lerp = (a, b, t) => a + (b - a) * t;
const boneIndex = Object.fromEntries(LOGICAL_BONES.map((b, i) => [b, i]));

/** Piecewise-linear skin weights between bones by a coordinate (bones sorted by that coordinate). */
function blend(value, stops) {
  // stops: [[coord, boneLogicalName], ...] ascending in coord
  if (value <= stops[0][0]) return [[stops[0][1], 1]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ba] = stops[i];
    const [b, bb] = stops[i + 1];
    if (value <= b) {
      const t = (value - a) / (b - a);
      return t < 0.001
        ? [[ba, 1]]
        : t > 0.999
          ? [[bb, 1]]
          : [
              [ba, 1 - t],
              [bb, t],
            ];
    }
  }
  return [[stops.at(-1)[1], 1]];
}
const torsoWeights = (y) =>
  blend(y, [
    [rest.hips[1], 'hips'],
    [rest.spine[1], 'spine'],
    [rest.chest[1], 'chest'],
    [rest.upperChest[1], 'upperChest'],
    [rest.neck[1], 'neck'],
  ]);
/** Descending y coordinates (limbs run downward): use negated y so coords ascend. */
const armWeights = (side) => (y) =>
  blend(-y, [
    [-rest[`${side}UpperArm`][1], `${side}UpperArm`],
    [-rest[`${side}LowerArm`][1], `${side}LowerArm`],
    [-rest[`${side}Hand`][1], `${side}Hand`],
  ]);
const legWeights = (side) => (y) =>
  blend(-y, [
    [-rest[`${side}UpperLeg`][1], `${side}UpperLeg`],
    [-rest[`${side}LowerLeg`][1], `${side}LowerLeg`],
    [-rest[`${side}Foot`][1] - 0.02, `${side}Foot`],
  ]);

// ------------------------------------------------------------------------------------------
// geometry builder: a "lathe" is rings of ellipses along a polyline (limbs, torso, domes...)
// ------------------------------------------------------------------------------------------
/**
 * points: [{ p:[x,y,z], rx, rz, w?:[[logicalBone, weight]], m?:{morph:[sx,sz]|n} }]
 * axis 'y': ring in XZ (u=0 at +Z, front); axis 'z': ring in XY (u=0 at +Y).
 * Returns grid-based attribute arrays; seam vertex is duplicated for clean UVs.
 */
function lathe({
  points,
  segments = 18,
  axis = 'y',
  uvScale = [1, 1],
  capEnds = false,
  flip = false,
  sweep = [0, 2 * Math.PI],
}) {
  const rings = points.length;
  const cols = segments + 1;
  const positions = [];
  const uvs = [];
  const joints = [];
  const weights = [];
  const morphNames = new Set(points.flatMap((pt) => Object.keys(pt.m ?? {})));
  const morphs = Object.fromEntries([...morphNames].map((n) => [n, []]));
  const centers = [];
  for (let i = 0; i < rings; i++) {
    const pt = points[i];
    for (let j = 0; j < cols; j++) {
      const th = lerp(sweep[0], sweep[1], j / segments);
      const a = pt.rx * Math.sin(th); // e1 = X
      const b = pt.rz * Math.cos(th); // e2 = Z (or Y)
      const pos =
        axis === 'y'
          ? [pt.p[0] + a, pt.p[1], pt.p[2] + b]
          : [pt.p[0] + a, pt.p[1] + b, pt.p[2]];
      positions.push(pos);
      centers.push(pt.p);
      uvs.push([
        // u grows toward the viewer's right when looking at the outside of the surface, so text
        // drawn on a texture reads correctly (not mirrored) on the back of the jersey.
        (1 - j / segments) * uvScale[0],
        (1 - i / (rings - 1)) * uvScale[1],
      ]);
      for (const name of morphNames) {
        const m = pt.m?.[name];
        const [sx, sz] =
          m === undefined ? [1, 1] : Array.isArray(m) ? m : [m, m];
        const d =
          axis === 'y'
            ? [a * (sx - 1), 0, b * (sz - 1)]
            : [a * (sx - 1), b * (sz - 1), 0];
        morphs[name].push(d);
      }
      const w = pt.w ?? [['root', 1]];
      const jj = [0, 0, 0, 0];
      const ww = [0, 0, 0, 0];
      w.slice(0, 4).forEach(([bone, weight], k) => {
        jj[k] = boneIndex[bone];
        ww[k] = weight;
      });
      joints.push(jj);
      weights.push(ww);
    }
  }
  const idx = [];
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  // Grid normals (central differences, wrapped around the seam).
  const normals = new Array(positions.length);
  const at = (i, j) =>
    positions[
      Math.min(rings - 1, Math.max(0, i)) * cols + ((j + segments) % segments)
    ];
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < cols; j++) {
      const du = sub(at(i, j + 1), at(i, j - 1));
      const dv = sub(at(i + 1, j), at(i - 1, j));
      let n = cross(du, dv);
      const len = Math.hypot(...n) || 1;
      n = n.map((v) => v / len);
      // orient outward from the ring axis
      const c = centers[i * cols + j];
      const out = sub(positions[i * cols + j], c);
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0)
        n = n.map((v) => -v);
      normals[i * cols + j] = n;
    }
  if (capEnds === false) {
    /* open ends are hidden inside other parts / closed by zero radius */
  }
  return { positions, normals, uvs, joints, weights, indices: idx, morphs };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Ellipsoid via lathe: poles have zero radius. partial: [phiMin, phiMax] in radians (0 = top pole). */
function ellipsoid({
  c,
  r,
  w,
  rings = 10,
  segments = 18,
  phi = [0, Math.PI],
  axis = 'y',
  m,
  flip = false,
  sweep,
}) {
  const pts = [];
  for (let i = 0; i <= rings; i++) {
    const ph = lerp(phi[0], phi[1], i / rings);
    const rad = Math.sin(ph);
    const y = Math.cos(ph);
    const pos =
      axis === 'y'
        ? [c[0], c[1] + r[1] * y, c[2]]
        : [c[0], c[1], c[2] + r[2] * y];
    pts.push({
      p: pos,
      rx: r[0] * rad,
      rz: axis === 'y' ? r[2] * rad : r[1] * rad,
      w: typeof w === 'function' ? w(pos) : w,
      m: m?.(i / rings, pos),
    });
  }
  return lathe({
    points: pts,
    segments,
    axis,
    flip,
    ...(sweep ? { sweep } : {}),
  });
}

/** Merge several lathe results into one primitive. */
function merge(parts) {
  const out = {
    positions: [],
    normals: [],
    uvs: [],
    joints: [],
    weights: [],
    indices: [],
    morphs: {},
  };
  const morphNames = new Set(parts.flatMap((p) => Object.keys(p.morphs)));
  for (const n of morphNames) out.morphs[n] = [];
  for (const part of parts) {
    const base = out.positions.length;
    out.positions.push(...part.positions);
    out.normals.push(...part.normals);
    out.uvs.push(...part.uvs);
    out.joints.push(...part.joints);
    out.weights.push(...part.weights);
    out.indices.push(...part.indices.map((i) => i + base));
    for (const n of morphNames)
      out.morphs[n].push(
        ...(part.morphs[n] ?? part.positions.map(() => [0, 0, 0])),
      );
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// glTF document helpers
// ------------------------------------------------------------------------------------------
function newDoc(name) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'the-cricketer placeholder generator';
  doc.getRoot().getAsset().copyright =
    'TEMPORARY PLACEHOLDER (generated, no third-party content)';
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  return { doc, buffer, scene, materials: new Map() };
}
function material(ctx, name, color, { rough = 0.7, metal = 0 } = {}) {
  let m = ctx.materials.get(name);
  if (!m) {
    m = ctx.doc
      .createMaterial(name)
      .setBaseColorFactor(hex(color))
      .setRoughnessFactor(rough)
      .setMetallicFactor(metal);
    ctx.materials.set(name, m);
  }
  return m;
}
const flat = (arr) => new Float32Array(arr.flat());
function makeMesh(ctx, name, geom, mat, { skinned = true } = {}) {
  const { doc, buffer } = ctx;
  const acc = (type, array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', flat(geom.positions)))
    .setAttribute('NORMAL', acc('VEC3', flat(geom.normals)))
    .setAttribute('TEXCOORD_0', acc('VEC2', flat(geom.uvs)))
    .setIndices(acc('SCALAR', new Uint16Array(geom.indices)))
    .setMaterial(mat);
  if (skinned) {
    prim.setAttribute(
      'JOINTS_0',
      acc('VEC4', new Uint16Array(geom.joints.flat())),
    );
    prim.setAttribute('WEIGHTS_0', acc('VEC4', flat(geom.weights)));
  }
  const mesh = doc.createMesh(name).addPrimitive(prim);
  return { mesh, prim, acc };
}
/** Add morph targets (name -> per-vertex deltas) to a primitive. */
function addMorphs(ctx, mesh, prim, geom, acc) {
  const names = Object.keys(geom.morphs);
  for (const n of names) {
    const target = ctx.doc
      .createPrimitiveTarget(n)
      .setAttribute('POSITION', acc('VEC3', flat(geom.morphs[n])));
    prim.addTarget(target);
  }
  if (names.length) {
    mesh.setWeights(names.map(() => 0));
    mesh.setExtras({ targetNames: names });
  }
}
/** Bone nodes in canonical order; returns { nodes, skin }. Mirrors the skeleton of the base GLB. */
function addSkeleton(ctx) {
  const { doc, buffer, scene } = ctx;
  const nodes = {};
  for (const def of SKELETON_DEFINITION) {
    const node = doc
      .createNode(CANONICAL_SKELETON_MAP[def.bone])
      .setTranslation(def.offset);
    nodes[def.bone] = node;
    if (def.parent) nodes[def.parent].addChild(node);
    else scene.addChild(node);
  }
  const ibm = new Float32Array(LOGICAL_BONES.length * 16);
  LOGICAL_BONES.forEach((b, i) => {
    const [x, y, z] = rest[b];
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], i * 16);
  });
  const skin = doc
    .createSkin('CricketerSkin')
    .setSkeleton(nodes.root)
    .setInverseBindMatrices(
      doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer),
    );
  for (const b of LOGICAL_BONES) skin.addJoint(nodes[b]);
  return { nodes, skin };
}
const MORPH_ORDER = [
  'build_lean',
  'build_sturdy',
  'face_wide',
  'face_narrow',
  'jaw_strong',
];
/** Every skinned piece (body and clothing) declares the same morph list so one weight set drives all. */
function skinnedPart(ctx, skin, name, geom, mat) {
  const full = {
    ...geom,
    morphs: Object.fromEntries(
      MORPH_ORDER.map((n) => [
        n,
        geom.morphs[n] ?? geom.positions.map(() => [0, 0, 0]),
      ]),
    ),
  };
  const { mesh, prim, acc } = makeMesh(ctx, name, full, mat);
  addMorphs(ctx, mesh, prim, full, acc);
  return addSkinnedNode(ctx, skin, name, mesh);
}
function addSkinnedNode(ctx, skin, name, mesh) {
  const node = ctx.doc.createNode(name).setMesh(mesh).setSkin(skin);
  ctx.scene.addChild(node);
  return node;
}

// ------------------------------------------------------------------------------------------
// BASE CHARACTER
// ------------------------------------------------------------------------------------------
const BUILD = { build_lean: 0.88, build_sturdy: 1.14 };
const buildMorph = () => ({
  build_lean: BUILD.build_lean,
  build_sturdy: BUILD.build_sturdy,
});

function torsoPoints(grow = 0, y0 = 0.88, y1 = 1.5, profile) {
  const prof = profile ?? [
    [0.88, 0.165, 0.105],
    [1.02, 0.145, 0.095],
    [1.18, 0.165, 0.105],
    [1.32, 0.185, 0.11],
    [1.42, 0.165, 0.1],
    [1.5, 0.06, 0.06],
  ];
  return prof
    .filter(([y]) => y >= y0 - 1e-6 && y <= y1 + 1e-6)
    .map(([y, rx, rz]) => ({
      p: [0, y, 0],
      rx: rx + grow,
      rz: rz + grow,
      w: torsoWeights(y),
      m: buildMorph(),
    }));
}
function tube(
  side,
  k,
  {
    x,
    yTop,
    yBottom,
    rTop,
    rBottom,
    rings = 7,
    weights,
    grow = 0,
    zc = 0,
    morph = true,
  },
) {
  const pts = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const y = lerp(yTop, yBottom, t);
    const r = lerp(rTop, rBottom, t) + grow;
    pts.push({
      p: [x * k, y, zc],
      rx: r,
      rz: r,
      w: weights(y),
      m: morph ? buildMorph() : undefined,
    });
  }
  return lathe({ points: pts, segments: 14 });
}

function buildBase() {
  const ctx = newDoc('player_base');
  const { doc, scene } = ctx;
  const skinMat = material(ctx, 'Skin', '#b9805a', { rough: 0.62 });
  const { nodes, skin } = addSkeleton(ctx);

  const parts = {};
  parts.Body_Torso = lathe({ points: torsoPoints(0), segments: 20 });

  // Head: neck + head ellipsoid with face morphs
  const neck = lathe({
    points: [
      { p: [0, 1.46, 0], rx: 0.055, rz: 0.055, w: [['neck', 1]] },
      { p: [0, 1.58, 0], rx: 0.05, rz: 0.052, w: [['head', 1]] },
    ],
    segments: 12,
  });
  const faceM = (t) => {
    // t: 0 top pole .. 1 bottom pole
    const low = Math.max(0, (t - 0.5) / 0.5);
    return {
      face_wide: [1.12, 1],
      face_narrow: [0.9, 1],
      jaw_strong: [1 + 0.1 * low, 1 + 0.06 * low],
    };
  };
  const head = ellipsoid({
    c: [0, 1.68, 0.005],
    r: [0.095, 0.115, 0.105],
    w: [['head', 1]],
    rings: 14,
    segments: 20,
    m: faceM,
  });
  parts.Body_Head = merge([neck, head]);

  const arms = [];
  const hands = [];
  const legs = [];
  const feet = [];
  for (const [side, k] of [
    ['left', 1],
    ['right', -1],
  ]) {
    const sh = rest[`${side}UpperArm`];
    arms.push(
      tube(side, k, {
        x: Math.abs(sh[0]),
        yTop: sh[1] + 0.02,
        yBottom: rest[`${side}Hand`][1] + 0.03,
        rTop: 0.055,
        rBottom: 0.036,
        rings: 9,
        weights: armWeights(side),
      }),
    );
    const hp = rest[`${side}Hand`];
    hands.push(
      ellipsoid({
        c: [hp[0], hp[1] - 0.05, 0.005],
        r: [0.034, 0.065, 0.026],
        w: [[`${side}Hand`, 1]],
        rings: 8,
        segments: 12,
        m: () => buildMorph(),
      }),
    );
    const ul = rest[`${side}UpperLeg`];
    legs.push(
      tube(side, k, {
        x: Math.abs(ul[0]),
        yTop: ul[1] + 0.03,
        yBottom: rest[`${side}Foot`][1] + 0.05,
        rTop: 0.09,
        rBottom: 0.045,
        rings: 10,
        weights: legWeights(side),
      }),
    );
    const ft = rest[`${side}Foot`];
    feet.push(
      ellipsoid({
        c: [ft[0], 0.04, 0.055],
        r: [0.042, 0.042, 0.115],
        axis: 'z',
        w: (pos) =>
          pos[2] > 0.11 ? [[`${side}Toe`, 1]] : [[`${side}Foot`, 1]],
        rings: 8,
        segments: 12,
        m: () => buildMorph(),
      }),
    );
  }
  parts.Body_Arms = merge(arms);
  parts.Body_Hands = merge(hands);
  parts.Body_Legs = merge(legs);
  parts.Body_Feet = merge(feet);

  for (const [name, geom] of Object.entries(parts))
    skinnedPart(ctx, skin, name, geom, skinMat);

  animations(ctx, nodes);
  return { doc, scene, nodes };
}

// ------------------------------------------------------------------------------------------
// ANIMATIONS (placeholder poses; real clips replace them with the same names)
// ------------------------------------------------------------------------------------------
function quatFromEuler([x, y, z]) {
  const c1 = Math.cos(x / 2),
    c2 = Math.cos(y / 2),
    c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2),
    s2 = Math.sin(y / 2),
    s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
const mirrorBone = (b) =>
  b.startsWith('left')
    ? 'right' + b.slice(4)
    : b.startsWith('right')
      ? 'left' + b.slice(5)
      : b;
const mirrorEuler = ([x, y, z]) => [x, -y, -z];

function addClip(ctx, nodes, name, duration, keys, { mirrored = false } = {}) {
  const { doc, buffer } = ctx;
  const anim = doc.createAnimation(name);
  const bones = new Set(keys.flatMap((k) => Object.keys(k.rot ?? {})));
  const times = new Float32Array(keys.map((k) => k.t * duration));
  const timeAcc = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(times)
    .setBuffer(buffer);
  for (const bone of bones) {
    const target = mirrored ? mirrorBone(bone) : bone;
    const vals = new Float32Array(
      keys.flatMap((k) =>
        quatFromEuler(
          mirrored
            ? mirrorEuler(k.rot[bone] ?? [0, 0, 0])
            : (k.rot[bone] ?? [0, 0, 0]),
        ),
      ),
    );
    const sampler = doc
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(
        doc.createAccessor().setType('VEC4').setArray(vals).setBuffer(buffer),
      )
      .setInterpolation('LINEAR');
    anim
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(nodes[target])
          .setTargetPath('rotation')
          .setSampler(sampler),
      );
  }
  if (keys.some((k) => k.hipsY !== undefined)) {
    const base = SKELETON_DEFINITION.find((d) => d.bone === 'hips').offset;
    const vals = new Float32Array(
      keys.flatMap((k) => [
        base[0],
        base[1] + (k.hipsY ?? 0),
        base[2] + (k.hipsZ ?? 0),
      ]),
    );
    const sampler = doc
      .createAnimationSampler()
      .setInput(timeAcc)
      .setOutput(
        doc.createAccessor().setType('VEC3').setArray(vals).setBuffer(buffer),
      )
      .setInterpolation('LINEAR');
    anim
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(nodes.hips)
          .setTargetPath('translation')
          .setSampler(sampler),
      );
  }
}

function animations(ctx, nodes) {
  const breathe = (a) => ({
    chest: [a, 0, 0],
    upperChest: [a * 0.7, 0, 0],
    head: [-a * 0.5, 0, 0],
  });
  addClip(ctx, nodes, ANIMATION_CLIP_MAP.idle.right, 3, [
    {
      t: 0,
      rot: {
        ...breathe(0),
        leftUpperArm: [0, 0, 0.04],
        rightUpperArm: [0, 0, -0.04],
      },
    },
    {
      t: 0.5,
      rot: {
        ...breathe(0.025),
        leftUpperArm: [0, 0, 0.06],
        rightUpperArm: [0, 0, -0.06],
      },
    },
    {
      t: 1,
      rot: {
        ...breathe(0),
        leftUpperArm: [0, 0, 0.04],
        rightUpperArm: [0, 0, -0.04],
      },
    },
  ]);
  // Bat poses are authored for a RIGHT-handed batter (dominant hand: right) and mirrored for left.
  const holdBat = (lean, crouch) => ({
    spine: [lean, 0, 0],
    chest: [lean * 0.5, 0, 0],
    head: [-lean * 0.8, 0, 0],
    rightUpperArm: [-0.55 - crouch * 0.1, 0, 0.12],
    rightLowerArm: [-1.0, 0, 0],
    leftUpperArm: [-0.5 - crouch * 0.1, 0, -0.28],
    leftLowerArm: [-1.05, 0, 0],
    rightUpperLeg: [-0.1 - crouch, 0, 0.06],
    rightLowerLeg: [0.12 + crouch * 1.5, 0, 0],
    rightFoot: [-0.02 - crouch * 0.5, 0, 0],
    leftUpperLeg: [-0.1 - crouch, 0, -0.06],
    leftLowerLeg: [0.12 + crouch * 1.5, 0, 0],
    leftFoot: [-0.02 - crouch * 0.5, 0, 0],
  });
  for (const [logical, lean, crouch, hips] of [
    ['idle_bat', 0.08, 0.04, -0.015],
    ['batting_stance', 0.28, 0.42, -0.12],
  ]) {
    const k = (a) => ({
      rot: Object.fromEntries(
        Object.entries(holdBat(lean, crouch)).map(([b, e]) => [
          b,
          b === 'chest' ? [e[0] + a, e[1], e[2]] : e,
        ]),
      ),
      hipsY: hips,
    });
    const keys = [
      { t: 0, ...k(0) },
      { t: 0.5, ...k(0.02) },
      { t: 1, ...k(0) },
    ];
    addClip(ctx, nodes, ANIMATION_CLIP_MAP[logical].right, 3, keys);
    addClip(ctx, nodes, ANIMATION_CLIP_MAP[logical].left, 3, keys, {
      mirrored: true,
    });
  }
}

// ------------------------------------------------------------------------------------------
// CLOTHING (skinned onto the shared skeleton)
// ------------------------------------------------------------------------------------------
function clothingDoc(name, build) {
  const ctx = newDoc(name);
  const { skin } = addSkeleton(ctx);
  build(ctx, skin);
  return ctx;
}

function buildJersey(colorSet) {
  return clothingDoc('jersey', (ctx, skin) => {
    const body = material(ctx, 'Jersey_Body', colorSet.primary, {
      rough: 0.85,
    });
    const sleeve = material(ctx, 'Jersey_Sleeve', colorSet.primary, {
      rough: 0.85,
    });
    const trim = material(ctx, 'Jersey_Trim', colorSet.accent, { rough: 0.8 });
    const torso = lathe({
      points: torsoPoints(0.018, 1.0, 1.44, [
        [1.0, 0.16, 0.108],
        [1.1, 0.155, 0.103],
        [1.22, 0.172, 0.108],
        [1.34, 0.19, 0.115],
        [1.44, 0.17, 0.105],
      ]),
      segments: 24,
    });
    skinnedPart(ctx, skin, 'Jersey_Body', torso, body);
    const sleeves = merge(
      ['left', 'right'].map((side, i) => {
        const sh = rest[`${side}UpperArm`];
        return tube(side, i === 0 ? 1 : -1, {
          x: Math.abs(sh[0]),
          yTop: sh[1] + 0.035,
          yBottom: sh[1] - 0.2,
          rTop: 0.07,
          rBottom: 0.062,
          rings: 5,
          weights: armWeights(side),
        });
      }),
    );
    skinnedPart(ctx, skin, 'Jersey_Sleeve', sleeves, sleeve);
    const collar = lathe({
      points: [1.43, 1.47].map((y, i) => ({
        p: [0, y, 0],
        rx: 0.068 - i * 0.004,
        rz: 0.07,
        w: torsoWeights(y),
      })),
      segments: 18,
    });
    skinnedPart(ctx, skin, 'Jersey_Collar', collar, trim);
  });
}

function buildPants(color) {
  return clothingDoc('pants', (ctx, skin) => {
    const mat = material(ctx, 'Pants', color, { rough: 0.85 });
    const legs = merge(
      ['left', 'right'].map((side, i) => {
        const ul = rest[`${side}UpperLeg`];
        return tube(side, i === 0 ? 1 : -1, {
          x: Math.abs(ul[0]),
          yTop: 1.0,
          yBottom: rest[`${side}Foot`][1] + 0.07,
          rTop: 0.105,
          rBottom: 0.058,
          rings: 11,
          weights: legWeights(side),
        });
      }),
    );
    const waist = lathe({
      points: [
        [0.88, 0.17, 0.11],
        [1.0, 0.16, 0.105],
        [1.06, 0.152, 0.1],
      ].map(([y, rx, rz]) => ({
        p: [0, y, 0],
        rx,
        rz,
        w: torsoWeights(y),
        m: buildMorph(),
      })),
      segments: 20,
    });
    const g = merge([legs, waist]);
    skinnedPart(ctx, skin, 'Pants', g, mat);
  });
}

function buildShoes({ upper, sole }) {
  return clothingDoc('shoes', (ctx, skin) => {
    const up = material(ctx, 'Shoe_Upper', upper, { rough: 0.7 });
    const so = material(ctx, 'Shoe_Sole', sole, { rough: 0.9 });
    const uppers = [];
    const soles = [];
    for (const side of ['left', 'right']) {
      const ft = rest[`${side}Foot`];
      const w = (pos) =>
        pos[2] > 0.11 ? [[`${side}Toe`, 1]] : [[`${side}Foot`, 1]];
      uppers.push(
        ellipsoid({
          c: [ft[0], 0.052, 0.05],
          r: [0.052, 0.05, 0.13],
          axis: 'z',
          w,
          rings: 8,
          segments: 14,
          m: () => buildMorph(),
        }),
      );
      soles.push(
        ellipsoid({
          c: [ft[0], 0.012, 0.055],
          r: [0.056, 0.014, 0.135],
          axis: 'z',
          w,
          rings: 6,
          segments: 14,
          m: () => buildMorph(),
        }),
      );
    }
    skinnedPart(ctx, skin, 'Shoe_Upper', merge(uppers), up);
    skinnedPart(ctx, skin, 'Shoe_Sole', merge(soles), so);
  });
}

function buildGloves({ primary, cuff }) {
  return clothingDoc('gloves', (ctx, skin) => {
    const pm = material(ctx, 'Glove_Palm', primary, { rough: 0.75 });
    const cm = material(ctx, 'Glove_Cuff', cuff, { rough: 0.8 });
    const palms = [];
    const cuffs = [];
    for (const side of ['left', 'right']) {
      const hp = rest[`${side}Hand`];
      palms.push(
        ellipsoid({
          c: [hp[0], hp[1] - 0.05, 0.006],
          r: [0.047, 0.075, 0.036],
          w: [[`${side}Hand`, 1]],
          rings: 8,
          segments: 14,
          m: () => buildMorph(),
        }),
      );
      cuffs.push(
        lathe({
          points: [0.05, -0.02].map((dy) => ({
            p: [hp[0], hp[1] + dy, 0],
            rx: 0.048,
            rz: 0.048,
            w: [
              [`${side}LowerArm`, 0.4],
              [`${side}Hand`, 0.6],
            ],
          })),
          segments: 14,
        }),
      );
    }
    skinnedPart(ctx, skin, 'Glove_Palm', merge(palms), pm);
    skinnedPart(ctx, skin, 'Glove_Cuff', merge(cuffs), cm);
  });
}

function buildPads({ body, strap }) {
  return clothingDoc('pads', (ctx, skin) => {
    const bm = material(ctx, 'Pad_Body', body, { rough: 0.75 });
    const sm = material(ctx, 'Pad_Strap', strap, { rough: 0.8 });
    const pads = [];
    const straps = [];
    for (const [side, k] of [
      ['left', 1],
      ['right', -1],
    ]) {
      const ll = rest[`${side}LowerLeg`];
      const x = Math.abs(ll[0]) * k;
      const w = legWeights(side);
      pads.push(
        lathe({
          points: [0.53, 0.46, 0.36, 0.25, 0.14].map((y, i) => ({
            p: [x, y, 0.012],
            rx: 0.088 + (i === 0 ? 0.012 : 0),
            rz: 0.094,
            w: w(y),
            m: buildMorph(),
          })),
          segments: 16,
        }),
      );
      for (const y of [0.4, 0.28])
        straps.push(
          lathe({
            points: [y + 0.012, y - 0.012].map((yy) => ({
              p: [x, yy, 0],
              rx: 0.092,
              rz: 0.098,
              w: w(yy),
              m: buildMorph(),
            })),
            segments: 16,
          }),
        );
    }
    skinnedPart(ctx, skin, 'Pad_Body', merge(pads), bm);
    skinnedPart(ctx, skin, 'Pad_Strap', merge(straps), sm);
  });
}

// ------------------------------------------------------------------------------------------
// RIGID GEAR (authored in the attachment bone's space)
// ------------------------------------------------------------------------------------------
function rigidDoc(name, build) {
  const ctx = newDoc(name);
  build(ctx);
  return ctx;
}
const addRigid = (ctx, name, geom, mat) => {
  const { mesh } = makeMesh(ctx, name, geom, mat, { skinned: false });
  ctx.scene.addChild(ctx.doc.createNode(name).setMesh(mesh));
};
// head bone space: head centre is +0.09 above the Head bone origin
const H = [0, 0.09, 0.005];

function buildHelmet({ shell, grille }) {
  return rigidDoc('helmet', (ctx) => {
    const sm = material(ctx, 'Helmet_Shell', shell, {
      rough: 0.45,
      metal: 0.1,
    });
    const gm = material(ctx, 'Helmet_Grille', grille, {
      rough: 0.4,
      metal: 0.6,
    });
    const dome = ellipsoid({
      c: [H[0], H[1] + 0.012, H[2] - 0.004],
      r: [0.118, 0.118, 0.128],
      phi: [0, 1.82],
      rings: 12,
      segments: 20,
    });
    addRigid(ctx, 'Helmet_Shell', dome, sm);
    const bars = [];
    for (let i = -2; i <= 2; i++)
      bars.push(
        lathe({
          points: [0.05, -0.04].map((dy) => ({
            p: [i * 0.03, H[1] + dy, 0.118 - Math.abs(i) * 0.012],
            rx: 0.004,
            rz: 0.004,
          })),
          segments: 5,
        }),
      );
    for (const dy of [0.04, 0.0, -0.04])
      bars.push(
        lathe({
          points: [-0.07, 0.07].map((dx) => ({
            p: [dx, H[1] + dy, 0.116],
            rx: 0.004,
            rz: 0.004,
          })),
          segments: 5,
          axis: 'y',
        }),
      );
    addRigid(
      ctx,
      'Helmet_Grille',
      merge(bars.map((b) => ({ ...b, normals: b.normals }))),
      gm,
    );
  });
}

function buildHair(style) {
  return rigidDoc('hair_' + style, (ctx) => {
    const m = material(ctx, 'Hair', '#14110f', { rough: 0.8 });
    const cap = (grow, phiMax, c = H, rz = 0.105) =>
      ellipsoid({
        c: [c[0], c[1] + 0.006, c[2] - 0.004],
        r: [0.095 + grow, 0.115 + grow, rz + grow],
        phi: [0, phiMax],
        rings: 10,
        segments: 18,
      });
    // Hair never covers the face: a crown cap stops at the hairline and a back piece fills the
    // nape, so eyes and brow stay visible (and helmets sit on real hair, not a mask).
    const back = (grow) =>
      ellipsoid({
        c: [0, H[1] - 0.005, H[2] - 0.034],
        r: [0.096 + grow, 0.108 + grow, 0.088 + grow],
        phi: [0.2, 2.35],
        rings: 8,
        segments: 18,
      });
    const parts = [];
    switch (style) {
      case 'short_01':
        parts.push(cap(0.01, 1.38), back(0.01));
        break;
      case 'short_02':
        parts.push(cap(0.012, 1.34, [H[0] + 0.006, H[1], H[2]]), back(0.012));
        parts.push(
          ellipsoid({
            c: [H[0] + 0.05, H[1] + 0.1, H[2] + 0.055],
            r: [0.05, 0.03, 0.05],
            rings: 6,
            segments: 10,
          }),
        );
        break;
      case 'buzz_01':
        parts.push(cap(0.004, 1.34), back(0.004));
        break;
      case 'curly_01':
        parts.push(cap(0.012, 1.38), back(0.012));
        for (let i = 0; i < 12; i++) {
          // curls ring the crown and nape, leaving the forehead clear
          const a = Math.PI * 0.55 + (i / 11) * Math.PI * 1.9;
          parts.push(
            ellipsoid({
              c: [
                Math.sin(a) * 0.085,
                H[1] + 0.095 + (i % 2) * 0.012,
                H[2] + Math.cos(a) * 0.09,
              ],
              r: [0.04, 0.04, 0.04],
              rings: 5,
              segments: 8,
            }),
          );
        }
        break;
      case 'long_01':
        parts.push(cap(0.014, 1.4), back(0.014));
        parts.push(
          ellipsoid({
            c: [0, H[1] - 0.09, H[2] - 0.085],
            r: [0.098, 0.2, 0.05],
            rings: 8,
            segments: 14,
          }),
        );
        break;
      case 'mohawk_01':
        parts.push(cap(0.004, 1.1));
        for (let i = 0; i < 7; i++)
          parts.push(
            ellipsoid({
              c: [
                0,
                H[1] + 0.115 + Math.sin((i / 6) * Math.PI) * 0.02,
                H[2] + 0.07 - i * 0.026,
              ],
              r: [0.016, 0.04, 0.02],
              rings: 5,
              segments: 8,
            }),
          );
        break;
      default:
        throw new Error('unknown hair ' + style);
    }
    addRigid(ctx, 'Hair', merge(parts), m);
  });
}

function buildBeard(style) {
  return rigidDoc('beard_' + style, (ctx) => {
    const m = material(ctx, 'Beard', '#14110f', { rough: 0.85 });
    // Only the face side (azimuth 0 = +Z, front) is covered: a full ring reads as a mask.
    const shell = (grow, phi, zs = 0.012, reach = 1.7) =>
      ellipsoid({
        c: [H[0], H[1], H[2] + zs],
        r: [0.095 + grow, 0.115 + grow, 0.105 + grow],
        phi,
        rings: 8,
        segments: 14,
        sweep: [-reach, reach],
      });
    const parts = [];
    switch (style) {
      case 'stubble_01':
        parts.push(shell(0.002, [2.15, 2.85], 0.012, 1.5));
        break;
      case 'short_01':
        parts.push(shell(0.008, [2.1, 2.95], 0.016, 1.6));
        break;
      case 'full_01':
        parts.push(shell(0.016, [1.95, 3.05], 0.022, 1.9));
        break;
      case 'moustache_01':
        for (const s of [-1, 1])
          parts.push(
            ellipsoid({
              c: [s * 0.022, H[1] - 0.045, H[2] + 0.1],
              r: [0.026, 0.011, 0.014],
              rings: 5,
              segments: 8,
            }),
          );
        break;
      case 'goatee_01':
        parts.push(
          ellipsoid({
            c: [0, H[1] - 0.105, H[2] + 0.085],
            r: [0.03, 0.04, 0.025],
            rings: 6,
            segments: 10,
          }),
        );
        parts.push(
          ellipsoid({
            c: [0, H[1] - 0.05, H[2] + 0.1],
            r: [0.045, 0.012, 0.015],
            rings: 5,
            segments: 10,
          }),
        );
        break;
      default:
        throw new Error('unknown beard ' + style);
    }
    addRigid(ctx, 'Beard', merge(parts), m);
  });
}

/** Bat: origin at the grip centre; handle toward +Y, blade toward -Y (documented bat convention). */
function buildBat({ blade, grip }) {
  return rigidDoc('bat', (ctx) => {
    const bm = material(ctx, 'Bat_Blade', blade, { rough: 0.6 });
    const gm = material(ctx, 'Bat_Grip', grip, { rough: 0.9 });
    const handle = lathe({
      points: [0.28, 0.12, 0.0, -0.1, -0.12].map((y) => ({
        p: [0, y, 0],
        rx: 0.0125,
        rz: 0.0125,
      })),
      segments: 10,
    });
    addRigid(ctx, 'Bat_Handle', handle, gm);
    // blade: a flattened tapered ellipsoid-ish lathe
    const bladePts = [
      [-0.1, 0.02],
      [-0.16, 0.05],
      [-0.3, 0.055],
      [-0.5, 0.056],
      [-0.7, 0.054],
      [-0.78, 0.045],
      [-0.8, 0.0],
    ].map(([y, rx]) => ({ p: [0, y, 0], rx, rz: 0.02 }));
    addRigid(ctx, 'Bat_Blade', lathe({ points: bladePts, segments: 14 }), bm);
  });
}

// ------------------------------------------------------------------------------------------
// writing
// ------------------------------------------------------------------------------------------
const manifest = [];
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

async function writeGlb(ctx, relPath, assetId, category, dependencies = []) {
  const doc = ctx.doc ?? ctx;
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.NONE });
  const abs = path.join(PUBLIC, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  const bytes = await io.writeBinary(doc);
  writeFileSync(abs, bytes);
  manifest.push({
    assetId,
    category,
    path: '/game-assets/' + relPath,
    version: VERSION,
    sizeBytes: bytes.length,
    platforms: ['web'],
    compression: 'meshopt',
    dependencies,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const baseId = BASE_CHARACTER_ASSETS.viewer;
const base = buildBase();
await writeGlb(
  base,
  `characters/player_base_v${VERSION}.glb`,
  baseId,
  'character',
);

for (const h of HAIR_VISUALS.filter((v) => v.assetId)) {
  const style = h.assetId.split('.').at(-1);
  await writeGlb(
    buildHair(style),
    `characters/hair/${style}_v${VERSION}.glb`,
    h.assetId,
    'character',
    [baseId],
  );
}
for (const b of BEARD_VISUALS.filter((v) => v.assetId)) {
  const style = b.assetId.split('.').at(-1);
  await writeGlb(
    buildBeard(style),
    `characters/beards/${style}_v${VERSION}.glb`,
    b.assetId,
    'character',
    [baseId],
  );
}

const itemById = new Map(ITEMS.map((i) => [i.id, i]));
for (const v of EQUIPMENT_VISUALS) {
  const item = itemById.get(v.itemId);
  if (!item) throw new Error('visual for unknown item ' + v.itemId);
  const [, , kind, ...rest2] = v.assetId.split('.');
  const name = rest2.join('.');
  const dir = kind === 'bat' ? 'bats' : 'kits';
  const file = `${dir}/${kind}_${name}_v${VERSION}.glb`;
  const cat = kind === 'bat' ? 'bat' : 'kit';
  let ctx;
  switch (kind) {
    case 'bat': {
      const blades = {
        street_willow_01: '#d9b98a',
        backyard_ash_01: '#cfa56f',
        club_edge_01: '#e8c9a0',
        pro_willow_01: '#f0d2a8',
      };
      ctx = buildBat({
        blade: blades[name] ?? '#d9b98a',
        grip: v.defaultColors?.grip ?? '#2b2f36',
      });
      break;
    }
    case 'helmet':
      ctx = buildHelmet({
        shell: v.defaultColors?.primary ?? '#1f6f8b',
        grille: v.defaultColors?.secondary ?? '#9aa4ad',
      });
      break;
    case 'jersey':
      ctx = buildJersey({ primary: v.kit.primary, accent: v.kit.accent });
      break;
    case 'pants':
      ctx = buildPants(v.defaultColors?.primary ?? '#243447');
      break;
    case 'shoes':
      ctx = buildShoes(
        name.startsWith('sprint')
          ? { upper: '#d94f3d', sole: '#1d1d1d' }
          : { upper: '#e8e8e8', sole: '#3a3a3a' },
      );
      break;
    case 'gloves':
      ctx = buildGloves(
        name.startsWith('quick')
          ? { primary: '#27a3c7', cuff: '#111' }
          : { primary: '#e6dccb', cuff: '#1f6f8b' },
      );
      break;
    case 'pads':
      ctx = buildPads(
        name.startsWith('mobile')
          ? { body: '#d8e6ef', strap: '#27a3c7' }
          : { body: '#efe9dc', strap: '#8a6d3b' },
      );
      break;
    default:
      throw new Error('no generator for ' + kind);
  }
  await writeGlb(ctx, file, v.assetId, cat, [baseId]);
}

// ---- icons (simple glyph SVGs, one per item icon id) ----------------------------------------
const RARITY = {
  common: '#9fb3bf',
  uncommon: '#6fcf97',
  rare: '#56ccf2',
  epic: '#bb6bd9',
  legendary: '#f2c94c',
};
const GLYPH = {
  bat: '<rect x="30" y="8" width="8" height="44" rx="2"/><rect x="46" y="52" width="6" height="6"/><rect x="28" y="50" width="12" height="40" rx="5" transform="rotate(0)"/>',
  helmet:
    '<path d="M14 54a26 26 0 0 1 52 0v8H14z"/><path d="M14 62h52M24 62v10M40 62v10M56 62v10" stroke-width="3" fill="none"/>',
  gloves:
    '<rect x="22" y="30" width="36" height="34" rx="10"/><rect x="26" y="14" width="7" height="22" rx="3"/><rect x="36" y="10" width="7" height="26" rx="3"/><rect x="46" y="14" width="7" height="22" rx="3"/>',
  pads: '<rect x="26" y="8" width="28" height="64" rx="12"/><path d="M26 28h28M26 46h28" stroke-width="4" fill="none"/>',
  shoes:
    '<path d="M10 52h40c10 0 20 6 20 14H10z"/><path d="M10 52V30h14v22" />',
  jersey:
    '<path d="M26 10l-16 14 8 10 8-6v44h28V28l8 6 8-10-16-14c-4 6-12 6-20 0z"/>',
  pants: '<path d="M22 8h36l4 64H46L40 32l-6 40H18z"/>',
  grip: '<rect x="30" y="8" width="20" height="64" rx="6"/>',
  sticker: '<circle cx="40" cy="40" r="26"/>',
};
for (const item of ITEMS) {
  const [, , kind, ...n] = item.iconAssetId.split('.');
  const color = RARITY[item.rarity] ?? '#9fb3bf';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="${item.name}"><rect width="80" height="80" rx="14" fill="#1b2b35"/><g fill="${color}" stroke="${color}">${GLYPH[kind] ?? GLYPH.sticker}</g></svg>\n`;
  const rel = `ui/icons/${kind}_${n.join('.')}.svg`;
  const abs = path.join(PUBLIC, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, svg);
  manifest.push({
    assetId: item.iconAssetId,
    category: 'ui',
    path: '/game-assets/' + rel,
    version: VERSION,
    sizeBytes: Buffer.byteLength(svg),
    platforms: ['web'],
    compression: 'none',
    dependencies: [],
    checksumSha256: createHash('sha256').update(svg).digest('hex'),
  });
}

manifest.sort((a, b) => a.assetId.localeCompare(b.assetId));
const ts = `import type { AssetManifestEntry } from './index';
/**
 * GENERATED by \`pnpm assets:generate\` (infrastructure/scripts/generate-character-assets.mjs).
 * TEMPORARY PLACEHOLDER assets: procedurally generated, no third-party content. Replace with
 * final artwork by shipping optimized GLBs under the same asset ids (docs/character-3d).
 * Do not edit by hand: sizes and checksums come from the files on disk.
 */
export const CHARACTER_ASSETS: readonly AssetManifestEntry[] = ${JSON.stringify(manifest, null, 2)};
`;
writeFileSync(
  path.join(
    ROOT,
    'packages/game-core/src/assets/character-assets.generated.ts',
  ),
  ts,
);
console.log(
  `Generated ${manifest.length} assets (${manifest.filter((m) => m.path.endsWith('.glb')).length} GLB) in ${path.relative(ROOT, PUBLIC)}`,
);
