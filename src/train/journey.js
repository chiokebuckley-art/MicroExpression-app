import { LookForLesson } from './lookFor.js';
import {
  getRecord,
  putRecord,
  logTrial,
  getAllSRSCards,
  getTrials,
  putSRSCard,
  getSRSCard,
  saveSetting,
  getAssessments,
  saveAssessment,
} from "../store/db.js";
import { buildSessionMix, createSRSCard, updateSRSCard } from "./srs.js";
import { generateBenchmarkItems, scoreAssessment } from "./assessment.js";
export const NAMES = [
  "Why & limits",
  "Meet the 7",
  "Clues by region",
  "Tricky pairs",
  "Faint faces",
  "Flash ladder",
  "Mixed & context",
  "Final check",
];
export const CUES = {
  happiness: "Look for raised cheeks and lifted mouth corners.",
  sadness: "Look for raised inner brows and lowered mouth corners.",
  anger: "Look for lowered, drawn-together brows and pressed lips.",
  fear: "Look for raised, drawn-together brows and stretched lips.",
  disgust: "Look for a wrinkled nose and raised upper lip.",
  surprise: "Look for raised brows and an open jaw.",
  contempt: "Look for one tightened, raised mouth corner.",
  happiness_social:
    "Look for lifted mouth corners with less cheek movement. This does not prove a smile is insincere.",
};
const CORE = Object.keys(CUES).slice(0, 7);
const PAIRS = [
  ["fear", "surprise"],
  ["anger", "disgust"],
  ["contempt", "happiness"],
  ["sadness", "fear"],
  ["happiness", "happiness_social"],
];
const DAY = 86400000;
export const blankJourney = () => ({
  id: "beginnerJourneyV2",
  rounds: [],
  days: [],
  baseline: null,
  final: null,
  recheck: null,
  lessonLookForSeenAt: null,
  baselineSkippedAt: null,
});
export function stagePassed(s, stage) {
  const good = s.rounds.filter(
    (r) => r.stage === stage && r.passed && !r.supported && !r.preview,
  );
  if (stage === 0) return good.length > 0;
  if (stage === 1) return good.length >= 2;
  if (stage === 2)
    return ["upper", "lower"].every((g) => good.some((r) => r.group === g));
  if (stage === 3)
    return PAIRS.every((_, i) => good.some((r) => r.group === String(i)));
  if (stage === 4) return good.some((r) => r.group === "0.3");
  if (stage === 5) return good.some((r) => Number(r.group) <= 200);
  if (stage === 6) return good.length > 0;
  return Boolean(s.final);
}
export function finalPass(result) {
  return (
    result.totalItems === 42 &&
    result.bySpeed[200].accuracy >= 75 &&
    result.bySpeed[100].accuracy >= 60
  );
}
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export class BeginnerJourney {
  constructor(el, app, route) {
    this.el = el;
    this.app = app;
    this.rig = app.rig;
    this.route = route;
    this.dead = false;
    this.init();
  }
  dispose() {
    this.dead = true;
    document.querySelector(".flash-cue")?.remove();
    if (this.player) this.player.isPlaying = false;
    this.rig?.scheduler.cancelFlash();
    this.rig?.resetToNeutral();
    this.lesson?.dispose();
    return this.restoreRun();
  }
  async init() {
    this.state =
      (await getRecord("progress", "beginnerJourneyV2")) || blankJourney();
    if (this.dead) return;
    const n = Number(this.route.split("/")[2]);
    if (this.route === "#/lesson/look-for") return this.lookFor();
    if (this.route === "#/assessment") return !this.state.lessonLookForSeenAt ? this.lookFor(() => this.baselinePrompt()) : this.baselinePrompt();
    if (this.route === "#/review") return this.review();
    if (this.route === "#/finish") return this.finish();
    if (
      this.route.startsWith("#/stage/") &&
      Number.isInteger(n) &&
      n >= 0 &&
      n <= 7
    )
      return this.stage(n);
    return this.home();
  }
  async save() {
    await putRecord("progress", this.state);
  }
  button(text, fn) {
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.textContent = text;
    b.onclick = fn;
    this.el.querySelector(".journey-actions").append(b);
    return b;
  }
  shell(title, text = "") {
    if (this.dead) return;
    this.el.innerHTML = `<div class="level-view journey"><a href="#/home">← Your path</a><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="journey-body"></div><div class="journey-actions btn-row"></div></div>`;
  }
  body(html) {
    this.el.querySelector(".journey-body").innerHTML = html;
  }
  async home() {
    const cards = await getAllSRSCards();
    if (this.dead) return;
    const due = cards.filter((c) => c.dueAt <= Date.now()).length;
    this.shell(
      "Learn to notice. Learn to ask.",
      "Practice recognizing expression patterns on 3D faces. A face alone cannot tell you what someone feels or whether they are truthful.",
    );
    const done = NAMES.filter((_, i) => stagePassed(this.state, i)).length;
    this.body(
      `<p>${done}/8 stages · ${this.state.rounds.reduce((n, r) => n + (r.passed && !r.preview ? (r.supported ? 0.5 : 1) : 0), 0)} stars · ${this.state.days.length} practice days (breaks never erase progress)</p><progress max="8" value="${done}"></progress><div class="vocab-cards-grid">${NAMES.map((n, i) => `<a class="vocab-card" href="#/stage/${i}">${stagePassed(this.state, i) ? "★" : "○"} ${i} · ${n}</a>`).join("")}</div>${this.state.final ? `<p>30-day recheck: ${new Date(this.state.final.timestamp + 30 * DAY).toLocaleDateString()}.</p>` : ""}`,
    );
    this.el.querySelector(".journey-body").insertAdjacentHTML("beforeend", `<p><a href="#/lesson/look-for">Review: What to look for</a></p>${!this.state.baseline ? '<aside class="baseline-banner">Baseline not taken yet · <a href="#/assessment">Take it now</a></aside>' : ""}`);
    const collected = [
      ...new Set(this.state.rounds.filter(r => !r.preview).flatMap((r) => r.cards || [])),
    ];
    if (collected.length)
      this.el
        .querySelector(".journey-body")
        .insertAdjacentHTML(
          "beforeend",
          `<p>Face cards (${collected.length}/7): ${collected.map(esc).join(" · ")}</p>`,
        );
    const medals = [
      ...new Set(
        this.state.rounds
          .filter((r) => r.stage === 5 && r.passed && !r.supported)
          .map((r) => r.group),
      ),
    ];
    if (medals.length)
      this.el
        .querySelector(".journey-body")
        .insertAdjacentHTML(
          "beforeend",
          `<p>Speed medals: ${medals.map(esc).join(" ms · ")} ms</p>`,
        );
    if (stagePassed(this.state, 2))
      this.button("Clue book", () => {
        this.shell(
          "Your clue book",
          "Patterns suggest possibilities. Ask before drawing conclusions.",
        );
        this.body(
          CORE.map(
            (e) => `<p><strong>${esc(e)}</strong>: ${esc(CUES[e])}</p>`,
          ).join(""),
        );
      });
    this.button(
      due ? `Review (${due} due)` : "Practice review",
      () => (location.hash = "#/review"),
    );
    if (stagePassed(this.state, 1))
      this.button(
        "Go deeper: original lessons",
        () => (location.hash = "#/library"),
      );
  }
  async stage(n, { preview = false } = {}) {
    this.preview = preview;
    if (n > 1 && !preview && !stagePassed(this.state, n - 1)) {
      this.shell("One step at a time", `Finish ${NAMES[n - 1]} first.`);
      this.button(`Go to ${NAMES[n - 1]}`, () => (location.hash = `#/stage/${n - 1}`));
      if (n < 7) this.button("Preview this stage", () => this.stage(n, { preview: true }));
      return;
    }
    if (n === 7) return this.finish();
    if (n === 1 && !this.state.lessonLookForSeenAt) return this.lookFor(() => this.stage(1, { preview }));
    if (n > 0 && !this.rig) {
      this.shell(
        "3D display unavailable",
        "Face checks require a working 3D display. Enable hardware acceleration or open this app in a WebGL-capable browser.",
      );
      return;
    }
    if (n === 1 && !preview && !this.state.baseline && !this.state.baselineSkippedAt) return this.baselinePrompt();
    this.shell(
      `${n} · ${NAMES[n]}`,
      n === 0
        ? "Notice patterns, consider context, and ask. Faces cannot establish honesty."
        : "Study the clue, then check your first answer. Hints earn practice credit; pass again without hints to unlock the next stage.",
    );
    if (preview) this.el.querySelector(".journey-body").insertAdjacentHTML("beforebegin", '<p class="preview-badge">Preview · doesn’t count toward progress</p>');
    if (n === 0) {
      this.button("Check the three ideas", () =>
        this.round(0, "ethics", [
          {
            prompt: "Can a face prove someone is dishonest?",
            answer: "No",
            options: ["Yes", "No"],
            cue: "Expressions do not establish honesty.",
          },
          {
            prompt: "Someone looks afraid. What should you do?",
            answer: "Ask gently",
            options: ["Accuse them", "Ask gently"],
            cue: "Fear has many possible causes.",
          },
          {
            prompt: "Can context change what a face might mean?",
            answer: "Yes",
            options: ["Yes", "No"],
            cue: "Consider context, culture, and the person’s usual expression.",
          },
        ]),
      );
      return;
    }
    if (n === 1) {
      this.body(
        `<p>Pass 6/7 twice, without hints. Practice flashes start at 500, then 300, then 200 ms.</p><p><a href="#/lesson/look-for">Review: What to look for</a></p><div class="btn-row">${CORE.map((e) => `<button class="btn btn-secondary" data-learn="${e}">${e}</button>`).join("")}</div><p id="clue"></p>`,
      );
      this.el.querySelectorAll("[data-learn]").forEach(
        (b) =>
          (b.onclick = () => {
            this.rig.setExpressionFromRecipe(this.expr(b.dataset.learn));
            this.el.querySelector("#clue").textContent = CUES[b.dataset.learn];
          }),
      );
      this.button("Check all seven", () =>
        this.round(
          n,
          "full",
          shuffle(CORE).map((e) => this.faceItem(e)),
        ),
      );
    }
    if (n === 2) {
      this.body(
        "<p>Identify the visible movement, rather than guessing a whole emotion from half a face. Pass 80% in each region.</p>",
      );
      for (const region of ["upper", "lower"])
        this.button(`${region} face check`, () =>
          this.round(
            n,
            region,
            shuffle(CORE).map((e) => {
              const item = this.faceItem(e);
              item.region = region;
              item.prompt = "Which movement is visible in this region?";
              item.answer = this.regionClue(e, region);
              item.options = [
                ...new Set(CORE.map((x) => this.regionClue(x, region))),
              ];
              item.cue = item.answer;
              return item;
            }),
          ),
        );
    }
    if (n === 3) {
      this.body(
        "<p>Compare each pair before a 1-second check. Pass 85% per pair. Smile patterns do not establish sincerity.</p>",
      );
      PAIRS.forEach((pair, i) => {
        this.button(`Compare ${pair.join(" / ")}`, () => {
          const previews = pair.map((e) => {
            this.rig.setExpressionFromRecipe(this.expr(e));
            this.rig.renderer.render(this.rig.scene, this.rig.camera);
            return `<figure style="margin:0;min-width:0"><img style="width:100%;border-radius:12px" src="${this.rig.renderer.domElement.toDataURL()}" alt="${esc(e)} expression pattern"><figcaption>${esc(e)}: ${esc(CUES[e])}</figcaption></figure>`;
          });
          this.body(
            `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${previews.join("")}</div>`,
          );
          this.rig?.resetToNeutral();
        });
        this.button(`Check ${pair.join(" / ")}`, () =>
          this.round(
            n,
            String(i),
            shuffle(
              Array.from({ length: 8 }, (_, j) => ({
                ...this.faceItem(pair[j % 2]),
                options: pair,
                ms: 1000,
              })),
            ),
          ),
        );
      });
    }
    if (n === 4) {
      this.body("<p>Practice faint movements. Pass 75% at 30% intensity.</p>");
      for (const scale of [0.6, 0.3])
        this.button(`Check at ${scale * 100}%`, () =>
          this.round(
            n,
            String(scale),
            shuffle([...CORE, ...CORE]).map((e) => ({
              ...this.faceItem(e),
              scale,
            })),
          ),
        );
    }
    if (n === 5) {
      this.body(
        "<p>Start at 1 second; 3 seconds is a warm-up. Pass 70% for every emotion at 200 ms to advance.</p>",
      );
      for (const ms of [3000, 1000, 500, 300, 200, 100, 67])
        this.button(`${ms} ms`, () =>
          this.round(
            n,
            String(ms),
            shuffle([...CORE, ...CORE, ...CORE, ...CORE]).map((e) => ({
              ...this.faceItem(e),
              ms,
            })),
          ),
        );
    }
    if (n === 6) {
      this.body(
        "<p>Pass 75% across blends, masks, scenes, and gentle follow-up questions.</p>",
      );
      this.button("Start mixed check", () =>
        this.round(n, "mixed", this.mixedItems()),
      );
    }
  }
  expr(id) {
    return this.app.content.expressions.recipes.find((e) => e.id === id);
  }
  regionClue(e, r) {
    const x = this.expr(e);
    return r === "upper"
      ? `${x.browsForehead || "Relaxed brows"}; ${x.eyesLids || "relaxed eyelids"}`
      : x.noseMouthJaw || CUES[e];
  }
  faceItem(e) {
    return {
      emotion: e,
      answer: e,
      options: CORE,
      cue: CUES[e],
      prompt: "Which expression pattern is shown?",
      recipe: this.expr(e),
    };
  }
  mixedItems() {
    const c = this.app.content;
    const items = (c.scenes.level9Scenes || []).slice(0, 6).map((s) => ({
      prompt: `${s.setting || s.title || ""} ${s.question}`,
      answer: s.answer,
      options: s.options,
      cue: s.explanation,
      recipe: this.expr(s.faceExpression),
    }));
    for (const v of (c.conversations.conversations || []).slice(0, 3))
      for (const q of [v.signalQuestion, v.responseQuestion])
        items.push({
          prompt: `${v.setting} “${v.dialogueLine}” ${q.prompt}`,
          answer: q.answer,
          options: q.options,
          cue: q.explanation,
          timeline: v.keyframes,
        });
    for (const b of (c.blends.blends || []).slice(0, 3))
      items.push({
        prompt: "Which two expression patterns are combined?",
        answer: b.name || b.label,
        options: (c.blends.blends || [])
          .slice(0, 3)
          .map((x) => x.name || x.label),
        cue:
          b.explanation ||
          "Blends describe visible combinations, not a person’s hidden feelings.",
        recipe: b,
      });
    for (const e of ["fear", "anger", "sadness"])
      items.push({
        ...this.faceItem(e),
        prompt: "Which pattern appeared before the smile?",
        ms: 500,
        mask: true,
      });
    return shuffle(items.filter((i) => i.answer && i.options?.length));
  }
  async lookFor(after = null) {
    const seen = async () => {
      if (!this.state.lessonLookForSeenAt) { this.state.lessonLookForSeenAt = Date.now(); await this.save(); }
    };
    this.lesson = new LookForLesson({ mount: this.el, rig: this.rig, content: this.app.content,
      onSeen: seen, continueLabel: this.state.baseline || this.state.baselineSkippedAt ? 'Continue to Stage 1' : 'Continue to baseline',
      onDone: async () => {
        await seen();
        this.lesson.dispose(); this.lesson = null;
        if (this.dead) return;
        if (after) return after();
        if (location.hash === '#/stage/1') return this.stage(1);
        location.hash = '#/stage/1';
      }
    });
    await this.lesson.render();
  }
  baselinePrompt() {
    this.shell('Your starting point', 'Take 42 brief trials. No passing score is needed. Some faces will be very fast (50–100 ms). That’s expected; answer your best guess.');
    this.body('<p>The baseline lets you compare your results after practice. You can learn now and take it later, before the final check.</p>');
    if (!this.rig) { this.body('<p>A working 3D display is needed to take the baseline. You can still review the reference cards.</p>'); return; }
    this.button('Practice 3 flashes (200 ms)', () => this.round('practice', 'warmup', ['happiness','fear','surprise'].map(e => ({ ...this.faceItem(e), ms:200 })), null, { practice:true }));
    this.button('Start baseline', () => this.assessment('baseline'));
    this.button('Skip for now', async () => { this.state.baselineSkippedAt = Date.now(); await this.save(); if (!this.dead) this.stage(1); });
  }
  restoreRun() {
    if (this._restoring) return this._restoring;
    const saved = this.runView;
    if (!saved || !this.rig) return Promise.resolve();
    this.runView = null;
    this._restoring = (async () => {
      try {
        if (saved.locked && saved.identity !== this.rig.currentRigId) await this.rig.loadRig(saved.identity);
      } finally {
        this.rig.cameraLocked = false;
        this.rig.controls && (this.rig.controls.enabled = saved.controls);
        this.rig.setCameraPreset?.(saved.preset);
        this.rig.unlockIdentity?.();
        this.rig._notifyRig?.();
      }
    })().finally(() => { this._restoring = null; });
    return this._restoring;
  }
  async round(stage, group, items, assessment = null, { preview = this.preview || false, practice = false } = {}) {
    await this.restoreRun();
    if (this.dead) return;
    const locked = items.some(x => x.recipe || x.timeline);
    if (this.rig && items.some(x => x.recipe || x.timeline)) {
      this.runView = { identity:this.rig.currentRigId, preset:this.rig.currentPreset, controls:this.rig.controls?.enabled, locked };
      if (locked) this.rig.lockIdentity?.(assessment ? 'set by test' : 'practice in progress');
      this.rig.cameraLocked = true;
      this.rig.setCameraPreset?.('front');
      if (this.rig.controls) this.rig.controls.enabled = false;
      this.rig._notifyRig?.();
    }
    if (stage === 1) {
      const rounds = this.state.rounds.filter(r => r.stage === 1 && r.passed && !r.preview && !r.supported).length;
      const ms = [500,300,200][Math.min(2,rounds)];
      items = items.map(x => x.recipe && !x.ms ? { ...x,ms } : x);
    }
    if (this.rig) this.rig.minimumFlashMs = this.app.settings.beginnerMinimumFlash !== false && !stagePassed(this.state,5) ? 200 : 0;
    if (!assessment) {
      const floor = this.app.settings.beginnerMinimumFlash !== false && !stagePassed(this.state,5) ? 200 : 0;
      items = items.map(x => x.ms ? { ...x, requestedMs:x.ms, ms:Math.max(floor,x.ms) } : x);
    }

    this.run = {
      stage,
      group,
      items,
      assessment,
      preview: !assessment && preview,
      practice,
      index: 0,
      results: [],
      id: crypto.randomUUID(),
    };
    return this.item();
  }
  async prepareFace() {
    await this.rig.ready;
    if (this.dead || this.rig.isReady === false) return false;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (this.dead) return false;
    const mount = document.getElementById("rigCanvasMount");
    if (!mount) return !this.dead;
    mount.scrollIntoView({ block: "center", behavior: "instant" });
    this.rig.resetToNeutral();
    let cue = mount.querySelector(".flash-cue");
    if (!cue) {
      cue = document.createElement("div");
      cue.className = "flash-cue";
      cue.setAttribute("role", "status");
      mount.append(cue);
    }
    return new Promise((resolve) => {
      let start;
      const ready = (now) => {
        if (this.dead || document.visibilityState === "hidden") {
          cue.textContent = "Paused — tap Show again when ready.";
          resolve(false);
          return;
        }
        start ??= now;
        const elapsed = now - start;
        cue.textContent =
          elapsed < 750
            ? "Look at the face · 2"
            : elapsed < 1500
              ? "Get ready · 1"
              : "Watch now";
        if (elapsed >= 1500) resolve(true);
        else requestAnimationFrame(ready);
      };
      requestAnimationFrame(ready);
    });
  }
  async item() {
    if (this.dead) return;
    document.querySelector(".flash-cue")?.remove();
    const run = this.run;
    if (run.index >= run.items.length) return this.end();
    const x = run.items[run.index];
    let selected = null,
      checked = false,
      hint = false,
      shown = false,
      busy = false,
      replayCount = 0,
      slowPreviewUsed = false;
    this.shell(
      run.assessment
        ? `${run.assessment} · ${run.index + 1}/42`
        : `${NAMES[run.stage] || "Review"} · ${run.index + 1}/${run.items.length}`,
      `${run.preview ? "Preview · doesn’t count toward progress. " : ""}${x.prompt || "Which expression pattern is shown?"}`,
    );
    this.body(
      `<div class="q-options-grid">${shuffle(x.options)
        .map(
          (o, i) =>
            `<button class="btn btn-secondary answer" data-value="${esc(o)}">${esc(o)}</button>`,
        )
        .join("")}</div>${run.assessment ? "<p>Replay or slow down if needed. These attempts are marked supported practice.</p>" : ""}<p id="item-feedback" role="status"></p>`,
    );
    const feedback = this.el.querySelector("#item-feedback");
    const choices = [...this.el.querySelectorAll(".answer")];
    choices.forEach((b) => {
      b.disabled = Boolean(x.recipe || x.timeline);
      b.onclick = () => {
        if (checked) return;
        selected = b.dataset.value;
        choices.forEach((c) => c.classList.toggle("active", c === b));
        check.disabled = !shown;
      };
    });
    const present = async (slow = false) => {
      if (busy || checked || this.dead) return;
      busy = true;
      show.disabled = true;
      check.disabled = true;
      choices.forEach((b) => (b.disabled = true));
      if (shown) {
        hint = true;
        replayCount++;
      }
      if (slow) {
        hint = true;
        slowPreviewUsed = true;
      }
      try {
        if (x.rigId && this.rig.currentRigId !== x.rigId)
          await this.rig.loadRig(x.rigId);
        if (this.dead) return;
        this.rig.setCameraPreset?.(x.region === "upper" ? "eyeCloseup" : x.region === "lower" ? "mouthCloseup" : "front");
        this.rig.setOverlaysEnabled(false);
        if ((x.ms || x.timeline) && !(await this.prepareFace())) {
          shown = false;
          return;
        }
        let recipe = x.recipe;
        if (x.region)
          recipe = {
            ...recipe,
            aus: recipe.aus.filter((a) =>
              x.region === "upper" ? Number(a.au) <= 7 : Number(a.au) > 7,
            ),
          };
        if (x.timeline) {
          const { TimelinePlayer } = await import("../face/timeline.js");
          this.player = new TimelinePlayer({
            keyframes: x.timeline,
            auCatalog: this.app.content.aus,
            expressionsCatalog: this.app.content.expressions,
          });
          await this.rig.playTimeline(this.player);
        } else if (x.ms) {
          x.telemetry = await this.rig.flashExpression(
            recipe,
            slow ? Math.max(1500, x.ms) : x.ms,
            {
              scale: x.scale || 1,
              assessment: Boolean(run.assessment),
            },
          );
          if (x.mask && !this.dead)
            this.rig.setExpressionFromRecipe(this.expr("happiness_social"));
        } else if (recipe)
          this.rig.setExpressionFromRecipe(recipe, { scale: x.scale || 1 });
        if (this.dead) return;
        if (x.telemetry?.cancelled || document.visibilityState === "hidden") {
          shown = false;
          return;
        }
        shown = true;
        const nextRig = run.items[run.index + 1]?.rigId;
        if (nextRig) this.rig.preload?.(nextRig).catch(() => {});
        const cue = document.querySelector(".flash-cue");
        if (cue)
          cue.textContent = slow
            ? "Slow preview complete — replay or choose an answer."
            : "Flash complete — replay if you missed it.";
        feedback.textContent = slow
          ? "Slow preview: supported practice."
          : "Missed it? Tap Show again, or try Slow preview.";
      } catch (error) {
        shown = false;
        feedback.textContent =
          "The face could not be shown. Please try Show again.";
        console.warn("Face presentation failed", error);
      } finally {
        if (this.dead) return;
        busy = false;
        choices.forEach((b) => (b.disabled = !shown));
        check.disabled = !shown || !selected;
        show.disabled = false;
        show.textContent = x.ms ? `Show again (${x.ms} ms)` : "Show again";
      }
    };
    const show = this.button(x.ms ? `Show (${x.ms} ms)` : "Show face", () =>
      present(false),
    );
    if (x.ms) this.button("Slow preview (1.5 s)", () => present(true));
    if (!x.recipe && !x.timeline) {
      shown = true;
      show.hidden = true;
    }
    if (!run.assessment)
      this.button("Hint", () => {
        if (checked) return;
        hint = true;
        feedback.textContent =
          x.cue || "Look carefully, consider context, and avoid certainty.";
      });
    const check = this.button("Check", async () => {
      if (checked || !shown || !selected || busy) return;
      checked = true;
      check.disabled = true;
      show.disabled = true;
      choices.forEach((b) => (b.disabled = true));
      const result = {
        ...x,
        chosenEmotion: selected,
        correct: selected === x.answer,
        firstTry: true,
        hintUsed: hint,
        replayCount,
        slowPreviewUsed,
        shownEmotion: x.emotion,
        nominalMs: x.ms || 0,
        actualMs: x.telemetry?.actualMs,
        actualFrames: x.telemetry?.actualFrames,
        stage: run.stage,
        group: run.group,
        preview: run.preview,
        practice: run.practice,
        itemId: `${run.id}:${run.index}`,
        timestamp: Date.now(),
      };
      run.results.push(result);
      if (!run.assessment && !run.practice) {
        await logTrial(result);
        if (!run.preview && (x.srsKey || x.emotion)) {
          const key = x.srsKey || `emotion:${x.emotion}`;
          const old =
            (await getSRSCard(key)) ||
            createSRSCard(x.kind || "emotion", x.id || x.emotion);
          await putSRSCard(
            updateSRSCard(old, { correct: result.correct && !hint }),
          );
        }
      }
      if (this.dead) return;
      feedback.textContent = run.assessment
        ? "Answer recorded."
        : `${result.correct ? "Correct." : "Answer: " + x.answer + "."} ${x.cue || ""}${hint ? " Supported practice." : ""}`;
      const next = this.button("Next", () => {
        next.disabled = true;
        run.index++;
        this.item();
      });
    });
    check.disabled = true;
  }
  async end() {
    const r = this.run;
    await this.restoreRun();
    if (this.dead) return;
    if (r.practice) {
      this.shell('Practice flashes complete', 'These three flashes are not scored or saved as a baseline.');
      this.button('Continue to baseline', () => this.baselinePrompt());
      return;
    }
    if (r.assessment) {
      const score = scoreAssessment(
        r.results.map((x) => ({ ...x, emotion: x.emotion, nominalMs: x.ms })),
      );
      score.kind = r.assessment;
      score.supported = Boolean(
        this.app.settings.reducedMotion || r.results.some((x) => x.hintUsed),
      );
      score.replayCount = r.results.reduce(
        (n, x) => n + (x.replayCount || 0),
        0,
      );
      await saveAssessment(score);
      if (r.assessment === "baseline") this.state.baseline = score;
      else if (!score.supported && finalPass(score)) {
        if (r.assessment === "final") this.state.final = score;
        else if (
          this.state.final &&
          Date.now() >= this.state.final.timestamp + 30 * DAY &&
          [200, 100].every(
            (ms) =>
              score.bySpeed[ms].accuracy >=
              this.state.final.bySpeed[ms].accuracy - 10,
          )
        )
          this.state.recheck = score;
      }
      await this.save();
      this.shell(
        "Check complete",
        `200 ms: ${score.bySpeed[200].accuracy}% · 100 ms: ${score.bySpeed[100].accuracy}%${score.supported ? " · Supported practice (replay, slow preview, or reduced motion); not a speed qualification." : ""}`,
      );
      this.button("Continue", () => {
        const next = r.assessment === "baseline" ? "#/stage/1" : "#/finish";
        if (location.hash === next) {
          if (r.assessment === "baseline") this.stage(1);
          else this.finish();
        } else location.hash = next;
      });
      return;
    }
    const score =
      (100 * r.results.filter((x) => x.correct).length) / r.items.length;
    let pass =
      score >=
      ({ 0: 100, 1: 600 / 7, 2: 80, 3: 85, 4: 75, 5: 70, 6: 75 }[r.stage] ||
        75);
    if (r.stage === 5)
      pass = CORE.every((e) => {
        const rows = r.results.filter((x) => x.emotion === e);
        return (
          rows.length >= 4 &&
          rows.filter((x) => x.correct).length / rows.length >= 0.7
        );
      });
    const supported =
      r.results.some((x) => x.hintUsed || (x.requestedMs && x.ms > x.requestedMs)) ||
      (r.stage === 5 && this.app.settings.reducedMotion);
    this.state.rounds.push({
      stage: r.stage,
      group: r.group,
      score,
      passed: pass,
      supported,
      preview: Boolean(r.preview),
      timestamp: Date.now(),
      cards:
        r.stage === 1
          ? r.results
              .filter((x) => x.correct && !x.hintUsed)
              .map((x) => x.emotion)
          : [],
    });
    const day = new Date().toLocaleDateString("en-CA");
    if (!r.preview && !this.state.days.includes(day)) this.state.days.push(day);
    await this.save();
    if (r.stage === 0 && pass && !supported && !r.preview) {
      await saveSetting("ethicsCompleted", true);
      this.app.settings.ethicsCompleted = true;
    }
    this.shell(
      r.preview ? "Preview complete · doesn’t count toward progress" : pass ? "Round passed" : "Keep practicing",
      r.preview ? `${Math.round(score)}% · Practice only; no progress earned.` : `${Math.round(score)}% · ${pass ? (supported ? "½ star — repeat without support to advance" : "★ First-answer star") : "No progress lost. Study the clues and try a new round."}`,
    );
    if (r.stage === 1 && pass && !r.preview)
      this.body(
        `<p>Face cards: ${r.results
          .filter((x) => x.correct)
          .map((x) => esc(x.emotion))
          .join(" · ")}</p>`,
      );
    if (r.stage === 5 && pass && !supported && !r.preview)
      this.body(`<p>Speed medal: ${r.group} ms</p>`);
    this.button("Back to path", () => (location.hash = "#/home"));
    this.button("Practice again", () =>
      r.stage === "review" ? this.review() : this.stage(r.stage, { preview: r.preview }),
    );
  }
  async assessment(kind) {
    if (
      kind !== "baseline" &&
      (!stagePassed(this.state, 0) || !stagePassed(this.state, 6) || !this.state.baseline)
    )
      return this.home();
    const items = generateBenchmarkItems({
      seed: kind === "baseline" ? 0x52463236 : Math.floor(Date.now() / 1000),
    }).map((x) => ({
      ...this.faceItem(x.emotion),
      ms: x.nominalMs,
      rigId: x.rigId,
    }));
    return this.round(7, kind, items, kind);
  }
  async review() {
    if (!this.rig) {
      this.shell(
        "3D display unavailable",
        "Face review requires a WebGL-capable browser.",
      );
      return;
    }
    if (!stagePassed(this.state, 0)) return this.stage(0);
    const cards = await getAllSRSCards(),
      trials = await getTrials();
    if (this.dead) return;
    const candidates = CORE.map((e) => ({
      ...this.faceItem(e),
      id: e,
      kind: "emotion",
      srsKey: `emotion:${e}`,
    }));
    const addQuestion = (q, kind, recipe = null) => {
      if (q?.answer && q.options?.length)
        candidates.push({
          id: q.id,
          kind,
          srsKey: `${kind}:${q.id}`,
          prompt: q.question || q.prompt,
          answer: q.answer,
          options: q.options,
          cue: q.explanation,
          recipe,
        });
    };
    for (const q of this.app.content.level1.quiz || []) addQuestion(q, "vocab");
    for (const q of this.app.content.level2.quiz || []) addQuestion(q, "au");
    for (const q of this.app.content.level3.drillItems || [])
      addQuestion(q, "au", {
        aus: q.aus?.map((au) => ({ au, intensity: 1 })) || [],
      });
    for (const q of this.app.content.scenes.level9Scenes || [])
      addQuestion(q, "scene", this.expr(q.faceExpression));
    for (const card of cards) {
      if (candidates.some((x) => x.srsKey === card.key)) continue;
      const t = [...trials]
        .reverse()
        .find((t) => t.srsKey === card.key && t.answer && t.options);
      if (t) candidates.push({ ...t, srsKey: card.key });
    }
    const items = buildSessionMix({
      candidateItems: candidates,
      srsCardsMap: new Map(cards.map((c) => [c.key || c.id, c])),
      recentTrials: trials,
      sessionSize: 10,
    });
    return this.round("review", "review", items);
  }
  finish() {
    this.shell(
      "Your recognition-training finish line",
      "Pass 75% at 200 ms and 60% at 100 ms. Recheck after 30 days, within 10 percentage points at each speed.",
    );
    if (!stagePassed(this.state, 0) || !stagePassed(this.state, 6) || !this.state.baseline) {
      this.body('<p>Complete stages 0–6 and take a baseline before the final check. A baseline is needed for a valid before/after comparison.</p><a href="#/assessment">Take baseline</a>');
      return;
    }
    if (!this.state.final) {
      this.button("Start final check", () => this.assessment("final"));
      return;
    }
    const s = this.state;
    this.body(
      `<article class="vocab-card certificate"><h2>★ Recognition training completed</h2><p>3D expression-pattern recognition · ${new Date(s.final.timestamp).toLocaleDateString()}</p><p>Baseline: ${s.baseline.overallAccuracy}% → Final: ${s.final.overallAccuracy}%</p><p>200 ms: ${s.final.bySpeed[200].accuracy}% · 100 ms: ${s.final.bySpeed[100].accuracy}%</p><p>${s.recheck ? "Retention check passed: " + s.recheck.overallAccuracy + "%" : "Retention check due " + new Date(s.final.timestamp + 30 * DAY).toLocaleDateString()}</p><p>This is practice evidence on simulated adult faces, not certification of honesty detection or real-world emotion-reading ability.</p></article>`,
    );
    this.button("Print / save certificate", () => window.print());
    if (Date.now() >= s.final.timestamp + 30 * DAY)
      this.button("Take 30-day recheck", () => this.assessment("recheck"));
  }
}
