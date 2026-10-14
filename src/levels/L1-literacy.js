/**
 * Level 1: Emotional Literacy & Dimensional Foundations.
 * Integrates:
 *  - Plutchik 8x3 Wheel + 8 Primary Dyads (linked to 3D head rig)
 *  - 2D Valence-Arousal Drag-and-Drop Plane + Dominance Slider
 *  - Cowen & Keltner (2017) 27-Emotion Clustered Semantic Map
 *  - 64-Word Granular Emotion Vocabulary Deck + 12-Item Mastery Quiz
 */

import { PlutchikWheelWidget } from '../ui/wheel.js';
import { ValenceArousalGridWidget } from '../ui/vaGrid.js';
import { EmotionMap27Widget } from '../ui/map27.js';
import { saveLevelProgress, putSRSCard } from '../store/db.js';
import { createSRSCard } from '../train/srs.js';

export class Level1LiteracyView {
  constructor(containerEl, { rig, content, onLevelComplete }) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.content = content; // { level1, plutchik, va, emotions27, expressions }
    this.onLevelComplete = onLevelComplete;

    this.subtab = 'wheel'; // 'wheel' | 'vagrid' | 'map27' | 'vocab' | 'quiz'
    this.vocabFilter = 'all';
    this.quizIndex = 0;
    this.quizAnswers = new Map();
    this.render();
  }

  render() {
    const l1 = this.content.level1 || {};
    this.containerEl.innerHTML = `
      <div class="level-view">
        <header class="level-header">
          <div>
            <span class="level-kicker">LEVEL 1 &bull; FOUNDATIONS</span>
            <h2>${l1.title || 'Emotional Literacy & Dimensional Foundations'}</h2>
            <p class="muted-text">${l1.subtitle || 'Master emotion families, intensity rings, Valence-Arousal-Dominance coordinates, and the 27-category semantic space.'}</p>
          </div>
          <div class="segmented-tabs" role="tablist">
            <button type="button" class="seg-tab ${this.subtab === 'wheel' ? 'active' : ''}" data-subtab="wheel">1. Plutchik Wheel</button>
            <button type="button" class="seg-tab ${this.subtab === 'vagrid' ? 'active' : ''}" data-subtab="vagrid">2. Valence-Arousal Plane</button>
            <button type="button" class="seg-tab ${this.subtab === 'map27' ? 'active' : ''}" data-subtab="map27">3. 27-Emotion Map</button>
            <button type="button" class="seg-tab ${this.subtab === 'vocab' ? 'active' : ''}" data-subtab="vocab">4. 64-Word Deck</button>
            <button type="button" class="seg-tab ${this.subtab === 'quiz' ? 'active' : ''}" data-subtab="quiz">5. Mastery Quiz (12)</button>
          </div>
        </header>

        <div id="l1SubtabBody" class="level-body"></div>
      </div>
    `;

    this.containerEl.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.subtab = btn.getAttribute('data-subtab');
        this.render();
      });
    });

    const bodyEl = this.containerEl.querySelector('#l1SubtabBody');
    if (this.subtab === 'wheel') {
      new PlutchikWheelWidget(bodyEl, this.content.plutchik, {
        onSelectPetal: ({ rigExpression, scale }) => {
          if (!this.rig || !rigExpression) return;
          const expr = this.content.expressions?.core?.find((e) => e.id === rigExpression);
          if (expr) {
            this.rig.setOverlaysEnabled(false);
            this.rig.setExpressionFromRecipe(expr, { scale: scale || 0.8 });
          }
        }
      });
    } else if (this.subtab === 'vagrid') {
      new ValenceArousalGridWidget(bodyEl, this.content.va);
    } else if (this.subtab === 'map27') {
      new EmotionMap27Widget(bodyEl, this.content.emotions27, {
        onSelectNode: (cat) => {
          if (!this.rig) return;
          const expr = this.content.expressions?.core?.find((e) => e.id === cat.id) ||
            this.content.expressions?.social?.find((e) => e.id === cat.id);
          if (expr) {
            this.rig.setExpressionFromRecipe(expr);
          } else {
            this.rig.resetToNeutral();
          }
        }
      });
    } else if (this.subtab === 'vocab') {
      this._renderVocabDeck(bodyEl);
    } else if (this.subtab === 'quiz') {
      this._renderQuiz(bodyEl);
    }
  }

  _renderVocabDeck(bodyEl) {
    const cards = this.content.plutchik?.vocabularyCards || [];
    const families = ['all', ...new Set(cards.map((c) => c.family))];
    const filtered = this.vocabFilter === 'all' ? cards : cards.filter((c) => c.family === this.vocabFilter);

    bodyEl.innerHTML = `
      <div class="vocab-deck-section">
        <div class="vocab-filter-row">
          <span>Filter by Family (${filtered.length} terms):</span>
          <div class="chip-row">
            ${families.map((fam) => `
              <button type="button" class="chip-btn ${this.vocabFilter === fam ? 'active' : ''}" data-fam-filter="${fam}">
                ${fam.toUpperCase()}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="vocab-cards-grid">
          ${filtered.map((c) => `
            <article class="vocab-card">
              <div class="vocab-card-top">
                <strong>${c.term}</strong>
                <span class="vocab-intensity-tag">${c.family} &bull; ${c.intensity}</span>
              </div>
              <p>${c.definition}</p>
              <div class="vocab-card-meta">
                <span>Body cue: <em>${c.bodySignal}</em></span>
                <span>Look-alike: <em>${c.confusableWith}</em></span>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-fam-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.vocabFilter = btn.getAttribute('data-fam-filter');
        this._renderVocabDeck(bodyEl);
      });
    });
  }

  _renderQuiz(bodyEl) {
    const quizItems = this.content.level1?.quiz || [];
    let correctCount = 0;
    for (const [idx, chosen] of this.quizAnswers.entries()) {
      if (quizItems[idx] && chosen === quizItems[idx].answer) correctCount++;
    }
    const allAnswered = this.quizAnswers.size === quizItems.length && quizItems.length > 0;
    const accuracy = quizItems.length > 0 ? Math.round((correctCount / quizItems.length) * 100) : 0;

    bodyEl.innerHTML = `
      <div class="quiz-list-container">
        <div class="quiz-header-bar">
          <h4>Level 1 Mastery Check (${this.quizAnswers.size}/${quizItems.length} answered &bull; Pass criterion: &ge; 80%)</h4>
          ${allAnswered ? `
            <div class="quiz-result-pill ${accuracy >= 80 ? 'pass' : 'miss'}">
              Score: <strong>${correctCount}/${quizItems.length} (${accuracy}%)</strong>
              ${accuracy >= 80 ? ' &mdash; Level 1 Mastered!' : ' &mdash; Review explanations below and retry any missed items.'}
            </div>
          ` : ''}
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
                    const isThisChosen = chosen === opt;
                    const isThisRight = opt === q.answer;
                    let cls = 'btn btn-secondary q-opt-btn';
                    if (answered && isThisRight) cls += ' opt-correct';
                    else if (answered && isThisChosen && !isThisRight) cls += ' opt-wrong';
                    return `<button type="button" class="${cls}" data-qidx="${qIdx}" data-opt="${opt}">${opt}</button>`;
                  }).join('')}
                </div>
                ${answered ? `<p class="q-explanation">${isCorrect ? '✓ Correct: ' : '✗ Explanation: '}${q.explanation}</p>` : ''}
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
          const card = createSRSCard('vocab', q.id || `l1_q${qIdx}`);
          card.box = opt === q.answer ? 1 : 0;
          await putSRSCard(card);
        }

        let corr = 0;
        for (const [idx, ans] of this.quizAnswers.entries()) {
          if (quizItems[idx] && ans === quizItems[idx].answer) corr++;
        }
        const pct = quizItems.length > 0 ? Math.round((corr / quizItems.length) * 100) : 0;
        if (this.quizAnswers.size === quizItems.length && pct >= 80) {
          await saveLevelProgress({
            levelId: 1,
            completed: true,
            bestScore: pct,
            updatedAt: Date.now()
          });
          if (this.onLevelComplete) this.onLevelComplete(1, pct);
        }
        this._renderQuiz(bodyEl);
      });
    });
  }
}
