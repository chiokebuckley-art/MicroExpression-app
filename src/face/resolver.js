/**
 * AU -> 52 ARKit Blendshape sparse matrix resolver with combination correctives,
 * region masking (upper/lower/full), head pose, gaze, and per-region wrinkle weights.
 */

import { CANONICAL_ARKIT_52 } from './auMap.js';

const UPPER_FACE_AUS = new Set([1, 2, 4, 5, 6, 7, 43, 45, 46]);
const LOWER_FACE_AUS = new Set([9, 10, 12, 14, 15, 16, 17, 20, 23, 24, 25, 26, 27]);

export function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

// Applied once at the rendering boundary, after AU sums and correctives. Keeping
// the input immutable lets sliders/timelines interpolate without compounding gains.
export function applyRigGains(weights, rigMap = {}) {
  const gains = rigMap?.gains || {};
  const limits = rigMap?.maxInfluence || {};
  return Object.fromEntries(Object.entries(weights).map(([name, value]) => {
    const base = name.replace(/Left$|Right$/, '');
    const gain = gains[name] ?? gains[base] ?? 1;
    const limit = Math.min(1.3, limits[name] ?? limits[base] ?? 1);
    return [name, Math.max(0, Math.min(limit, value * gain))];
  }));
}

/**
 * Resolves a recipe or list of AU activations into canonical ARKit blendshapes,
 * wrinkle weights, head pose (pitch, yaw, roll in degrees), and gaze.
 *
 * Note on subject Left/Right:
 * In FACS and ARKit, 'Left' means the subject's own left side.
 */
export function resolveExpressionState(input, auCatalog, options = {}) {
  const scale = options.scale ?? input?.scale ?? 1.0;
  const regionFilter = options.region ?? input?.region ?? 'full';
  const aus = Array.isArray(input?.aus) ? input.aus : (Array.isArray(input) ? input : []);
  const extras = {
    gazeDown: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    ...(input?.extras || {}),
    ...(options.extras || {})
  };

  const weights = {};
  for (const name of CANONICAL_ARKIT_52) {
    weights[name] = 0;
  }

  const activeAUMap = new Map();
  const entriesById = new Map();
  if (auCatalog?.aus) {
    for (const a of auCatalog.aus) {
      entriesById.set(Number(a.id), a);
    }
  }

  for (const act of aus) {
    const auId = Number(act.au);
    if (regionFilter === 'upper' && !UPPER_FACE_AUS.has(auId)) continue;
    if (regionFilter === 'lower' && !LOWER_FACE_AUS.has(auId)) continue;

    const rawIntensity = clamp01((act.intensity ?? 1.0) * scale);
    if (rawIntensity <= 0) continue;

    const side = act.side || 'both';
    activeAUMap.set(auId, Math.max(activeAUMap.get(auId) || 0, rawIntensity));

    const def = entriesById.get(auId);
    if (!def) continue;

    for (const bs of options.rigMap?.entries?.[auId] || def.blendshapes) {
      const contrib = rawIntensity * bs.weight;
      if (bs.lateral) {
        if (side === 'both' || side === 'left') {
          const kL = `${bs.shape}Left`;
          weights[kL] = clamp01((weights[kL] || 0) + contrib);
        }
        if (side === 'both' || side === 'right') {
          const kR = `${bs.shape}Right`;
          weights[kR] = clamp01((weights[kR] || 0) + contrib);
        }
      } else {
        weights[bs.shape] = clamp01((weights[bs.shape] || 0) + contrib);
      }
    }
  }

  // Apply combination correctives from Section 5.1 / 5.2
  // 1. Fear fix corrective: when AU1, AU4, and AU20 are all active
  if (activeAUMap.has(1) && activeAUMap.has(4) && activeAUMap.has(20)) {
    const fearStrength = Math.min(activeAUMap.get(1), activeAUMap.get(4), activeAUMap.get(20));
    weights.mouthPressLeft = clamp01(weights.mouthPressLeft + 0.1 * fearStrength);
    weights.mouthPressRight = clamp01(weights.mouthPressRight + 0.1 * fearStrength);
    weights.mouthFrownLeft = clamp01(weights.mouthFrownLeft + 0.1 * fearStrength);
    weights.mouthFrownRight = clamp01(weights.mouthFrownRight + 0.1 * fearStrength);
    // Keep jawOpen <= 0.10 in pure fear (unless AU27 terror mouth stretch or explicit surprise jaw drop > 0.2 is active)
    if (!activeAUMap.has(27) && (activeAUMap.get(26) || 0) <= 0.12) {
      weights.jawOpen = Math.min(0.10, weights.jawOpen);
    }
  }

  // 2. Sadness oblique brow corrective: when AU1, AU4, and AU15 are active
  if (activeAUMap.has(1) && activeAUMap.has(4) && activeAUMap.has(15)) {
    const sadStrength = Math.min(activeAUMap.get(1), activeAUMap.get(15));
    weights.browInnerUp = clamp01(weights.browInnerUp + 0.15 * sadStrength);
  }

  // 3. AU24 Lip presser adds mouthClose if jawOpen > 0
  if (activeAUMap.has(24) && weights.jawOpen > 0) {
    weights.mouthClose = clamp01(weights.mouthClose + activeAUMap.get(24) * 0.5);
  }

  // 4. AU12 alone (social smile) must NEVER show AU6 cheek raise
  if (!activeAUMap.has(6)) {
    weights.cheekSquintLeft = 0;
    weights.cheekSquintRight = 0;
  }

  // 5. Extras: gazeDown -> eyeLookDownLeft/Right
  if (extras.gazeDown > 0) {
    const gd = clamp01(extras.gazeDown * scale);
    weights.eyeLookDownLeft = clamp01(weights.eyeLookDownLeft + gd);
    weights.eyeLookDownRight = clamp01(weights.eyeLookDownRight + gd);
  }

  // 6. Per-region AU wrinkle weights (forehead: AU1/2, glabella: AU4, crowsFeet: AU6, nose: AU9)
  const wrinkleWeights = {
    forehead: clamp01(Math.max(activeAUMap.get(1) || 0, activeAUMap.get(2) || 0)),
    glabella: clamp01(activeAUMap.get(4) || 0),
    crowsFeet: activeAUMap.has(6) ? clamp01(activeAUMap.get(6)) : 0,
    nose: clamp01(activeAUMap.get(9) || 0)
  };

  return {
    weights,
    activeAUs: Object.fromEntries(activeAUMap),
    wrinkleWeights,
    headPose: {
      pitchDeg: (extras.headPitch || 0) * scale,
      yawDeg: (extras.headYaw || 0) * scale,
      rollDeg: (extras.headRoll || 0) * scale
    },
    gazeDown: (extras.gazeDown || 0) * scale
  };
}

