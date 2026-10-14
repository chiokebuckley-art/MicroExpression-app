import { BeginnerJourney, stagePassed } from './train/journey.js?v=4';
/**
 * Reading Faces — Main Application Router & Orchestrator.
 * Connects the realistic Three.js 3D FaceRig, 10-Level Curriculum, Ethics Gate,
 * Standardized 42-Item Benchmark Assessment, Confusion Matrix Dashboard,
 * Offline MediaPipe Mirror Mode, AU Lab (`#/au-lab`), and Settings/Export.
 */

import { FaceRig, CAMERA_PRESETS, loadModelRegistry } from './face/rig.js';
import { CANONICAL_ARKIT_52 } from './face/auMap.js';
import { normalizeAllContent } from './contentAdapter.js';
import { runStartupMigrations } from './store/migrate.js';
import {
  getRecord,
  getAllSettings,
  saveSetting,
  getLevelProgressMap,
  getTrials,
  getStaircases,
  getAllSRSCards,
  getAssessments,
  saveAssessment
} from './store/db.js';
import { downloadBackupFile, importDatabaseJSON, resetAllProgress } from './store/export.js';
import { generateBenchmarkItems, scoreAssessment, isAssessmentDue } from './train/assessment.js';
import { CORE_EMOTIONS_7 } from './train/staircase.js';

import { Level1LiteracyView } from './levels/L1-literacy.js';
import { Level2AnatomyView } from './levels/L2-anatomy.js';
import { Level3AUsView } from './levels/L3-aus.js';
import { Level4Core7View } from './levels/L4-core7.js';
import { Level5SubtleView } from './levels/L5-subtle.js';
import { Level6MicroView } from './levels/L6-micro.js';
import { Level7BlendsView } from './levels/L7-blends.js';
import { Level8Beyond7View } from './levels/L8-beyond7.js';
import { Level9ContextView } from './levels/L9-context.js';
import { Level10RealWorldView } from './levels/L10-realworld.js';
import { EthicsModuleView } from './levels/ethics.js';
import { AnalyticsDashboard } from './ui/dashboard.js';
import { MirrorModeController } from './ui/mirror.js';

const LEVEL_TITLES = [
  { id: 1, short: 'L1: Literacy', title: 'Emotional Literacy & Dimensional Foundations' },
  { id: 2, short: 'L2: Anatomy', title: 'Facial Anatomy, 3 Zones & 11 Muscles' },
  { id: 3, short: 'L3: 22 AUs', title: 'Action Units (FACS Core 22)' },
  { id: 4, short: 'L4: Core 7', title: 'The 7 Universal Expressions (Full View)' },
  { id: 5, short: 'L5: Subtle A-E', title: 'Subtle & Partial Expressions' },
  { id: 6, short: 'L6: Speed & Pairs', title: 'Micro-Expression Speed & Confusable Pairs' },
  { id: 7, short: 'L7: Blends & Masks', title: 'Compound Blends, Masking & Timing' },
  { id: 8, short: 'L8: Beyond 7', title: 'Extended & Self-Conscious States' },
  { id: 9, short: 'L9: Context', title: 'Expressions in Context & Misreads' },
  { id: 10, short: 'L10: Real-World', title: 'Conversations & Context-Swap Calibration' }
];

export class ReadingFacesApp {
  constructor() {
    this.content = {};
    this.registry = null;
    this.settings = {};
    this.levelProgress = new Map();
    this.rig = null;
    this.activeViewInstance = null;
    this.currentRoute = '#/level/1';
    this.pendingPairDrill = null;
  }

