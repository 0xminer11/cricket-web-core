/**
 * Asset validator and size report for every runtime character/equipment asset (Module 5).
 *
 *   pnpm assets:validate
 *
 * Checks the manifest against the files on disk (existence, size, SHA-256), validates each GLB
 * against the character contract (canonical skeleton, skinning, materials, textures, morph
 * targets, animation clips, scale and ground alignment, duplicate bone names), checks that visual
 * definitions, appearance options and item icons all resolve, and prints a size/triangle report.
 * Exits non-zero on any error; budgets only warn.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import {
  EXTMeshoptCompression,
  KHRMeshQuantization,
} from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  ASSET_MANIFEST,
  ANIMATION_CLIP_MAP,
  APPEARANCE_OPTIONS,
  BASE_CHARACTER_ASSETS,
  BASE_MORPH_TARGETS,
  BEARD_VISUALS,
  BODY_VISUALS,
  CANONICAL_SKELETON_MAP,
  CHARACTER_CONVENTIONS,
  DRESSING_ROOM_SLOTS,
  EQUIPMENT_VISUALS,
  FACE_VISUALS,
  HAIR_VISUALS,
  ITEMS,
  LOGICAL_BONES,
  STARTER_LOADOUT,
  validateAssetManifest,
} from '../../packages/game-core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PUBLIC = path.join(ROOT, 'apps/web/public');
/** INITIAL PERFORMANCE BUDGETS (docs/character-3d/performance.md); budgets warn, contracts fail. */
const BUDGET = {
  baseTriangles: 60000,
  hairTriangles: 10000,
  itemTriangles: 6000,
  totalDressedTriangles: 100000,
  fileBytes: 1_500_000,
  materials: 4,
  textureSize: 2048,
};

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const e of validateAssetManifest()) err('manifest', e);

const byId = new Map(ASSET_MANIFEST.map((a) => [a.assetId, a]));
const rows = [];
const stats = new Map();

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