/**
 * Linearly interpolates between two resolved expression states.
 */
export function lerpExpressionState(stateA, stateB, t) {
  const alpha = clamp01(t);
  const weights = {};
  for (const k of CANONICAL_ARKIT_52) {
    const a = stateA?.weights?.[k] || 0;
    const b = stateB?.weights?.[k] || 0;
    weights[k] = a + (b - a) * alpha;
  }

  const allAUs = new Set([
    ...Object.keys(stateA?.activeAUs || {}),
    ...Object.keys(stateB?.activeAUs || {})
  ]);
  const activeAUs = {};
  for (const au of allAUs) {
    const a = stateA?.activeAUs?.[au] || 0;
    const b = stateB?.activeAUs?.[au] || 0;
    const v = a + (b - a) * alpha;
    if (v > 0.01) activeAUs[au] = v;
  }

  const wA = stateA?.wrinkleWeights || { forehead: 0, glabella: 0, crowsFeet: 0, nose: 0 };
  const wB = stateB?.wrinkleWeights || { forehead: 0, glabella: 0, crowsFeet: 0, nose: 0 };
  const wrinkleWeights = {
    forehead: wA.forehead + (wB.forehead - wA.forehead) * alpha,
    glabella: wA.glabella + (wB.glabella - wA.glabella) * alpha,
    crowsFeet: wA.crowsFeet + (wB.crowsFeet - wA.crowsFeet) * alpha,
    nose: wA.nose + (wB.nose - wA.nose) * alpha
  };

  const pA = stateA?.headPose || { pitchDeg: 0, yawDeg: 0, rollDeg: 0 };
  const pB = stateB?.headPose || { pitchDeg: 0, yawDeg: 0, rollDeg: 0 };

  return {
    weights,
    activeAUs,
    wrinkleWeights,
    headPose: {
      pitchDeg: pA.pitchDeg + (pB.pitchDeg - pA.pitchDeg) * alpha,
      yawDeg: pA.yawDeg + (pB.yawDeg - pA.yawDeg) * alpha,
      rollDeg: pA.rollDeg + (pB.rollDeg - pA.rollDeg) * alpha
    },
    gazeDown: (stateA?.gazeDown || 0) + ((stateB?.gazeDown || 0) - (stateA?.gazeDown || 0)) * alpha
  };
}