  async init() {
    await runStartupMigrations();
    this.settings = await getAllSettings();
    const progList = await getLevelProgressMap();
    this.levelProgress = new Map(progList.map((p) => [Number(p.levelId), p]));

    // Load all JSON content in parallel
    const [
      aus,
      expressions,
      blends,
      plutchik,
      va,
      emotions27,
      anatomy,
      ethics,
      scenes,
      conversations,
      registry,
      ...levels
    ] = await Promise.all([
      fetch('./content/aus.json').then((r) => r.json()),
      fetch('./content/expressions.json').then((r) => r.json()),
      fetch('./content/blends.json').then((r) => r.json()),
      fetch('./content/plutchik.json').then((r) => r.json()),
      fetch('./content/va.json').then((r) => r.json()),
      fetch('./content/emotions27.json').then((r) => r.json()),
      fetch('./content/anatomy.json').then((r) => r.json()),
      fetch('./content/ethics.json').then((r) => r.json()),
      fetch('./content/scenes.json').then((r) => r.json()),
      fetch('./content/conversations.json').then((r) => r.json()),
      loadModelRegistry(),
      ...Array.from({ length: 10 }, (_, i) => fetch(`./content/levels/level${i + 1}.json`).then((r) => r.json()))
    ]);

    this.content = {
      aus,
      expressions,
      blends,
      plutchik,
      va,
      emotions27,
      anatomy,
      ethics,
      scenes,
      conversations
    };
    levels.forEach((lvl, idx) => {
      this.content[`level${idx + 1}`] = lvl;
    });
    normalizeAllContent(this.content);
    this.registry = registry;

    // Expose content & app instance on window for automated Playwright verification
    window.__app = this;
    window.__content = this.content;

    // Initialize 3D FaceRig inside #rigCanvasMount
    const rigMount = document.getElementById('rigCanvasMount');
    try {
      this.rig = new FaceRig(rigMount, {
        quality: this.settings.quality || 'high',
        reducedMotion: Boolean(this.settings.reducedMotion)
      });
      await this.rig.init();
    } catch (error) {
      console.warn('3D face unavailable:', error.message);
      this.rig = null;
      rigMount.innerHTML = '<p style="padding:20px">3D faces could not load. Enable hardware acceleration or try a WebGL-capable browser. Your saved progress is safe; face checks require a working display.</p>';
    }
    window.__rig = this.rig;

    this._renderRigToolbar();
    this._renderTopNav();

    window.addEventListener('hashchange', () => this.handleRoute(window.location.hash));
    const initialHash = window.location.hash || '#/home';
    this.handleRoute(initialHash);

    // Register offline service worker cleanly
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  isLevelUnlocked(levelId) {
    if (levelId >= 6 && !this.settings.ethicsCompleted) return false;
    if (this.settings.unlockAll || this.referenceUnlocked || levelId === 1) return true;
    return Boolean(this.levelProgress.get(levelId - 1)?.completed);
  }

  _renderTopNav() {
    const navBar = document.getElementById('appTopNav');
    if (!navBar) return;

    navBar.innerHTML = `<div class="brand-cluster"><a href="#/home"><strong>Reading Faces</strong></a></div>
      <nav class="utility-nav-cluster" aria-label="Main navigation">
      <a class="util-link" href="#/home">Path</a><a class="util-link" href="#/review">Review</a>
      <a class="util-link" href="#/finish">Finish</a><a class="util-link" href="#/dashboard">Progress</a>
      <a class="util-link" href="#/settings">Settings</a></nav>`;
  }

  _renderRigToolbar() {
    const bar = document.getElementById('rigStageToolbar');
    if (!bar || !this.rig) return;

    const rigs = this.registry?.rigs || [];
    const includeDev = this.currentRoute === '#/au-lab' || new URLSearchParams(window.location.search).get('rig') === 'facecap';

    bar.innerHTML = `
      <div class="rig-toolbar-row">
        <label class="rig-select-label">Identity:
          <select id="rigIdentitySelect" aria-label="3D Head Identity">
            ${rigs.map((r) => `
              <option value="${r.id}" ${this.rig.currentRigId === r.id ? 'selected' : ''}>${r.label}</option>
            `).join('')}
            ${includeDev ? `<option value="facecap" ${this.rig.currentRigId === 'facecap' ? 'selected' : ''}>FaceCap (Dev Reference Rig)</option>` : ''}
          </select>
        </label>

        <label class="rig-select-label">Camera:
          <select id="rigCameraPresetSelect" aria-label="Camera View Angle">
            ${Object.entries(CAMERA_PRESETS).map(([k, p]) => `
              <option value="${k}" ${this.rig.currentPreset === k ? 'selected' : ''}>${p.label}</option>
            `).join('')}
          </select>
        </label>

        <button type="button" class="btn btn-sm btn-secondary" id="rigToolbarNeutralBtn">Neutral</button>
      </div>
    `;

    bar.querySelector('#rigIdentitySelect')?.addEventListener('change', async (e) => {
      await this.rig.loadRig(e.target.value);
    });

    bar.querySelector('#rigCameraPresetSelect')?.addEventListener('change', (e) => {
      this.rig.setCameraPreset(e.target.value);
    });

    bar.querySelector('#rigToolbarNeutralBtn')?.addEventListener('click', () => {
      this.rig.setOverlaysEnabled(false);
      this.rig.resetToNeutral();
    });
  }

  async handleRoute(hash) {
    const cleanHash = hash || '#/home';
    this.currentRoute = cleanHash;
    const journey = await getRecord('progress', 'beginnerJourneyV2');
    this.referenceUnlocked = Boolean(journey && stagePassed(journey, 1));

    if (this.activeViewInstance && typeof this.activeViewInstance.dispose === 'function') {
      this.activeViewInstance.dispose();
    }
    this.activeViewInstance = null;

    if (this.rig) {
      this.rig.setAnatomyHotspots([]);
      this.rig.setOverlaysEnabled(false);
    }

    this._renderTopNav();
    this._renderRigToolbar();

    const workspaceEl = document.getElementById('workspaceContentMount');
    if (!workspaceEl) return;

    const onLevelComplete = async (lvlId) => {
      const progList = await getLevelProgressMap();
      this.levelProgress = new Map(progList.map((p) => [Number(p.levelId), p]));
      this._renderTopNav();
    };

    if (['#/home','#/review','#/finish'].includes(cleanHash) || cleanHash.startsWith('#/stage/')) {
      this.activeViewInstance = new BeginnerJourney(workspaceEl, this, cleanHash); return;
    }
    if (!this.rig && (cleanHash.startsWith('#/level/') || ['#/assessment','#/au-lab','#/mirror'].includes(cleanHash))) {
      workspaceEl.innerHTML = '<h2>3D display unavailable</h2><p>Try a WebGL-capable browser to use face lessons. You can still view your path, ethics, progress, and settings.</p><a href="#/home">Your path</a>'; return;
    }
    if (cleanHash === '#/library' && !this.referenceUnlocked && !this.settings.unlockAll) {
      workspaceEl.innerHTML = '<h2>Go deeper</h2><p>Finish Meet the 7 to open the reference library.</p><a href="#/home">Return to your path</a>'; return;
    }
    if (cleanHash === '#/library') {
      workspaceEl.innerHTML = `<h2>Go deeper</h2><p>Optional reference lessons. These do not replace beginner-path checks.</p><div class="vocab-cards-grid">${LEVEL_TITLES.map(l=>`<a class="vocab-card" href="#/level/${l.id}">${l.title}</a>`).join('')}</div><a href="#/mirror">Mirror</a> · <a href="#/au-lab">AU Lab</a>`; return;
    }
    if (cleanHash.startsWith('#/level/')) {
      const levelNum = Number(cleanHash.replace('#/level/', '')) || 1;

      // Check Ethics Gate before Level 6+
      if (levelNum >= 6 && !this.settings.ethicsCompleted) {
        workspaceEl.innerHTML = `
          <div class="gate-notice-card">
            <h3>Scientific &amp; Ethical Framing Required Before Level ${levelNum}</h3>
            <p>Before beginning sub-200 ms micro-expression speed training, please complete the brief 4-card Scientific &amp; Ethical Framing module.</p>
            <div class="btn-row">
              <a href="#/ethics" class="btn btn-primary">Open Ethics &amp; Science Module (3/3 Quiz)</a>

            </div>
          </div>
        `;
        return;
      }

      if (!this.isLevelUnlocked(levelNum)) {
        workspaceEl.innerHTML = `
          <div class="gate-notice-card">
            <h3>Level ${levelNum} is Currently Locked</h3>
            <p>Complete Level ${levelNum - 1} to unlock sequentially, or enable <strong>Unlock All</strong> in Settings to jump directly to any module.</p>
            <div class="btn-row">
              <a href="#/level/${levelNum - 1}" class="btn btn-primary">Go to Level ${levelNum - 1}</a>
              <a class="btn btn-secondary" href="#/settings">Settings</a>
            </div>
          </div>
        `;
        return;
      }

      const opts = { rig: this.rig, content: this.content, onLevelComplete };
      switch (levelNum) {
        case 1:
          this.activeViewInstance = new Level1LiteracyView(workspaceEl, opts);
          break;
        case 2:
          this.activeViewInstance = new Level2AnatomyView(workspaceEl, opts);
          break;
        case 3:
          this.activeViewInstance = new Level3AUsView(workspaceEl, opts);
          break;
        case 4:
          this.activeViewInstance = new Level4Core7View(workspaceEl, opts);
          break;
        case 5:
          this.activeViewInstance = new Level5SubtleView(workspaceEl, opts);
          break;
        case 6: {
          const initPair = this.pendingPairDrill;
          this.pendingPairDrill = null;
          this.activeViewInstance = new Level6MicroView(workspaceEl, { ...opts, initialPair: initPair });
          break;
        }
        case 7:
          this.activeViewInstance = new Level7BlendsView(workspaceEl, opts);
          break;
        case 8:
          this.activeViewInstance = new Level8Beyond7View(workspaceEl, opts);
          break;
        case 9:
          this.activeViewInstance = new Level9ContextView(workspaceEl, opts);
          break;
        case 10:
          this.activeViewInstance = new Level10RealWorldView(workspaceEl, opts);
          break;
        default:
          this.activeViewInstance = new Level1LiteracyView(workspaceEl, opts);
      }
      return;
    }

    if (cleanHash === '#/ethics') {
      this.activeViewInstance = new EthicsModuleView(workspaceEl, {
        ethicsData: this.content.ethics,
        isCompleted: Boolean(this.settings.ethicsCompleted),
        onCompleted: () => {
          this.settings.ethicsCompleted = true;
          this._renderTopNav();
        }
      });
      return;
    }

    if (cleanHash === '#/dashboard') {
      const [trials, staircases, srsCards, assessments] = await Promise.all([
        getTrials(),
        getStaircases(),
        getAllSRSCards(),
        getAssessments()
      ]);
      this.activeViewInstance = new AnalyticsDashboard(workspaceEl, {
        trials,
        staircases,
        srsCards,
        assessments,
        onLaunchPairDrill: (emotionA, emotionB) => {
          this.pendingPairDrill = [emotionA, emotionB];
          window.location.hash = '#/level/6';
        },
        onLaunchAssessment: () => {
          window.location.hash = '#/assessment';
        }
      });
      return;
    }

    if (cleanHash === '#/mirror') {
      this.activeViewInstance = new MirrorModeController(workspaceEl, {
        rig: this.rig,
        expressionsCatalog: this.content.expressions,
        auCatalog: this.content.aus
      });
      return;
    }

    if (cleanHash === '#/assessment') {
      await this._renderAssessmentView(workspaceEl);
      return;
    }

    if (cleanHash === '#/au-lab') {
      this._renderAULabView(workspaceEl);
      return;
    }

    if (cleanHash === '#/settings') {
      await this._renderSettingsAndAboutView(workspaceEl);
    }
  }

  async _renderAssessmentView(containerEl) {
    const pastAssessments = await getAssessments();
    const dueInfo = isAssessmentDue(pastAssessments);
    const items = generateBenchmarkItems({ includeExtended: false });
    let currentIdx = 0;
    const responses = [];
    let itemStartMs = 0;

    const renderStep = () => {
      if (currentIdx >= items.length) {
        const result = scoreAssessment(responses);
        saveAssessment(result);
        containerEl.innerHTML = `
          <div class="level-view">
            <header class="level-header">
              <div>
                <span class="level-kicker">STANDARDIZED 42-ITEM BENCHMARK COMPLETE</span>
                <h2>Benchmark Score: ${result.overallAccuracy}% (${result.correctCount}/${result.totalItems})</h2>
                <p class="muted-text">Mean Response Time: ${result.meanRtMs} ms &bull; Logged to longitudinal assessment store.</p>
              </div>
              <a href="#/dashboard" class="btn btn-primary">View Full Analytics Dashboard</a>
            </header>
            <div class="threshold-cards-grid">
              ${Object.entries(result.byEmotion).map(([em, stat]) => `
                <div class="threshold-card">
                  <div class="threshold-emotion-label">${em.toUpperCase()}</div>
                  <div class="threshold-ms-value">${stat.accuracy}%</div>
                  <div class="threshold-meta">${stat.correct}/${stat.total} items</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        return;
      }

      const item = items[currentIdx];
      containerEl.innerHTML = `
        <div class="level-view">
          <header class="level-header">
            <div>
              <span class="level-kicker">FIXED-SEED 42-ITEM STANDARDIZED BENCHMARK</span>
              <h2>Item ${currentIdx + 1} of ${items.length} (${item.nominalMs} ms Flash)</h2>
              <p class="muted-text">Status: ${dueInfo.reason === 'baseline' ? 'Baseline Onboarding Benchmark' : `Last taken ${dueInfo.daysSinceLast} days ago`} &bull; No feedback is shown during benchmark items so your score remains an uncontaminated baseline.</p>
            </div>
          </header>

          <div class="drill-card">
            <div class="progress-bar-track" style="margin-bottom:14px;">
              <div class="progress-bar-fill" style="width:${Math.round((currentIdx / items.length) * 100)}%;"></div>
            </div>
            <div class="btn-row" style="margin-bottom:14px;">
              <button type="button" class="btn btn-primary" id="benchFlashBtn">Flash Benchmark Item #${currentIdx + 1} (${item.nominalMs} ms)</button>
            </div>
            <div class="emotion-answer-grid">
              ${CORE_EMOTIONS_7.map((em) => `
                <button type="button" class="btn btn-secondary bench-ans-btn" data-ans="${em}">
                  ${em.charAt(0).toUpperCase() + em.slice(1)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      const flashCurrent = async () => {
        const expr = this.content.expressions?.core?.find((e) => e.id === item.emotion);
        if (this.rig && expr) {
          this.rig.setOverlaysEnabled(false);
          itemStartMs = performance.now();
          await this.rig.flashExpression(expr, item.nominalMs, { scale: item.scale || 1.0 });
        }
      };

      containerEl.querySelector('#benchFlashBtn')?.addEventListener('click', flashCurrent);
      containerEl.querySelectorAll('.bench-ans-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const chosen = btn.getAttribute('data-ans');
          responses.push({
            ...item,
            chosenEmotion: chosen,
            rtMs: Math.max(50, Math.round(performance.now() - (itemStartMs || performance.now())))
          });
          currentIdx++;
          renderStep();
        });
      });

      flashCurrent();
    };