for (const entry of ASSET_MANIFEST) {
  const abs = path.join(PUBLIC, entry.path);
  if (!existsSync(abs)) {
    err(entry.assetId, `file missing: ${entry.path}`);
    continue;
  }
  const bytes = readFileSync(abs);
  if (bytes.length !== entry.sizeBytes)
    err(
      entry.assetId,
      `size ${bytes.length} differs from manifest ${entry.sizeBytes} (run pnpm assets:generate)`,
    );
  if (
    entry.checksumSha256 &&
    createHash('sha256').update(bytes).digest('hex') !== entry.checksumSha256
  )
    err(
      entry.assetId,
      'checksum differs from manifest (stale manifest or edited file)',
    );
  if (bytes.length > BUDGET.fileBytes)
    warn(
      entry.assetId,
      `file is ${kb(bytes.length)} (budget ${kb(BUDGET.fileBytes)})`,
    );
  if (!entry.path.endsWith('.glb')) {
    rows.push({
      id: entry.assetId,
      kind: entry.category,
      size: bytes.length,
      tris: '-',
      mats: '-',
      tex: '-',
    });
    continue;
  }

  let doc;
  try {
    doc = await io.readBinary(new Uint8Array(bytes));
  } catch (error) {
    err(entry.assetId, `not a readable GLB: ${error.message}`);
    continue;
  }
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  let tris = 0;
  for (const mesh of meshes)
    for (const prim of mesh.listPrimitives())
      tris +=
        (prim.getIndices()?.getCount() ??
          prim.getAttribute('POSITION').getCount()) / 3;
  stats.set(entry.assetId, { tris, size: bytes.length });
  rows.push({
    id: entry.assetId,
    kind: entry.category,
    size: bytes.length,
    tris: Math.round(tris),
    mats: materials.length,
    tex: textures.length,
  });

  if (meshes.length === 0) err(entry.assetId, 'contains no meshes');
  if (materials.length === 0)
    err(
      entry.assetId,
      'contains no materials (every primitive needs a named material)',
    );
  if (materials.length > BUDGET.materials)
    warn(
      entry.assetId,
      `${materials.length} materials (budget ${BUDGET.materials}); merge or atlas them`,
    );
  for (const m of materials)
    if (!m.getName())
      err(
        entry.assetId,
        'a material has no name (name materials so they can be addressed)',
      );
  for (const t of textures) {
    if (!t.getImage())
      err(
        entry.assetId,
        `texture "${t.getName()}" has no image data (missing texture)`,
      );
    else {
      const size = t.getSize();
      if (size && Math.max(...size) > BUDGET.textureSize)
        warn(
          entry.assetId,
          `texture ${size.join('x')} exceeds ${BUDGET.textureSize}px`,
        );
    }
  }
  for (const mesh of meshes)
    for (const prim of mesh.listPrimitives())
      if (!prim.getMaterial())
        err(
          entry.assetId,
          `mesh "${mesh.getName()}" has a primitive without a material`,
        );

  const skins = root.listSkins();
  const isBase = entry.assetId === BASE_CHARACTER_ASSETS.viewer;
  const equipmentVisual = EQUIPMENT_VISUALS.find(
    (v) => v.assetId === entry.assetId,
  );
  const hair = HAIR_VISUALS.find((v) => v.assetId === entry.assetId);
  const beard = BEARD_VISUALS.find((v) => v.assetId === entry.assetId);
  const expectSkinned = isBase || equipmentVisual?.mode === 'skinned';

  if (expectSkinned) {
    if (skins.length === 0)
      err(entry.assetId, 'expected a skinned mesh but the file has no skin');
    for (const skin of skins) {
      const names = skin.listJoints().map((j) => j.getName());
      if (new Set(names).size !== names.length)
        err(
          entry.assetId,
          `duplicate bone names: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`,
        );
      const expected = LOGICAL_BONES.map((b) => CANONICAL_SKELETON_MAP[b]);
      for (const [logical, actual] of Object.entries(CANONICAL_SKELETON_MAP))
        if (!names.includes(actual))
          err(
            entry.assetId,
            `required ${logical} bone not found. Expected mapping: ${actual}`,
          );
      if (names.length === expected.length && names.join() !== expected.join())
        err(
          entry.assetId,
          'joint order differs from the canonical skeleton (clothing is rebound by index)',
        );
      if (!skin.getInverseBindMatrices())
        err(entry.assetId, 'skin has no inverse bind matrices');
    }
    const skinnedNodes = root
      .listNodes()
      .filter((n) => n.getMesh() && n.getSkin());
    if (skinnedNodes.length === 0)
      err(entry.assetId, 'no node combines a mesh with a skin');
    for (const n of root.listNodes().filter((x) => x.getMesh() && !x.getSkin()))
      err(
        entry.assetId,
        `mesh node "${n.getName()}" is not skinned in a skinned asset`,
      );
    for (const mesh of meshes)
      for (const prim of mesh.listPrimitives())
        if (!prim.getAttribute('JOINTS_0') || !prim.getAttribute('WEIGHTS_0'))
          err(
            entry.assetId,
            `mesh "${mesh.getName()}" lacks JOINTS_0/WEIGHTS_0`,
          );
  } else if (skins.length) {
    err(entry.assetId, 'rigid asset must not contain a skin');
  }

  if (isBase) {
    if (tris > BUDGET.baseTriangles)
      warn(
        entry.assetId,
        `${Math.round(tris)} triangles (budget ${BUDGET.baseTriangles})`,
      );
    // animation clips
    const clips = new Set(root.listAnimations().map((a) => a.getName()));
    for (const [logical, names] of Object.entries(ANIMATION_CLIP_MAP))
      for (const side of ['right', 'left'])
        if (!clips.has(names[side]))
          err(
            entry.assetId,
            `animation clip "${names[side]}" (logical ${logical}, ${side}-handed) not found`,
          );
    // morph targets
    const names = new Set();
    for (const m of meshes)
      for (const n of m.getExtras()?.targetNames ?? []) names.add(n);
    for (const t of BASE_MORPH_TARGETS)
      if (!names.has(t)) err(entry.assetId, `morph target "${t}" not found`);
    // scale + ground
    let minY = Infinity,
      maxY = -Infinity;
    for (const mesh of meshes)
      for (const prim of mesh.listPrimitives()) {
        const acc = prim.getAttribute('POSITION');
        const mn = acc.getMin([]);
        const mx = acc.getMax([]);
        minY = Math.min(minY, mn[1]);
        maxY = Math.max(maxY, mx[1]);
      }
    const height = maxY - minY;
    const [lo, hi] = CHARACTER_CONVENTIONS.heightRangeMetres;
    if (height < lo || height > hi)
      err(
        entry.assetId,
        `height ${height.toFixed(2)} m outside ${lo}-${hi} m (1 unit = 1 metre; fix at export, not with scattered scale factors)`,
      );
    if (
      Math.abs(minY - CHARACTER_CONVENTIONS.groundY) >
      CHARACTER_CONVENTIONS.groundToleranceMetres
    )
      err(
        entry.assetId,
        `lowest point is y=${minY.toFixed(3)} m: feet must rest on y=0`,
      );
    // body part meshes for masking
    const meshNames = new Set(root.listNodes().map((n) => n.getName()));
    for (const part of [
      'Body_Torso',
      'Body_Head',
      'Body_Arms',
      'Body_Hands',
      'Body_Legs',
      'Body_Feet',
    ])
      if (!meshNames.has(part))
        err(
          entry.assetId,
          `body part mesh "${part}" missing (needed to hide parts under clothing)`,
        );
  } else if (hair || beard) {
    if (tris > BUDGET.hairTriangles)
      warn(
        entry.assetId,
        `${Math.round(tris)} triangles (budget ${BUDGET.hairTriangles})`,
      );
  } else if (tris > BUDGET.itemTriangles)
    warn(
      entry.assetId,
      `${Math.round(tris)} triangles (budget ${BUDGET.itemTriangles})`,
    );

  if (equipmentVisual?.slot === 'bat') {
    const mats = new Set(materials.map((m) => m.getName()));
    if (!mats.has('Bat_Grip'))
      err(
        entry.assetId,
        'bat needs a separate "Bat_Grip" material (grip colour is dynamic)',
      );
    if (!mats.has('Bat_Blade'))
      err(entry.assetId, 'bat needs a "Bat_Blade" material');
  }
}

