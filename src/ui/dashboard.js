/**
 * Confusion Matrix & Analytics Dashboard (Section 7).
 * - Per-emotion 79.4% exposure threshold cards (ms) from 3-down/1-up staircases.
 * - Interactive 7x7 (+ "Not sure" 8th column) row-normalized confusion matrix heatmap P(chosen | shown).
 * - Filterable by Level, Exposure Band (All, >=200ms, 100-133ms, <=67ms), and Date Range.
 * - Clicking any off-diagonal cell (i, j) launches a 10-trial targeted A/B pair drill on (emotion_i, emotion_j).
 * - Blend component accuracy table (Level 7) & Standardized Assessment trend over time.
 */

import { CORE_EMOTIONS_7 } from '../train/staircase.js';

const EMOTION_LABELS = {
  happiness: 'Happiness',
  sadness: 'Sadness',
  anger: 'Anger',
  fear: 'Fear',
  disgust: 'Disgust',
  surprise: 'Surprise',
  contempt: 'Contempt',
  not_sure: 'Not sure'
};

export function computeConfusionMatrix(trials = [], filters = {}) {
  const rows = CORE_EMOTIONS_7;
  const cols = [...CORE_EMOTIONS_7, 'not_sure'];

  const counts = {};
  const rowTotals = {};
  for (const r of rows) {
    counts[r] = {};
    rowTotals[r] = 0;
    for (const c of cols) {
      counts[r][c] = 0;
    }
  }

  const now = Date.now();
  const minTs = filters.days ? now - filters.days * 24 * 60 * 60 * 1000 : 0;

  for (const t of trials) {
    if (t.isAssessment) continue;
    if (filters.level && filters.level !== 'all' && Number(t.level) !== Number(filters.level)) continue;
    if (minTs > 0 && (t.timestamp || 0) < minTs) continue;

    if (filters.exposureBand && filters.exposureBand !== 'all') {
      const ms = Number(t.nominalMs || 200);
      if (filters.exposureBand === 'slow' && ms < 200) continue;
      if (filters.exposureBand === 'mid' && (ms < 100 || ms > 150)) continue;
      if (filters.exposureBand === 'fast' && ms > 67) continue;
    }

    const shown = t.shownEmotion;
    const chosen = cols.includes(t.chosenEmotion) ? t.chosenEmotion : 'not_sure';
    if (!counts[shown]) continue;

    counts[shown][chosen] = (counts[shown][chosen] || 0) + 1;
    rowTotals[shown] = (rowTotals[shown] || 0) + 1;
  }

  const probs = {};
  for (const r of rows) {
    probs[r] = {};
    const tot = rowTotals[r];
    for (const c of cols) {
      probs[r][c] = tot > 0 ? counts[r][c] / tot : 0;
    }
  }

  return { rows, cols, counts, rowTotals, probs };
}

export class AnalyticsDashboard {
  constructor(containerEl, { trials = [], staircases = [], srsCards = [], assessments = [], onLaunchPairDrill = null, onLaunchAssessment = null } = {}) {
    this.containerEl = containerEl;
    this.trials = trials;
    this.staircases = staircases;
    this.srsCards = srsCards;
    this.assessments = assessments;
    this.onLaunchPairDrill = onLaunchPairDrill;
    this.onLaunchAssessment = onLaunchAssessment;

    this.filters = {
      level: 'all',
      exposureBand: 'all',
      days: 0
    };

    this.render();
  }

