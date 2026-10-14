/**
 * Level 2: Facial Anatomy, Three Zones & 11-Muscle Interactive Map.
 * - Interactive 2D SVG anatomical muscle diagram + 3D head mesh raycast hotspots.
 * - Clicking any muscle highlights its zone, contracts its linked Action Unit on the 3D head,
 *   and displays fiber direction + transient skin furrow appearance.
 * - 6 Wrinkle Pattern vs. Permanent Crease Guides.
 * - 22-Item Anatomy Mastery Quiz.
 */

import { saveLevelProgress, putSRSCard } from '../store/db.js';
import { createSRSCard } from '../train/srs.js';

export class Level2AnatomyView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { anatomy, aus, expressions }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'muscles'; // 'muscles' | 'wrinkles' | 'quiz'
    this.selectedMuscleId = content.anatomy?.muscles?.[0]?.id || 'frontalis_medial';
    this.quizAnswers = new Map();
    this.render();
  }

  render() {
    const anat = this.content.anatomy || {};
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 2 &bull; FACIAL ANATOMY</span>
            <h2>Facial Zones, 11 Core Muscles &amp; Transient Wrinkle Patterns</h2>
            <p class="muted-text">Learn how subcutaneous facial muscles pull skin perpendicular to their fiber direction to produce Action Units.</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'muscles' ? 'active' : ''}" data-subtab="muscles">1. 3-Zone &amp; 11-Muscle Map</button>
            <button type="button" class="seg-tab ${this.subtab === 'wrinkles' ? 'active' : ''}" data-subtab="wrinkles">2. Transient Wrinkle Guides (6)</button>
            <button type="button" class="seg-tab ${this.subtab === 'quiz' ? 'active' : ''}" data-subtab="quiz">3. Anatomy Quiz (22)</button>
          </div>
        </header>

        <div id="l2SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l2SubtabBody');
    if (this.subtab === 'muscles') {
      this._renderMuscleMap(bodyEl, anat);
    } else if (this.subtab === 'wrinkles') {
      if (this.rig) this.rig.setAnatomyHotspots([]);
      this._renderWrinkleGuides(bodyEl, anat);
    } else {
      if (this.rig) this.rig.setAnatomyHotspots([]);
      this._renderQuiz(bodyEl, anat);
    }
  }

  _selectMuscle(muscleId) {
    this.selectedMuscleId = muscleId;
    const muscles = this.content.anatomy?.muscles || [];
    const m = muscles.find((x) => x.id === muscleId);
    if (m && this.rig) {
      const aus = (m.aus || []).map((auId) => ({ au: Number(auId), intensity: 0.85 }));
      this.rig.setOverlaysEnabled(true, m.aus);
      this.rig.setExpressionFromRecipe({ aus });
      this.rig.setAnatomyHotspots(muscles, this.selectedMuscleId, (clickedId) => {
        this._selectMuscle(clickedId);
      });
    }
    const bodyEl = this.containerEl.querySelector('#l2SubtabBody');
    if (bodyEl && this.subtab === 'muscles') {
      this._renderMuscleMap(bodyEl, this.content.anatomy);
    }
  }

  _renderMuscleMap(bodyEl, anat) {
    const zones = anat?.zones || [];
    const muscles = anat?.muscles || [];
    const selected = muscles.find((m) => m.id === this.selectedMuscleId) || muscles[0];

    if (this.rig) {
      this.rig.setAnatomyHotspots(muscles, selected?.id, (clickedId) => {
        this._selectMuscle(clickedId);
      });
      if (selected) {
        const aus = (selected.aus || []).map((auId) => ({ au: Number(auId), intensity: 0.85 }));
        this.rig.setOverlaysEnabled(true, selected.aus);
        this.rig.setExpressionFromRecipe({ aus });
      }
    }

    bodyEl.innerHTML = `
      <div class="anatomy-grid-layout">
        <div class="anatomy-diagram-card">
          <h4>Interactive 2D Muscle Schematic &amp; 3D Hotspots</h4>
          <p class="muted-text">Click any muscle below (or click the glowing spheres on the 3D head) to contract its fibers and observe the skin fold.</p>
          <svg viewBox="0 0 280 340" class="anatomy-face-svg" aria-label="Facial Muscles Diagram">
            <!-- Head outline -->
            <ellipse cx="140" cy="170" rx="95" ry="135" fill="#18202c" stroke="#334155" stroke-width="2" />
            <!-- Zone divider lines -->
            <line x1="35" y1="138" x2="245" y2="138" stroke="#38bdf8" stroke-width="1" stroke-dasharray="4 4" />
            <line x1="35" y1="212" x2="245" y2="212" stroke="#38bdf8" stroke-width="1" stroke-dasharray="4 4" />
            <text x="242" y="132" text-anchor="end" fill="#38bdf8" font-size="9">Upper Face (Brows/Eyes)</text>
            <text x="242" y="206" text-anchor="end" fill="#38bdf8" font-size="9">Mid Face (Cheeks/Nose)</text>
            <text x="242" y="318" text-anchor="end" fill="#38bdf8" font-size="9">Lower Face (Mouth/Chin)</text>

            ${muscles.map((m, idx) => {
              const isSel = m.id === selected?.id;
              const cx = m.svgCoords?.cx || (85 + (idx % 2) * 110);
              const cy = m.svgCoords?.cy || (80 + idx * 20);
              return `
                <g class="muscle-svg-pin" data-muscle-id="${m.id}" style="cursor:pointer;">
                  <circle cx="${cx}" cy="${cy}" r="${isSel ? 11 : 8}" fill="${isSel ? '#f5c542' : '#38b6ff'}" stroke="#0b0e14" stroke-width="2" />
                  <text x="${cx}" y="${cy + 3}" text-anchor="middle" fill="#0b0e14" font-size="8.5" font-weight="800">${(m.aus || [])[0] || ''}</text>
                </g>
              `;
            }).join('')}
          </svg>

          <div class="zones-summary-row">
            ${zones.map((z) => `
              <div class="zone-mini-card">
                <strong>${z.name}</strong>
                <p>${z.description}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="anatomy-inspector-card">
          ${selected ? `
            <div class="inspector-badge" style="background:#38b6ff;color:#0b0e14;">
              ZONE: ${(selected.zone || 'upper').toUpperCase()} &bull; DRIVES AU ${(selected.aus || []).join(', AU ')}
            </div>
            <h3>${selected.name}</h3>
            <p class="latin-subtitle"><em>${selected.commonName || ''}</em></p>
            <div class="inspector-meta-list">
              <div><strong>Origin &rarr; Insertion:</strong> ${selected.attachment}</div>
              <div><strong>Mechanical Action:</strong> ${selected.mechanicalAction}</div>
              <div><strong>Surface Wrinkle / Furrow Rule:</strong> ${selected.wrinkleCreated}</div>
              <div><strong>Emotional Relevance:</strong> ${selected.emotionalRole}</div>
            </div>
          ` : ''}

          <h4>All 11 Core Facial Muscles</h4>
          <div class="muscle-button-list">
            ${muscles.map((m) => `
              <button type="button" class="btn btn-sm ${m.id === selected?.id ? 'btn-primary' : 'btn-secondary'} muscle-select-btn" data-muscle-id="${m.id}">
                ${m.name} (AU ${(m.aus || []).join('/')})
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-muscle-id]').forEach((el) => {
      el.addEventListener('click', () => {
        this._selectMuscle(el.getAttribute('data-muscle-id'));
      });
    });
  }

  _renderWrinkleGuides(bodyEl, anat) {
    const guides = anat?.wrinkleGuides || [];
    bodyEl.innerHTML = `
      <div class="wrinkle-guides-grid">
        ${guides.map((g) => `
          <article class="vocab-card">
            <div class="vocab-card-top">
              <strong>${g.region}</strong>
              <span class="vocab-intensity-tag">AU ${(g.aus || []).join(' + AU ')}</span>
            </div>
            <p><strong>Active Furrow Direction:</strong> ${g.direction}</p>
            <p>${g.appearance}</p>
            <p class="muted-text"><strong>Baseline Caution:</strong> ${g.baselineCaution}</p>
            <button type="button" class="btn btn-sm btn-secondary preview-wrinkle-btn" data-aus="${(g.aus || []).join(',')}">
              Contract AU ${(g.aus || []).join('+')} on 3D Head
            </button>
          </article>
        `).join('')}
      </div>
    `;

    bodyEl.querySelectorAll('.preview-wrinkle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ids = btn.getAttribute('data-aus').split(',').filter(Boolean).map(Number);
        if (this.rig) {
          this.rig.setOverlaysEnabled(true, ids);
          this.rig.setExpressionFromRecipe({
            aus: ids.map((id) => ({ au: id, intensity: 0.92 }))
          });
        }
      });
    });
  }

  _renderQuiz(bodyEl, anat) {
    const quizItems = anat?.quiz || [];
    let correctCount = 0;
    for (const [idx, chosen] of this.quizAnswers.entries()) {
      if (quizItems[idx] && chosen === quizItems[idx].answer) correctCount++;
    }
    const accuracy = quizItems.length > 0 ? Math.round((correctCount / quizItems.length) * 100) : 0;

    bodyEl.innerHTML = `
      <div class="quiz-list-container">
        <div class="quiz-header-bar">
          <h4>Level 2 Anatomy &amp; Muscle Mastery Quiz (${this.quizAnswers.size}/${quizItems.length} answered &bull; Pass: &ge; 80%)</h4>
          <div class="quiz-result-pill ${accuracy >= 80 ? 'pass' : ''}">
            Current Score: <strong>${correctCount}/${quizItems.length} (${accuracy}%)</strong>
          </div>
        </div>
        <div class="quiz-questions-stack">
          ${quizItems.map((q, qIdx) => {
            const chosen = this.quizAnswers.get(qIdx);
            const answered = chosen !== undefined;
            const isCorrect = chosen === q.answer;
            return `
              <div class="quiz-question-card ${answered ? (isCorrect ? 'q-pass' : 'q-miss') : ''}">
                <p class="q-prompt"><strong>${qIdx + 1}.</strong> ${q.question}</p>
                <div class="q-options-grid">
                  ${(q.options || []).map((opt) => {
                    let cls = 'btn btn-secondary q-opt-btn';
                    if (answered && opt === q.answer) cls += ' opt-correct';
                    else if (answered && opt === chosen && opt !== q.answer) cls += ' opt-wrong';
                    return `<button type="button" class="${cls}" data-qidx="${qIdx}" data-opt="${opt}">${opt}</button>`;
                  }).join('')}
                </div>
                ${answered ? `<p class="q-explanation">${q.explanation}</p>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('.q-opt-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const qIdx = Number(btn.getAttribute('data-qidx'));
        const opt = btn.getAttribute('data-opt');
        this.quizAnswers.set(qIdx, opt);

        const q = quizItems[qIdx];
        if (q) {
          const card = createSRSCard('au', q.id || `l2_q${qIdx}`);
          card.box = opt === q.answer ? 1 : 0;
          await putSRSCard(card);
        }

        let corr = 0;
        for (const [idx, ans] of this.quizAnswers.entries()) {
          if (quizItems[idx] && ans === quizItems[idx].answer) corr++;
        }
        const pct = quizItems.length > 0 ? Math.round((corr / quizItems.length) * 100) : 0;
        if (this.quizAnswers.size >= 10 && pct >= 80) {
          await saveLevelProgress({ levelId: 2, completed: true, bestScore: pct, updatedAt: Date.now() });
          if (this.onLevelComplete) this.onLevelComplete(2, pct);
        }
        this._renderQuiz(bodyEl, anat);
      });
    });
  }
}
