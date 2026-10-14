/**
 * ExpressionTimeline Player (Section 5.3 & 5.4).
 * Evaluates keyframe timelines { tMs, recipeId, aus, extras, scale, ease: 'step'|'linear'|'easeInOut' }
 * once per rAF frame against the timeline clock. Step keys land cleanly on frame boundaries.
 */

import { resolveExpressionState, lerpExpressionState } from './resolver.js';

export function easeValue(t, ease = 'linear') {
  const x = Math.max(0, Math.min(1, t));
  if (ease === 'step') return x >= 1 ? 1 : 0;
  if (ease === 'easeInOut') {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
  return x;
}

export function buildRecipesMap(expressionsCatalog) {
  const map = new Map();
  if (!expressionsCatalog) return map;
  const lists = [
    expressionsCatalog.recipes || [],
    expressionsCatalog.core || [],
    expressionsCatalog.variants || [],
    expressionsCatalog.social || []
  ];
  for (const list of lists) {
    for (const r of list) {
      if (r && r.id) map.set(r.id, r);
    }
  }
  return map;
}

export function resolveKeyframeState(key, recipesMap, auCatalog) {
  if (key.aus) {
    return resolveExpressionState(
      { aus: key.aus, extras: key.extras || {} },
      auCatalog,
      { scale: key.scale ?? 1.0 }
    );
  }
  const recipe = recipesMap.get(key.recipeId || key.expression || 'neutral') || { id: 'neutral', aus: [] };
  return resolveExpressionState(recipe, auCatalog, {
    scale: key.scale ?? 1.0,
    extras: key.extras || recipe.extras || {}
  });
}

export function evaluateTimelineAt(timeline, elapsedMs, recipesMap, auCatalog) {
  const keys = timeline?.keys || timeline?.keyframes || [];
  if (keys.length === 0) {
    return resolveExpressionState({ aus: [] }, auCatalog);
  }
  if (elapsedMs <= keys[0].tMs) {
    return resolveKeyframeState(keys[0], recipesMap, auCatalog);
  }
  const lastKey = keys[keys.length - 1];
  if (elapsedMs >= lastKey.tMs) {
    return resolveKeyframeState(lastKey, recipesMap, auCatalog);
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (elapsedMs >= k0.tMs && elapsedMs <= k1.tMs) {
      const span = Math.max(1, k1.tMs - k0.tMs);
      const rawT = (elapsedMs - k0.tMs) / span;
      const easeMode = k1.ease || 'linear';
      if (easeMode === 'step') {
        return resolveKeyframeState(k0, recipesMap, auCatalog);
      }
      const alpha = easeValue(rawT, easeMode);
      const s0 = resolveKeyframeState(k0, recipesMap, auCatalog);
      const s1 = resolveKeyframeState(k1, recipesMap, auCatalog);
      return lerpExpressionState(s0, s1, alpha);
    }
  }

  return resolveKeyframeState(lastKey, recipesMap, auCatalog);
}

export class TimelinePlayer {
  constructor({ keyframes = [], auCatalog = null, expressionsCatalog = null }) {
    this.keyframes = keyframes;
    this.auCatalog = auCatalog;
    this.recipesMap = buildRecipesMap(expressionsCatalog);
    this.totalDurationMs = keyframes.length > 0
      ? (keyframes[keyframes.length - 1].tMs || keyframes[keyframes.length - 1].timeMs || 1600)
      : 1600;
    this.isPlaying = false;
    this.startTimeMs = 0;
    this.onUpdate = null;
    this.onComplete = null;
  }

  evaluateAtMs(elapsedMs) {
    return evaluateTimelineAt({ keys: this.keyframes }, elapsedMs, this.recipesMap, this.auCatalog);
  }

  play(nowMs = performance.now()) {
    this.isPlaying = true;
    this.startTimeMs = nowMs;
  }

  tick(nowMs = performance.now()) {
    if (!this.isPlaying) return;
    const elapsed = nowMs - this.startTimeMs;
    const state = this.evaluateAtMs(elapsed);
    if (this.onUpdate) {
      this.onUpdate(state, Math.min(elapsed, this.totalDurationMs), this.totalDurationMs);
    }
    if (elapsed >= this.totalDurationMs) {
      this.isPlaying = false;
      if (this.onComplete) this.onComplete();
    }
  }
}
