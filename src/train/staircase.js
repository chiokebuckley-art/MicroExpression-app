/**
 * Adaptive 3-Down / 1-Up Exposure Staircase (Section 6.1).
 * - Separate staircase per emotion over [500, 333, 200, 133, 100, 67, 50, 40] ms.
 * - 3 consecutive correct answers at the current step -> 1 step shorter (harder).
 * - 1 wrong answer -> 1 step longer (easier).
 * - Estimated 79.4% threshold = mean of the last 6 reversals.
 */

export const EXPOSURE_LADDER_MS = [500, 333, 200, 133, 100, 67, 50, 40];

export const CORE_EMOTIONS_7 = [
  'happiness',
  'sadness',
  'anger',
  'fear',
  'disgust',
  'surprise',
  'contempt'
];

export function createStaircaseState(emotion, initialStepIndex = 2) {
  const stepIndex = Math.max(0, Math.min(EXPOSURE_LADDER_MS.length - 1, initialStepIndex));
  return {
    emotion,
    stepIndex,
    currentMs: EXPOSURE_LADDER_MS[stepIndex],
    streak: 0,
    lastDirection: 0, // +1 = stepped shorter (harder), -1 = stepped longer (easier)
    reversals: [],    // array of nominal ms values where direction reversed
    trials: 0,
    correctCount: 0,
    thresholdMs: EXPOSURE_LADDER_MS[stepIndex]
  };
}

export function stepStaircase(prevState, correct) {
  const state = {
    ...prevState,
    reversals: [...(prevState.reversals || [])],
    trials: (prevState.trials || 0) + 1,
    correctCount: (prevState.correctCount || 0) + (correct ? 1 : 0)
  };

  if (correct) {
    state.streak = (state.streak || 0) + 1;
    if (state.streak >= 3) {
      state.streak = 0;
      const newDir = 1; // stepping toward shorter exposure (harder)
      if (state.lastDirection === -1) {
        state.reversals.push(EXPOSURE_LADDER_MS[state.stepIndex]);
      }
      state.stepIndex = Math.min(EXPOSURE_LADDER_MS.length - 1, state.stepIndex + 1);
      state.lastDirection = newDir;
    }
  } else {
    state.streak = 0;
    const newDir = -1; // stepping toward longer exposure (easier)
    if (state.lastDirection === 1) {
      state.reversals.push(EXPOSURE_LADDER_MS[state.stepIndex]);
    }
    state.stepIndex = Math.max(0, state.stepIndex - 1);
    state.lastDirection = newDir;
  }

  state.currentMs = EXPOSURE_LADDER_MS[state.stepIndex];
  state.thresholdMs = computeThresholdMs(state);
  return state;
}

export function computeThresholdMs(state) {
  const revs = state?.reversals || [];
  if (revs.length >= 2) {
    const lastSix = revs.slice(-6);
    const sum = lastSix.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / lastSix.length) * 10) / 10;
  }
  return EXPOSURE_LADDER_MS[state?.stepIndex ?? 2];
}

/**
 * Simulates a psychophysical observer with a logistic psychometric curve centered at trueThresholdMs
 * (where P(correct | exposure = trueThresholdMs) ≈ 0.794, chance floor = 1/7).
 * Used by unit tests to verify 3-down/1-up staircase convergence.
 */
export function simulateObserverStaircase(trueThresholdMs = 120, numTrials = 40, seed = 42) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let state = createStaircaseState('fear', 2); // start at 200 ms
  for (let i = 0; i < numTrials; i++) {
    const expMs = state.currentMs;
    // Logistic psychometric function in log-duration space calibrated so P(trueThresholdMs) = 0.794
    const logRatio = Math.log(expMs / trueThresholdMs);
    const logistic = 1 / (1 + Math.exp(-(logRatio * 4.5 + 1.15)));
    const pCorrect = (1 / 7) + (1 - 1 / 7) * logistic;
    const isCorrect = rand() < pCorrect;
    state = stepStaircase(state, isCorrect);
  }
  return state;
}
