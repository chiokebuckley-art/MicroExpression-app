// Run after npm install --prefix /tmp/microexpression-test jsdom fake-indexeddb
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
const require = createRequire("/tmp/microexpression-test/package.json");
const { JSDOM } = require("jsdom");
const { indexedDB } = require("fake-indexeddb");
const dom = new JSDOM('<main id="test"></main>', {
  url: "https://example.test/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  indexedDB,
});
const { BeginnerJourney, blankJourney, stagePassed, finalPass } =
  await import("../src/train/journey.js");
const db = await import("../src/store/db.js");
const { normalizeAllContent } = await import("../src/contentAdapter.js");
const { generateBenchmarkItems, scoreAssessment } =
  await import("../src/train/assessment.js");
const content = {};
for (const f of [
  "aus",
  "expressions",
  "blends",
  "plutchik",
  "va",
  "emotions27",
  "anatomy",
  "ethics",
  "scenes",
  "conversations",
])
  content[f] = JSON.parse(
    fs.readFileSync(new URL(`../content/${f}.json`, import.meta.url)),
  );
for (let n = 1; n <= 10; n++)
  content[`level${n}`] = JSON.parse(
    fs.readFileSync(
      new URL(`../content/levels/level${n}.json`, import.meta.url),
    ),
  );
normalizeAllContent(content);
const app = {
  content,
  settings: {},
  rig: {
    scheduler: { cancelFlash() {} },
    resetToNeutral() {},
    setExpressionFromRecipe() {},
    setOverlaysEnabled() {},
    async loadRig(id) {
      this.currentRigId = id;
    },
    async flashExpression(r, ms) {
      return { actualMs: ms, actualFrames: Math.round(ms / 16.67) };
    },
    async playTimeline() {},
  },
};
const el = document.querySelector("main");
const wait = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};
const view = new BeginnerJourney(el, app, "#/home");
await wait();
assert.match(el.textContent, /Learn to notice/);
const button = (t) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent === t);
async function answer(value, { hint = false } = {}) {
  if (button("Show face") && !button("Show face").hidden)
    await button("Show face").onclick();
  const show = [...el.querySelectorAll("button")].find((b) =>
    b.textContent.startsWith("Show ("),
  );
  if (show) await show.onclick();
  if (hint) button("Hint").onclick();
  const choice = [...el.querySelectorAll(".answer")].find(
    (b) => b.dataset.value === value,
  );
  assert(choice, "answer available: " + value);
  choice.onclick();
  await button("Check").onclick();
  await button("Next").onclick();
  await wait();
}
// Full wrong rounds cannot unlock any stage; next never exists before Check.
for (let stage = 0; stage < 7; stage++) {
  await view.round(
    stage,
    "test",
    Array.from({ length: 7 }, () => ({
      prompt: "test",
      answer: "yes",
      options: ["yes", "no"],
    })),
  );
  assert(!button("Next"));
  for (let i = 0; i < 7; i++) await answer("no");
  assert(!stagePassed(view.state, stage));
}
// Hinted success is half-star practice, not mastery.
await view.round(
  1,
  "full",
  Array.from({ length: 7 }, () => view.faceItem("fear")),
);
for (let i = 0; i < 7; i++) await answer("fear", { hint: i === 0 });
assert(!stagePassed(view.state, 1));
assert.equal(view.state.rounds.at(-1).supported, true);
// Region questions are uniquely selectable, content is resolved.
for (const region of ["upper", "lower"])
  for (const e of content.expressions.core) {
    assert(view.regionClue(e.id, region));
  }
assert(view.mixedItems().length >= 15);
assert(view.mixedItems().some((x) => x.timeline));
assert(view.mixedItems().every((x) => x.options.includes(x.answer)));
// Two full rounds are required; no duplicate check creates another record.
for (let rep = 0; rep < 2; rep++) {
  await view.round(
    1,
    "full",
    content.expressions.core.map((e) => view.faceItem(e.id)),
  );
  for (let i = 0; i < 7; i++) {
    const item = view.run.items[view.run.index];
    await button("Show face").onclick();
    const choice = [...el.querySelectorAll(".answer")].find(
      (b) => b.dataset.value === item.answer,
    );
    choice.onclick();
    const check = button("Check");
    await check.onclick();
    await check.onclick();
    await button("Next").onclick();
    await wait();
  }
  assert.equal(stagePassed(view.state, 1), rep === 1);
}
assert.equal(view.run.results.length, 7);
// Review calls SRS and advances due cards on correct first answers.
view.state.rounds.push({ stage: 0, passed: true, supported: false });
await view.review();
let reviewed = view.run.items[0];
await answer(reviewed.answer);
const card = await db.getSRSCard(reviewed.srsKey);
assert(card.reps > 0);
assert(card.dueAt > Date.now());
// Complete benchmark required. Boundary scores and retention separation.
const all = generateBenchmarkItems().map((x) => ({
  ...x,
  chosenEmotion: x.emotion,
}));
assert(finalPass(scoreAssessment(all)));
assert(!finalPass(scoreAssessment(all.slice(1))));
assert(
  !finalPass(
    scoreAssessment(all.map((x) => ({ ...x, chosenEmotion: "wrong" }))),
  ),
);
const s = blankJourney();
s.rounds = [{ stage: 5, group: "500", passed: true, supported: false }];
assert(!stagePassed(s, 5));
s.rounds.push({ stage: 5, group: "200", passed: true, supported: false });
assert(stagePassed(s, 5));
// Reduced motion cannot qualify as a final.
app.settings.reducedMotion = true;
await view.round(7, "final", [], "final");
assert(!view.state.final);
// Legacy best-score records do not retroactively become earned completion.
await db.recordLevelScore(6, 90);
assert.equal((await db.getLevelProgressMap())[5].completed, false);
await db.saveLevelProgress({ levelId: 6, bestScore: 80, completed: true });
assert.equal((await db.getLevelProgressMap())[5].completed, true);
// Completing a final produces a certificate only after real 42-item evidence.
app.settings.reducedMotion=false;
view.state.baseline=scoreAssessment(all);
view.state.rounds.push({stage:6,passed:true,supported:false});
view.run={assessment:'final',results:all.map(x=>({...x,ms:x.nominalMs})),items:all};
await view.end();assert(view.state.final);view.finish();assert.match(el.textContent,/Recognition training completed/);
assert(!button('Take 30-day recheck'));assert(!view.state.recheck);
view.state.final.timestamp=Date.now()-31*86400000;
view.run={assessment:'recheck',results:all.map(x=>({...x,ms:x.nominalMs})),items:all};
await view.end();assert(view.state.recheck);view.finish();assert.match(el.textContent,/Retention check passed/);
view.dispose();
console.log(
  "PASS: 7 all-wrong stage gates; first-answer/double-click/hint rules; SRS; mixed content; benchmark; reduced motion; legacy migration.",
);