// ---- coverage: every definition resolves --------------------------------------------------
const itemById = new Map(ITEMS.map((i) => [i.id, i]));
const need = (id, what) => {
  if (!byId.has(id)) err(what, `asset "${id}" is not in the manifest`);
};
need(BASE_CHARACTER_ASSETS.viewer, 'base character');
for (const v of EQUIPMENT_VISUALS) {
  const item = itemById.get(v.itemId);
  if (!item) err(v.itemId, 'visual definition for an unknown item');
  else if (item.slot !== v.slot)
    err(v.itemId, `visual slot ${v.slot} differs from item slot ${item.slot}`);
  else if (item.modelAssetId && item.modelAssetId !== v.assetId)
    err(
      v.itemId,
      `visual asset ${v.assetId} differs from the item's modelAssetId ${item.modelAssetId}`,
    );
  need(v.assetId, v.itemId);
  if (v.mode === 'attached' && !v.attachment)
    err(v.itemId, 'attached item needs an attachment definition');
  if (
    v.attachment &&
    v.attachment.bone !== 'dominantHand' &&
    v.attachment.bone !== 'offHand' &&
    !LOGICAL_BONES.includes(v.attachment.bone)
  )
    err(v.itemId, `unknown attachment bone ${v.attachment.bone}`);
  if (!DRESSING_ROOM_SLOTS.includes(v.slot))
    warn(v.itemId, `slot ${v.slot} is not exposed in the dressing room yet`);
}
for (const [slot, itemId] of Object.entries(STARTER_LOADOUT))
  if (!EQUIPMENT_VISUALS.some((v) => v.itemId === itemId))
    err(itemId, `starter ${slot} item has no visual definition`);
for (const item of ITEMS)
  if (item.iconAssetId) need(item.iconAssetId, `${item.id} icon`);
for (const h of HAIR_VISUALS) if (h.assetId) need(h.assetId, h.optionId);
for (const b of BEARD_VISUALS) if (b.assetId) need(b.assetId, b.optionId);
for (const o of APPEARANCE_OPTIONS) {
  if (
    o.category === 'hairStyle' &&
    !HAIR_VISUALS.some((h) => h.optionId === o.id)
  )
    err(o.id, 'no hair visual definition');
  if (o.category === 'beard' && !BEARD_VISUALS.some((b) => b.optionId === o.id))
    err(o.id, 'no beard visual definition');
  if (o.category === 'body' && !(o.id in BODY_VISUALS))
    err(o.id, 'no body visual definition');
  if (o.category === 'face' && !(o.id in FACE_VISUALS))
    err(o.id, 'no face visual definition');
}
for (const weights of [
  ...Object.values(BODY_VISUALS),
  ...Object.values(FACE_VISUALS),
])
  for (const k of Object.keys(weights))
    if (!BASE_MORPH_TARGETS.includes(k))
      err('visuals', `unknown morph target ${k}`);

// starter outfit budget
let dressed = stats.get(BASE_CHARACTER_ASSETS.viewer)?.tris ?? 0;
let dressedBytes = stats.get(BASE_CHARACTER_ASSETS.viewer)?.size ?? 0;
for (const itemId of Object.values(STARTER_LOADOUT)) {
  const v = EQUIPMENT_VISUALS.find((x) => x.itemId === itemId);
  const s = v && stats.get(v.assetId);
  if (s) {
    dressed += s.tris;
    dressedBytes += s.size;
  }
}
if (dressed > BUDGET.totalDressedTriangles)
  warn(
    'starter outfit',
    `${Math.round(dressed)} triangles (budget ${BUDGET.totalDressedTriangles})`,
  );

// ---- report -------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log(
  '\nAsset report (INITIAL PERFORMANCE BUDGETS apply; see docs/character-3d/performance.md)',
);
console.log(
  pad('asset', 46) +
    pad('kind', 11) +
    pad('size', 11) +
    pad('tris', 8) +
    pad('mats', 6) +
    'textures',
);
for (const r of rows.sort((a, b) => b.size - a.size))
  console.log(
    pad(r.id, 46) +
      pad(r.kind, 11) +
      pad(kb(r.size), 11) +
      pad(r.tris, 8) +
      pad(r.mats, 6) +
      r.tex,
  );
console.log(
  `\nStarter outfit (base + 7 starter items): ${Math.round(dressed)} triangles, ${kb(dressedBytes)} of GLB`,
);
console.log(
  `Total manifest size: ${kb(ASSET_MANIFEST.reduce((n, a) => n + a.sizeBytes, 0))} in ${ASSET_MANIFEST.length} assets`,
);
for (const w of warnings) console.warn('warning: ' + w);
if (errors.length) {
  console.error(`\nCharacter assets invalid (${errors.length}):`);
  for (const e of errors) console.error('  ' + e);
  process.exitCode = 1;
} else console.log(`\nCharacter assets valid (${warnings.length} warning(s)).`);
