/**
 * Fixed-Seed Standardized Benchmark Assessment (Section 6.3).
 * - Fixed 42-item core benchmark: 7 universal emotions x 6 items across 200 ms, 100 ms, 50 ms
 *   (2 items per emotion per speed), balanced across realistic identities.
 * - Optional extended subtle (10 items at 0.35 scale) + masked (5 items) block.
 * - Administered on first launch (baseline) and offered every 14 days.
 * - Stored separately in the `assessments` IndexedDB object store and NEVER mixed into training trials.
 */

export const ASSESSMENT_SEED = 0x52463236; // Deterministic benchmark seed
export const ASSESSMENT_INTERVAL_DAYS = 14;
export const BENCHMARK_SPEEDS_MS = [200, 100, 50];
export const BENCHMARK_EMOTIONS = [
  'happiness',
  'sadness',
  'anger',
  'fear',
  'disgust',
  'surprise',
  'contempt'
];

export const BENCHMARK_IDENTITIES = [
  'riya',
  'female_adult_08',
  'female_adult_12',
  'male_adult_01',
  'male_adult_06'
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates the deterministic 42-item standardized benchmark (plus optional 10 subtle + 5 masked).
 */
export function generateBenchmarkItems({ includeExtended = false, seed = ASSESSMENT_SEED } = {}) {
  const rng = mulberry32(seed);
  const coreItems = [];

  let idx = 0;
  for (const emotion of BENCHMARK_EMOTIONS) {
    for (const exposureMs of BENCHMARK_SPEEDS_MS) {
      for (let rep = 0; rep < 2; rep++) {
        const rigId = BENCHMARK_IDENTITIES[idx % BENCHMARK_IDENTITIES.length];
        coreItems.push({
          itemIndex: idx,
          category: 'core_flash',
          emotion,
          nominalMs: exposureMs,
          scale: 1.0,
          rigId
        });
        idx++;
      }
    }
  }

  // Deterministic Fisher-Yates shuffle of the 42 core items
  for (let i = coreItems.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = coreItems[i];
    coreItems[i] = coreItems[j];
    coreItems[j] = tmp;
  }

  if (includeExtended) {
    // 10 subtle items (intensity B = 0.35 at 200ms)
    for (let s = 0; s < 10; s++) {
      const emotion = BENCHMARK_EMOTIONS[s % BENCHMARK_EMOTIONS.length];
      coreItems.push({
        itemIndex: coreItems.length,
        category: 'subtle',
        emotion,
        nominalMs: 200,
        scale: 0.35,
        rigId: BENCHMARK_IDENTITIES[s % BENCHMARK_IDENTITIES.length]
      });
    }
    // 5 masked items (true emotion leaked for 133ms before social smile mask)
    const maskedEmotions = ['anger', 'fear', 'disgust', 'sadness', 'contempt'];
    for (let m = 0; m < 5; m++) {
      coreItems.push({
        itemIndex: coreItems.length,
        category: 'masked',
        emotion: maskedEmotions[m],
        maskEmotion: 'happiness_social',
        nominalMs: 133,
        scale: 0.85,
        rigId: BENCHMARK_IDENTITIES[m % BENCHMARK_IDENTITIES.length]
      });
    }
  }

  return coreItems.map((it, orderIdx) => ({ ...it, order: orderIdx + 1 }));
}

export function scoreAssessment(responses = []) {
  const total = responses.length || 1;
  let correctCount = 0;

  const byEmotion = {};
  for (const em of BENCHMARK_EMOTIONS) {
    byEmotion[em] = { correct: 0, total: 0, accuracy: 0 };
  }

  const bySpeed = {};
  for (const spd of BENCHMARK_SPEEDS_MS) {
    bySpeed[spd] = { correct: 0, total: 0, accuracy: 0 };
  }

  const byCategory = {
    core_flash: { correct: 0, total: 0, accuracy: 0 },
    subtle: { correct: 0, total: 0, accuracy: 0 },
    masked: { correct: 0, total: 0, accuracy: 0 }
  };

  let totalRtMs = 0;
  for (const r of responses) {
    const isCorr = r.chosenEmotion === r.emotion;
    if (isCorr) correctCount++;
    totalRtMs += Number(r.rtMs || 0);

    if (byEmotion[r.emotion]) {
      byEmotion[r.emotion].total++;
      if (isCorr) byEmotion[r.emotion].correct++;
    }
    if (bySpeed[r.nominalMs]) {
      bySpeed[r.nominalMs].total++;
      if (isCorr) bySpeed[r.nominalMs].correct++;
    }
    const cat = r.category || 'core_flash';
    if (byCategory[cat]) {
      byCategory[cat].total++;
      if (isCorr) byCategory[cat].correct++;
    }
  }

  for (const obj of [byEmotion, bySpeed, byCategory]) {
    for (const k of Object.keys(obj)) {
      const entry = obj[k];
      entry.accuracy = entry.total > 0 ? Math.round((entry.correct / entry.total) * 1000) / 10 : 0;
    }
  }

  return {
    timestamp: Date.now(),
    totalItems: responses.length,
    correctCount,
    overallAccuracy: Math.round((correctCount / total) * 1000) / 10,
    meanRtMs: Math.round(totalRtMs / total),
    byEmotion,
    bySpeed,
    byCategory,
    responses
  };
}

export function isAssessmentDue(pastAssessments = [], nowMs = Date.now()) {
  if (!pastAssessments || pastAssessments.length === 0) {
    return { due: true, reason: 'baseline', daysSinceLast: null };
  }
  const sorted = [...pastAssessments].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const lastTs = sorted[0].timestamp || 0;
  const days = (nowMs - lastTs) / (24 * 60 * 60 * 1000);
  return {
    due: days >= ASSESSMENT_INTERVAL_DAYS,
    reason: days >= ASSESSMENT_INTERVAL_DAYS ? '14_day_retest' : 'up_to_date',
    daysSinceLast: Math.round(days * 10) / 10
  };
}