    renderStep();
  }

  _renderAULabView(containerEl) {
    const aus = this.content.aus?.aus || [];
    const allExprs = [
      ...(this.content.expressions?.core || []),
      ...(this.content.expressions?.variants || []),
      ...(this.content.expressions?.social || [])
    ];
    const auValues = {};
    const bsValues = {};
    for (const k of CANONICAL_ARKIT_52) bsValues[k] = 0;

    containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">DEVELOPER &amp; FACS RESEARCH SANDBOX (#/au-lab)</span>
            <h2>Action Unit &amp; 52 ARKit Blendshape Inspector</h2>
            <p class="muted-text">Inspect every Action Unit, combination corrective, wrinkle normal weight, and raw ARKit blendshape channel across all realistic rigs and the <code>?rig=facecap</code> reference mesh.</p>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-sm btn-secondary" id="auLabResetBtn">Reset All Channels</button>
          </div>
        </header>

        <div class="aulab-presets-bar">
          <strong>Expression Presets:</strong>
          <div class="chip-row" style="margin-top:6px;">
            ${allExprs.map((e) => `
              <button type="button" class="chip-btn aulab-preset-btn" data-preset-expr="${e.id}">${e.name}</button>
            `).join('')}
          </div>
        </div>

        <div class="aulab-columns">
          <div class="aulab-card">
            <h4>FACS Action Units (${aus.length})</h4>
            <div class="aulab-sliders-list">
              ${aus.map((a) => `
                <div class="aulab-slider-row">
                  <label><strong>AU${a.id}</strong> ${a.name}</label>
                  <input type="range" class="aulab-au-slider" data-au-id="${a.id}" min="0" max="1" step="0.05" value="0" />
                  <span class="aulab-val" id="aulabValAU_${a.id}">0.00</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="aulab-card">
            <h4>52 Canonical ARKit Blendshapes (Missing on active rig: ${(window.__missing || []).length})</h4>
            <div class="aulab-sliders-list">
              ${CANONICAL_ARKIT_52.map((bs) => `
                <div class="aulab-slider-row">
                  <label><code>${bs}</code></label>
                  <input type="range" class="aulab-bs-slider" data-bs-name="${bs}" min="0" max="1" step="0.05" value="0" />
                  <span class="aulab-val" id="aulabValBS_${bs}">0.00</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    const syncFromAUs = () => {
      const activeList = Object.entries(auValues)
        .filter(([, v]) => v > 0)
        .map(([id, intensity]) => ({ au: Number(id), intensity: Number(intensity) }));
      const state = this.rig.setExpressionFromRecipe({ aus: activeList });
      for (const bs of CANONICAL_ARKIT_52) {
        const w = state.weights[bs] || 0;
        const bsSlider = containerEl.querySelector(`.aulab-bs-slider[data-bs-name="${bs}"]`);
        const bsLabel = containerEl.querySelector(`#aulabValBS_${bs}`);
        if (bsSlider) bsSlider.value = String(w);
        if (bsLabel) bsLabel.textContent = w.toFixed(2);
      }
    };

    containerEl.querySelectorAll('.aulab-au-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const id = Number(slider.getAttribute('data-au-id'));
        const val = Number(slider.value);
        auValues[id] = val;
        const lbl = containerEl.querySelector(`#aulabValAU_${id}`);
        if (lbl) lbl.textContent = val.toFixed(2);
        syncFromAUs();
      });
    });

    containerEl.querySelectorAll('.aulab-bs-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const name = slider.getAttribute('data-bs-name');
        const val = Number(slider.value);
        bsValues[name] = val;
        const lbl = containerEl.querySelector(`#aulabValBS_${name}`);
        if (lbl) lbl.textContent = val.toFixed(2);
        this.rig.setRawBlendshapes(bsValues);
      });
    });

    containerEl.querySelectorAll('.aulab-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preset-expr');
        const expr = allExprs.find((e) => e.id === id);
        if (!expr) return;
        for (const k of Object.keys(auValues)) delete auValues[k];
        containerEl.querySelectorAll('.aulab-au-slider').forEach((s) => {
          s.value = '0';
          const aid = s.getAttribute('data-au-id');
          const lbl = containerEl.querySelector(`#aulabValAU_${aid}`);
          if (lbl) lbl.textContent = '0.00';
        });
        for (const a of expr.aus || []) {
          auValues[a.au] = a.intensity;
          const s = containerEl.querySelector(`.aulab-au-slider[data-au-id="${a.au}"]`);
          const lbl = containerEl.querySelector(`#aulabValAU_${a.au}`);
          if (s) s.value = String(a.intensity);
          if (lbl) lbl.textContent = Number(a.intensity).toFixed(2);
        }
        const state = this.rig.setExpressionFromRecipe(expr);
        for (const bs of CANONICAL_ARKIT_52) {
          const w = state.weights[bs] || 0;
          const bsSlider = containerEl.querySelector(`.aulab-bs-slider[data-bs-name="${bs}"]`);
          const bsLabel = containerEl.querySelector(`#aulabValBS_${bs}`);
          if (bsSlider) bsSlider.value = String(w);
          if (bsLabel) bsLabel.textContent = w.toFixed(2);
        }
      });
    });

    containerEl.querySelector('#auLabResetBtn')?.addEventListener('click', () => {
      this.rig.resetToNeutral();
      this._renderAULabView(containerEl);
    });
  }

  async _renderSettingsAndAboutView(containerEl) {
    const fps = this.rig?.scheduler?.fps || 60;
    const frameDurationMs = this.rig?.scheduler?.frameDurationMs || 16.67;

    containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">CONFIGURATION, DATA PORTABILITY &amp; SCIENTIFIC METHODOLOGY</span>
            <h2>Settings, Display Calibration &amp; About Reading Faces</h2>
          </div>
        </header>

        <div class="settings-grid">
          <section class="vocab-card">
            <h3>Display Timing &amp; Accessibility Settings</h3>
            <div class="inspector-meta-list">
              <div>
                <strong>Measured Display Refresh Rate:</strong>
                <span id="settingsHzReadout">${fps} Hz (${frameDurationMs.toFixed(2)} ms / frame)</span>
                <button type="button" class="btn btn-sm btn-secondary" id="settingsRecalibrateHzBtn" style="margin-left:8px;">Re-Calibrate Refresh Rate</button>
              </div>
              <div>
                <label class="checkbox-pill">
                  <input type="checkbox" id="settingsReducedMotion" ${this.settings.reducedMotion ? 'checked' : ''} />
                  <span><strong>Reduced Motion Mode:</strong> Floor all stimulus exposures at &ge; 500 ms with smooth fades</span>
                </label>
              </div>
              <div>
                <label><strong>3D Rendering Quality:</strong>
                  <select id="settingsQualitySelect">
                    <option value="high" ${(this.settings.quality || 'high') === 'high' ? 'selected' : ''}>High (2K Soft Shadows + Full DPR)</option>
                    <option value="low" ${this.settings.quality === 'low' ? 'selected' : ''}>Performance / Low Power (1x DPR, No Shadows)</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section class="vocab-card">
            <h3>Local IndexedDB Backup, Export &amp; Import</h3>
            <p class="muted-text">All training history, staircases, SRS cards, and benchmark logs are stored 100% locally in your browser's IndexedDB (<code>reading_faces_v1</code>).</p>
            <div class="btn-row" style="margin-top:12px;">
              <button type="button" class="btn btn-primary" id="settingsExportJsonBtn">Export Progress JSON</button>
              <label class="btn btn-secondary" style="cursor:pointer;">
                Import Progress JSON
                <input type="file" id="settingsImportJsonInput" accept="application/json" style="display:none;" />
              </label>
              <button type="button" class="btn btn-danger" id="settingsResetAllBtn">Reset All Data</button>
            </div>
            <div id="settingsDataStatus" class="muted-text" style="margin-top:8px;"></div>
          </section>
        </div>

        <section class="vocab-card" style="margin-top:18px;">
          <h3>About Reading Faces: Scientific Grounding &amp; Timing Architecture</h3>
          <p><strong>1. Facial Action Coding System (FACS) &amp; Universal Affective Signals:</strong> Built on Ekman &amp; Friesen's (1978/2002) anatomical Action Unit taxonomy, Plutchik's (1980) psychoevolutionary emotion wheel, Russell's (1980) Circumplex Model of Valence and Arousal, and Cowen &amp; Keltner's (2017) 27-category high-dimensional emotion space.</p>
          <p><strong>2. Reading Emotion &mdash; Never Mind-Reading:</strong> Facial expressions reflect transient muscle contractions linked to affective appraisals, cognitive effort, pain, or conversational punctuation. They are <strong>not</strong> indicators of honesty or dishonesty. Treat every observed facial cue as a tentative hypothesis to guide empathy and open-ended calibrated questions.</p>
          <p><strong>3. Frame-Accurate Browser Stimulus Timing:</strong> Sub-200 ms micro-expression flashes are scheduled exclusively via <code>requestAnimationFrame</code> frame-counting (never <code>setTimeout</code> or <code>setInterval</code>). At 60 Hz (16.67 ms/frame), a nominal 50 ms flash spans exactly 3 display frames (50.0 ms) and a nominal 40 ms flash spans 2 frames (33.3 ms); at 120 Hz (8.33 ms/frame), 40 ms spans 5 frames (41.7 ms). Both nominal and actual frame-counted durations are logged on every trial.</p>
        </section>
      </div>
    `;

    const testing = document.createElement('details');
    testing.innerHTML = `<summary>Testing settings</summary><label><input id="settingsUnlockAll" type="checkbox" ${this.settings.unlockAll?'checked':''}> Unlock reference lessons (ethics remains required; no journey credit)</label>`;
    containerEl.append(testing);
    testing.querySelector('input').onchange = async e => {this.settings.unlockAll=e.target.checked;await saveSetting('unlockAll',e.target.checked);};
    containerEl.querySelector('#settingsRecalibrateHzBtn')?.addEventListener('click', async () => {
      if (!this.rig?.scheduler) return;
      const res = await this.rig.scheduler.calibrateRefreshRate(45);
      const readout = containerEl.querySelector('#settingsHzReadout');
      if (readout) readout.textContent = `${res.fps} Hz (${res.frameDurationMs.toFixed(2)} ms / frame)`;
    });

    containerEl.querySelector('#settingsReducedMotion')?.addEventListener('change', async (e) => {
      this.settings.reducedMotion = e.target.checked;
      await saveSetting('reducedMotion', this.settings.reducedMotion);
      if (this.rig) this.rig.setReducedMotion(this.settings.reducedMotion);
    });

    containerEl.querySelector('#settingsQualitySelect')?.addEventListener('change', async (e) => {
      this.settings.quality = e.target.value;
      await saveSetting('quality', this.settings.quality);
      if (this.rig) this.rig.setQuality(this.settings.quality);
    });

    containerEl.querySelector('#settingsExportJsonBtn')?.addEventListener('click', async () => {
      await downloadBackupFile();
      const st = containerEl.querySelector('#settingsDataStatus');
      if (st) st.textContent = 'Backup JSON exported.';
    });

    containerEl.querySelector('#settingsImportJsonInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      await importDatabaseJSON(text);
      const st = containerEl.querySelector('#settingsDataStatus');
      if (st) st.textContent = 'Backup JSON imported! Reloading state...';
      this.settings = await getAllSettings();
      const progList = await getLevelProgressMap();
      this.levelProgress = new Map(progList.map((p) => [Number(p.levelId), p]));
      this._renderTopNav();
    });

    containerEl.querySelector('#settingsResetAllBtn')?.addEventListener('click', async () => {
      await resetAllProgress();
      this.settings = await getAllSettings();
      this.levelProgress.clear();
      this._renderTopNav();
      const st = containerEl.querySelector('#settingsDataStatus');
      if (st) st.textContent = 'All local training data has been reset.';
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new ReadingFacesApp();
  app.init();
});
