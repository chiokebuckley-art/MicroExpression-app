/**
 * Action Unit metadata, intensity ladder, and AU <-> Blendshape mapping helpers.
 */

let ausCatalogCache = null;

export const FACS_INTENSITY_LADDER = {
  A: 0.15,
  B: 0.35,
  C: 0.55,
  D: 0.75,
  E: 0.95
};

export const CANONICAL_ARKIT_52 = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper',
  'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight', 'tongueOut'
];

export async function loadAUsCatalog() {
  if (ausCatalogCache) return ausCatalogCache;
  const res = await fetch('./content/aus.json');
  ausCatalogCache = await res.json();
  return ausCatalogCache;
}

export async function loadRigAUMap(auMapUrl = './models/riya/au-map.json') {
  const res = await fetch(auMapUrl);
  return res.json();
}

export function getAUDefinition(catalog, auId) {
  if (!catalog || !Array.isArray(catalog.aus)) return null;
  return catalog.aus.find((a) => Number(a.id) === Number(auId)) || null;
}

/**
 * Maps live MediaPipe 52 ARKit blendshape deltas (user minus baseline)
 * back to estimated AU activations [0..1] using the transpose of the AU mapping table.
 */
export function estimateAUsFromBlendshapes(blendshapeMap, baselineMap = {}, catalog = null) {
  const deltas = {};
  for (const k of CANONICAL_ARKIT_52) {
    const raw = Number(blendshapeMap[k] || 0);
    const base = Number(baselineMap[k] || 0);
    // Tolerant noise floor for subtle channels
    const noiseFloor = (k.includes('mouthDimple') || k.includes('noseSneer') || k === 'browInnerUp') ? 0.03 : 0.04;
    deltas[k] = Math.max(0, Math.min(1, (raw - base - noiseFloor) / (1 - noiseFloor)));
  }

  const auScores = {};
  const entries = catalog?.aus || [];
  for (const au of entries) {
    let num = 0;
    let den = 0;
    for (const bs of au.blendshapes) {
      const w = bs.weight || 1.0;
      if (bs.lateral) {
        const lVal = deltas[`${bs.shape}Left`] ?? 0;
        const rVal = deltas[`${bs.shape}Right`] ?? 0;
        const val = au.id === 14 ? Math.max(lVal, rVal) : (lVal + rVal) * 0.5;
        num += val * w;
        den += w * w;
      } else {
        const val = deltas[bs.shape] ?? 0;
        num += val * w;
        den += w * w;
      }
    }
    auScores[au.id] = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
  }
  return { auScores, deltas };
}
