/**
 * Pure requestAnimationFrame Frame-Counting Flash Scheduler & Refresh Calibrator (Section 5.3).
 *
 * - Snaps nominal ms exposure to exact display frames: n = max(1, round(ms / frameMs))
 * - Changes state strictly inside rAF callbacks:
 *   Frame k: apply apex weights
 *   Frame k + n: apply neutral weights
 * - Integrity check: if any frame interval during the flash exceeds 1.5 * frameMs
 *   (or visibilityState changes), marks timingValid = false.
 * - Supports injectable rAF clock for deterministic unit testing at 60, 120, and 144 Hz.
 */

export const EXPOSURE_LADDER_MS = [500, 333, 200, 133, 100, 67, 50, 40];

export function snapMsToFrames(nominalMs, frameMs = 16.6667) {
  const safeFrameMs = frameMs > 0 ? frameMs : 16.6667;
  const frames = Math.max(1, Math.round(nominalMs / safeFrameMs));
  const actualMs = Number((frames * safeFrameMs).toFixed(2));
  return { nominalMs, frames, frameMs: Number(safeFrameMs.toFixed(3)), actualMs };
}

export function analyseFlashLog(log, frames, frameMs = 16.6667) {
  const intervals = [];
  let maxIntervalMs = 0;
  let timingValid = true;
  const threshold = 1.5 * frameMs;

  for (let i = 1; i < log.length; i++) {
    const dt = log[i] - log[i - 1];
    intervals.push(dt);
    if (dt > maxIntervalMs) maxIntervalMs = dt;
    if (dt > threshold) {
      timingValid = false;
    }
  }

  if (log.length < frames + 1) {
    timingValid = false;
  }

  const actualMs = Number((frames * frameMs).toFixed(2));
  const measuredSpanMs = log.length >= 2 ? Number((log[log.length - 1] - log[0]).toFixed(2)) : actualMs;

  return {
    frames,
    frameMs: Number(frameMs.toFixed(3)),
    actualMs,
    measuredSpanMs,
    maxIntervalMs: Number(maxIntervalMs.toFixed(2)),
    intervals,
    timingValid
  };
}

export function runFlash(rig, apexState, neutralState, frames, onDone, options = {}) {
  const raf = options.raf || ((cb) => requestAnimationFrame(cb));
  const frameMs = options.frameMs || 16.6667;
  const renderFn = options.render || (() => rig?.render?.());
  const targetFrames = Math.max(1, Math.round(frames));

  let shown = -1;
  let cancelled = false;
  let visibilityBroken = false;
  const log = [];

  const onVisChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      visibilityBroken = true;
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisChange);
  }

  function cleanup() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisChange);
    }
  }

  function tick(ts) {
    if (cancelled) {
      cleanup();
      return;
    }
    log.push(ts);
    if (shown < 0) {
      rig.applyState ? rig.applyState(apexState) : rig.applyResolvedState?.(apexState);
      shown = 0;
    } else if (++shown === targetFrames) {
      rig.applyState ? rig.applyState(neutralState) : rig.applyResolvedState?.(neutralState);
      renderFn();
      cleanup();
      const result = analyseFlashLog(log, targetFrames, frameMs);
      if (visibilityBroken) {
        result.timingValid = false;
      }
      if (onDone) onDone(result);
      return;
    }
    renderFn();
    raf(tick);
  }

  raf(tick);

  return {
    cancel() {
      cancelled = true;
      cleanup();
    }
  };
}

export function calibrateRefreshRate({
  sampleFrames = 30,
  raf = (cb) => requestAnimationFrame(cb)
} = {}) {
  return new Promise((resolve) => {
    const timestamps = [];
    function sample(ts) {
      timestamps.push(ts);
      if (timestamps.length <= sampleFrames) {
        raf(sample);
        return;
      }
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        const dt = timestamps[i] - timestamps[i - 1];
        if (dt > 1 && dt < 200) intervals.push(dt);
      }
      if (intervals.length === 0) {
        resolve({
          frameMs: 16.667,
          frameDurationMs: 16.667,
          displayHz: 60,
          fps: 60,
          cv: 0,
          below60Hz: false,
          unstable: false
        });
        return;
      }
      const sorted = [...intervals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianMs = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) * 0.5;
      const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;
      const displayHz = Math.round(1000 / medianMs);

      resolve({
        frameMs: Number(medianMs.toFixed(3)),
        frameDurationMs: Number(medianMs.toFixed(3)),
        displayHz,
        fps: displayHz,
        cv: Number(cv.toFixed(4)),
        below60Hz: displayHz < 58,
        unstable: cv > 0.10
      });
    }
    raf(sample);
  });
}

