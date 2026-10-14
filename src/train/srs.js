/**
 * Leitner / SM-2 Spaced Repetition System (Section 6.2).
 * - 6 boxes with intervals [0, 1, 3, 7, 14, 30] days.
 * - Supports all 5 card kinds: 'emotion', 'pair', 'au', 'vocab', 'scene'.
 * - Correct at target speed -> box + 1; wrong -> box 0 (immediate re-queue).
 * - Session mix: 60% due SRS cards, 25% top-3 confused pairs from user's confusion matrix, 15% new/random.
 */

export const SRS_BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30];
export const VALID_CARD_KINDS = ['emotion', 'pair', 'au', 'vocab', 'scene'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function makeCardKey(kind, id) {
  return `${kind}:${id}`;
}

export function createSRSCard(kind, id, nowMs = Date.now()) {
  return {
    key: makeCardKey(kind, id),
    kind,
    id: String(id),
    box: 0,
    dueAt: nowMs,
    lastReviewedAt: null,
    lapses: 0,
    reps: 0
  };
}

export function updateSRSCard(card, { correct, rtMs = 1200, targetRtMs = 2500, nowMs = Date.now() }) {
  const updated = {
    ...card,
    lastReviewedAt: nowMs,
    reps: (card.reps || 0) + 1
  };

  if (!correct) {
    updated.box = 0;
    updated.dueAt = nowMs;
    updated.lapses = (card.lapses || 0) + 1;
  } else {
    const atTargetSpeed = rtMs <= targetRtMs;
    if (atTargetSpeed) {
      updated.box = Math.min(SRS_BOX_INTERVALS_DAYS.length - 1, (card.box || 0) + 1);
    } else {
      updated.box = Math.max(1, card.box || 0);
    }
    const intervalDays = SRS_BOX_INTERVALS_DAYS[updated.box] || 0;
    updated.dueAt = nowMs + intervalDays * DAY_MS;
  }

  return updated;
}

export function isCardDue(card, nowMs = Date.now()) {
  if (!card) return true;
  return (card.dueAt || 0) <= nowMs;
}

/**
 * Extracts top N confused pairs [{a, b, count}] from a trial log or confusion matrix.
 */
export function getTopConfusedPairs(trials = [], topN = 3) {
  const pairCounts = new Map();
  for (const t of trials) {
    if (t.correct || !t.shownEmotion || !t.chosenEmotion || t.chosenEmotion === 'not_sure') continue;
    if (t.shownEmotion === t.chosenEmotion) continue;
    const pair = [t.shownEmotion, t.chosenEmotion].sort();
    const key = `${pair[0]}__${pair[1]}`;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  return [...pairCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count]) => {
      const [a, b] = key.split('__');
      return { key, a, b, count };
    });
}

/**
 * Builds a training session item list adhering to the 60% due / 25% top-3 confused / 15% new-random mix.
 */
export function buildSessionMix({
  candidateItems = [],
  srsCardsMap = new Map(),
  recentTrials = [],
  sessionSize = 20,
  nowMs = Date.now()
}) {
  if (!candidateItems || candidateItems.length === 0) return [];

  const targetDueCount = Math.round(sessionSize * 0.60);
  const targetConfusionCount = Math.round(sessionSize * 0.25);

  const duePool = [];
  const unseenOrFuturePool = [];

  for (const item of candidateItems) {
    const key = item.srsKey || makeCardKey(item.kind || 'emotion', item.id || item.emotion);
    const card = srsCardsMap.get(key);
    if (!card || isCardDue(card, nowMs)) {
      duePool.push({ item, dueAt: card?.dueAt ?? 0, box: card?.box ?? 0 });
    } else {
      unseenOrFuturePool.push(item);
    }
  }

  // Prioritize lowest box and earliest due timestamp
  duePool.sort((a, b) => (a.box - b.box) || (a.dueAt - b.dueAt));

  const topPairs = getTopConfusedPairs(recentTrials, 3);
  const confusedEmotions = new Set();
  for (const p of topPairs) {
    confusedEmotions.add(p.a);
    confusedEmotions.add(p.b);
  }

  const confusionPool = candidateItems.filter((it) => {
    const em = it.emotion || it.shownEmotion || it.id;
    return confusedEmotions.has(em) || (it.pair && (confusedEmotions.has(it.pair[0]) || confusedEmotions.has(it.pair[1])));
  });

  const result = [];
  let dueIdx = 0;
  let confIdx = 0;

  while (result.length < sessionSize) {
    if (result.length < targetDueCount && duePool.length > 0) {
      result.push({ ...duePool[dueIdx % duePool.length].item, mixSource: 'srs_due' });
      dueIdx++;
    } else if (result.length < targetDueCount + targetConfusionCount && confusionPool.length > 0) {
      result.push({ ...confusionPool[confIdx % confusionPool.length], mixSource: 'confusion_top3' });
      confIdx++;
    } else {
      const randItem = candidateItems[result.length % candidateItems.length];
      result.push({ ...randItem, mixSource: 'random_new' });
    }
  }

  return result;
}