  render() {
    const matrix = computeConfusionMatrix(this.trials, this.filters);
    const dueCardsCount = this.srsCards.filter((c) => (c.dueAt || 0) <= Date.now()).length;
    const stMap = new Map(this.staircases.map((s) => [s.emotion, s]));

    this.containerEl.innerHTML = `
      <div class="dashboard-layout">
        <div class="dashboard-header-bar">
          <div>
            <h2>Performance &amp; Confusion Matrix Analytics</h2>
            <p class="muted-text">Row-normalized conditional probability $P(\\text{chosen} \\mid \\text{shown})$. Click any off-diagonal cell to launch a 10-trial targeted A/B pair drill.</p>
          </div>
          <div class="dashboard-summary-pills">
            <div class="stat-pill">Total Logged Trials: <strong>${this.trials.filter((t) => !t.isAssessment).length}</strong></div>
            <div class="stat-pill">SRS Due Now: <strong>${dueCardsCount}</strong></div>
            <button type="button" class="btn btn-sm btn-primary" id="dashRunAssessmentBtn">Run 42-Item Benchmark</button>
          </div>
        </div>

        <!-- Per-emotion 79.4% threshold staircase cards -->
        <section class="dash-section">
          <h3>Per-Emotion 79.4% Exposure Thresholds (3-Down / 1-Up Staircase)</h3>
          <div class="threshold-cards-grid">
            ${CORE_EMOTIONS_7.map((em) => {
              const st = stMap.get(em);
              const thresh = st ? Math.round(st.thresholdMs) : 200;
              const trialsCount = st?.trials || 0;
              return `
                <div class="threshold-card">
                  <div class="threshold-emotion-label">${EMOTION_LABELS[em]}</div>
                  <div class="threshold-ms-value">${thresh} <span>ms</span></div>
                  <div class="threshold-meta">${trialsCount} adaptive trials &bull; ${st?.reversals?.length || 0} reversals</div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <!-- Confusion Matrix Section -->
        <section class="dash-section">
          <div class="dash-filter-bar">
            <h3>7&times;7 + &ldquo;Not sure&rdquo; Row-Normalized Confusion Matrix</h3>
            <div class="filter-controls">
              <label>Level:
                <select id="dashFilterLevel">
                  <option value="all" ${this.filters.level === 'all' ? 'selected' : ''}>All Levels</option>
                  <option value="4" ${this.filters.level === '4' ? 'selected' : ''}>Level 4 (7 Universal)</option>
                  <option value="5" ${this.filters.level === '5' ? 'selected' : ''}>Level 5 (Subtle A-E)</option>
                  <option value="6" ${this.filters.level === '6' ? 'selected' : ''}>Level 6 (Speed &amp; Pairs)</option>
                </select>
              </label>
              <label>Exposure Band:
                <select id="dashFilterBand">
                  <option value="all" ${this.filters.exposureBand === 'all' ? 'selected' : ''}>All Speeds</option>
                  <option value="slow" ${this.filters.exposureBand === 'slow' ? 'selected' : ''}>&ge; 200 ms</option>
                  <option value="mid" ${this.filters.exposureBand === 'mid' ? 'selected' : ''}>100&ndash;133 ms</option>
                  <option value="fast" ${this.filters.exposureBand === 'fast' ? 'selected' : ''}>&le; 67 ms</option>
                </select>
              </label>
              <label>Window:
                <select id="dashFilterDays">
                  <option value="0" ${this.filters.days === 0 ? 'selected' : ''}>All Time</option>
                  <option value="7" ${this.filters.days === 7 ? 'selected' : ''}>Last 7 Days</option>
                  <option value="30" ${this.filters.days === 30 ? 'selected' : ''}>Last 30 Days</option>
                </select>
              </label>
            </div>
          </div>

          <div class="confusion-table-wrap">
            <table class="confusion-matrix-table" aria-label="Confusion Matrix">
              <thead>
                <tr>
                  <th>Shown \\ Chosen</th>
                  ${matrix.cols.map((c) => `<th>${EMOTION_LABELS[c]}</th>`).join('')}
                  <th>Row N</th>
                </tr>
              </thead>
              <tbody>
                ${matrix.rows.map((r) => {
                  const rowN = matrix.rowTotals[r];
                  return `
                    <tr>
                      <th scope="row">${EMOTION_LABELS[r]}</th>
                      ${matrix.cols.map((c) => {
                        const p = matrix.probs[r][c];
                        const pct = Math.round(p * 100);
                        const isDiag = r === c;
                        const isOffDiagClickable = !isDiag && c !== 'not_sure';
                        const bg = isDiag
                          ? `rgba(34, 197, 94, ${0.12 + p * 0.65})`
                          : (p > 0 ? `rgba(239, 68, 68, ${Math.min(0.85, 0.15 + p * 1.1)})` : 'rgba(30, 41, 59, 0.4)');
                        return `
                          <td class="cm-cell ${isDiag ? 'cm-diag' : ''} ${isOffDiagClickable ? 'cm-offdiag' : ''}"
                              style="background:${bg};cursor:${isOffDiagClickable ? 'pointer' : 'default'};"
                              data-shown="${r}" data-chosen="${c}"
                              title="${isOffDiagClickable ? `Click to drill ${EMOTION_LABELS[r]} vs. ${EMOTION_LABELS[c]} (10 trials)` : `${EMOTION_LABELS[r]} -> ${EMOTION_LABELS[c]}: ${pct}%`}">
                            <div class="cm-pct">${rowN > 0 ? `${pct}%` : '&mdash;'}</div>
                            <div class="cm-cnt">(${matrix.counts[r][c]})</div>
                          </td>
                        `;
                      }).join('')}
                      <td class="cm-rown">${rowN}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Standardized Benchmark History -->
        <section class="dash-section">
          <h3>Standardized 42-Item Benchmark History (14-Day Re-Test Log)</h3>
          ${this.assessments.length === 0 ? `
            <p class="muted-text">No standardized benchmark completed yet. Click <strong>Run 42-Item Benchmark</strong> above to establish your baseline across 200 ms, 100 ms, and 50 ms exposures.</p>
          ` : `
            <div class="assessment-history-list">
              ${this.assessments.map((a, idx) => `
                <div class="assessment-log-card">
                  <div><strong>Benchmark #${idx + 1}</strong> &bull; ${new Date(a.timestamp).toLocaleDateString()}</div>
                  <div>Overall: <strong>${a.overallAccuracy}%</strong> (${a.correctCount}/${a.totalItems})</div>
                  <div>200 ms: <strong>${a.bySpeed?.[200]?.accuracy ?? 0}%</strong> | 100 ms: <strong>${a.bySpeed?.[100]?.accuracy ?? 0}%</strong> | 50 ms: <strong>${a.bySpeed?.[50]?.accuracy ?? 0}%</strong></div>
                  <div>Mean RT: <strong>${a.meanRtMs} ms</strong></div>
                </div>
              `).join('')}
            </div>
          `}
        </section>
      </div>
    `;

    // Bind filters
    this.containerEl.querySelector('#dashFilterLevel')?.addEventListener('change', (e) => {
      this.filters.level = e.target.value;
      this.render();
    });
    this.containerEl.querySelector('#dashFilterBand')?.addEventListener('change', (e) => {
      this.filters.exposureBand = e.target.value;
      this.render();
    });
    this.containerEl.querySelector('#dashFilterDays')?.addEventListener('change', (e) => {
      this.filters.days = Number(e.target.value);
      this.render();
    });

    // Bind off-diagonal cell clicks -> launch 10-trial targeted A/B pair drill
    this.containerEl.querySelectorAll('.cm-offdiag').forEach((cell) => {
      cell.addEventListener('click', () => {
        const shown = cell.getAttribute('data-shown');
        const chosen = cell.getAttribute('data-chosen');
        if (this.onLaunchPairDrill && shown && chosen && shown !== chosen) {
          this.onLaunchPairDrill(shown, chosen);
        }
      });
    });

    this.containerEl.querySelector('#dashRunAssessmentBtn')?.addEventListener('click', () => {
      if (this.onLaunchAssessment) this.onLaunchAssessment();
    });
  }
}