export class FrameCountingScheduler {
  constructor() {
    this.fps = 60;
    this.frameDurationMs = 1000 / 60;
    this.isRunning = false;
    this._cancelFn = null;
  }

  async calibrateRefreshRate(sampleFrames = 24) {
    const res = await calibrateRefreshRate({ sampleFrames });
    this.fps = res.displayHz || 60;
    this.frameDurationMs = res.frameMs || 16.667;
    return res;
  }

  cancelFlash() {
    if (this._cancelFn) {
      this._cancelFn();
      this._cancelFn = null;
    }
    this.isRunning = false;
  }

  scheduleFlash({
    durationMs = 200,
    reducedMotion = false,
    preNeutralFrames = 4,
    postNeutralFrames = 4,
    rampInFrames = 0,
    rampOutFrames = 0,
    onApplyFrame
  }) {
    this.cancelFlash();
    const effectiveNominalMs = reducedMotion ? Math.max(500, durationMs) : durationMs;
    const snap = snapMsToFrames(effectiveNominalMs, this.frameDurationMs);
    const holdFrames = snap.frames;
    const rIn = reducedMotion ? Math.max(4, rampInFrames || 0) : (rampInFrames || 0);
    const rOut = reducedMotion ? Math.max(4, rampOutFrames || 0) : (rampOutFrames || 0);

    this.isRunning = true;
    let cancelled = false;
    this._cancelFn = () => {
      cancelled = true;
    };

    return new Promise((resolve) => {
      let frameIdx = 0;
      const totalFrames = preNeutralFrames + rIn + holdFrames + rOut + postNeutralFrames;
      const flashStartIdx = preNeutralFrames;
      const flashEndIdx = preNeutralFrames + rIn + holdFrames + rOut;
      let flashStartTs = 0;
      let flashEndTs = 0;

      const step = (ts) => {
        if (cancelled) {
          this.isRunning = false;
          resolve({
            nominalMs: effectiveNominalMs,
            actualFrames: holdFrames,
            actualMs: snap.actualMs,
            fps: this.fps,
            cancelled: true
          });
          return;
        }

        if (frameIdx === flashStartIdx) flashStartTs = ts;
        if (frameIdx === flashEndIdx) flashEndTs = ts;

        let alpha = 0;
        let phase = 'pre';
        if (frameIdx < preNeutralFrames) {
          alpha = 0;
          phase = 'pre';
        } else if (frameIdx < preNeutralFrames + rIn) {
          alpha = (frameIdx - preNeutralFrames + 1) / (rIn + 1);
          phase = 'ramp_in';
        } else if (frameIdx < preNeutralFrames + rIn + holdFrames) {
          alpha = 1;
          phase = 'hold';
        } else if (frameIdx < flashEndIdx) {
          const outStep = frameIdx - (preNeutralFrames + rIn + holdFrames) + 1;
          alpha = 1 - outStep / (rOut + 1);
          phase = 'ramp_out';
        } else {
          alpha = 0;
          phase = 'post';
        }

        if (onApplyFrame) onApplyFrame(alpha, phase);

        frameIdx++;
        if (frameIdx <= totalFrames) {
          requestAnimationFrame(step);
        } else {
          this.isRunning = false;
          const measuredMs = flashEndTs > flashStartTs
            ? Math.round((flashEndTs - flashStartTs) * 10) / 10
            : snap.actualMs;
          resolve({
            nominalMs: effectiveNominalMs,
            actualFrames: holdFrames,
            actualMs: measuredMs || snap.actualMs,
            fps: this.fps,
            cancelled: false
          });
        }
      };

      requestAnimationFrame(step);
    });
  }
}
