/**
 * Scientific & Ethical Framing Module (`content/ethics.json`, Section 1 / Level 6 Gate).
 * - Teaches the 4 foundational scientific & ethical principles:
 *   1. Facial expressions signal emotional & physiological states, not honesty (Bond & DePaulo 2006 ~54% meta-analysis).
 *   2. The Othello Error (Ekman 1985): fear of being disbelieved looks identical to fear of being caught.
 *   3. Baseline, Cultural, and Individual Calibration.
 *   4. Expressions as Hypotheses for Empathy & Calibrated Questions, never accusations.
 * - Requires 3/3 on the comprehension quiz to mark `ethicsCompleted = true` and unlock Level 6+.
 */

import { saveSetting } from '../store/db.js';

export class EthicsModuleView {
  constructor(containerEl, { ethicsData, isCompleted = false, onCompleted = null }) {
    this.containerEl = containerEl;
    this.data = ethicsData;
    this.isCompleted = isCompleted;
    this.onCompleted = onCompleted;
    this.answers = new Map();
    this.render();
  }

  render() {
    const cards = this.data?.cards || [];
    const quiz = this.data?.quiz || [];

    let correctCount = 0;
    for (const [idx, ans] of this.answers.entries()) {
      if (quiz[idx] && ans === quiz[idx].answer) correctCount++;
    }
    const passedAll = quiz.length > 0 && correctCount === quiz.length;

    this.containerEl.innerHTML = `
      <div class="ethics-module-layout">
        <header class="level-header">
          <div>
            <span class="level-kicker">SCIENTIFIC &amp; ETHICAL FRAMING (REQUIRED BEFORE LEVEL 6)</span>
            <h2>${this.data?.title || 'Scientific & Ethical Framing: Reading Emotion Responsibly'}</h2>
            <p class="muted-text">${this.data?.subtitle || 'Read all 4 scientific principles and complete the 3/3 comprehension check.'}</p>
          </div>
          <div class="ethics-status-badge ${this.isCompleted || passedAll ? 'pass' : 'pending'}">
            ${this.isCompleted || passedAll ? '✓ Ethics Gate Completed (3/3)' : `Quiz Progress: ${correctCount}/${quiz.length} Correct`}
          </div>
        </header>

        <div class="ethics-cards-grid">
          ${cards.map((c, idx) => `
            <article class="ethics-principle-card">
              <div class="ethics-card-num">Principle ${idx + 1}</div>
              <h3>${c.title}</h3>
              <p>${c.body}</p>
              <div class="ethics-citation"><strong>Research Citation:</strong> ${c.citation}</div>
            </article>
          `).join('')}
        </div>

        <section class="ethics-quiz-section">
          <h3>Comprehension Check (3/3 Required to Unlock Micro-Expression Speed Training)</h3>
          <div class="quiz-questions-stack">
            ${quiz.map((q, qIdx) => {
              const chosen = this.answers.get(qIdx);
              const answered = chosen !== undefined;
              const isCorr = chosen === q.answer;
              return `
                <div class="quiz-question-card ${answered ? (isCorr ? 'q-pass' : 'q-miss') : ''}">
                  <p class="q-prompt"><strong>${qIdx + 1}.</strong> ${q.question}</p>
                  <div class="q-options-grid">
                    ${(q.options || []).map((opt) => {
                      let cls = 'btn btn-secondary ethics-opt-btn';
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
        </section>
      </div>
    `;

    this.containerEl.querySelectorAll('.ethics-opt-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const qIdx = Number(btn.getAttribute('data-qidx'));
        const opt = btn.getAttribute('data-opt');
        this.answers.set(qIdx, opt);

        let corr = 0;
        for (const [idx, ans] of this.answers.entries()) {
          if (quiz[idx] && ans === quiz[idx].answer) corr++;
        }
        if (quiz.length > 0 && corr === quiz.length) {
          this.isCompleted = true;
          await saveSetting('ethicsCompleted', true);
          if (this.onCompleted) this.onCompleted();
        }
        this.render();
      });
    });
  }
}
