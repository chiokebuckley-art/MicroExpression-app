/**
 * Webcam Mirror Mode with Offline MediaPipe Face Landmarker (Section 8).
 * - Lazy-loads vendored `./models/vendor/mediapipe/vision_bundle.mjs`, `./models/vendor/mediapipe/wasm`,
 *   and `./models/vendor/mediapipe/face_landmarker.task` ONLY when the user clicks "Enable Camera".
 * - Zero external network requests; 100% local processing; no video frames ever leave the device.
 * - Captures a 3-second resting baseline on start, subtracts baseline + noise floor, and maps
 *   the 52 ARKit blendshapes to estimated AU activations (`estimateAUsFromBlendshapes`).
 * - Displays live target AU bars, cosine similarity match %, per-cue pass/fail checkmarks,
 *   and mirrors the user's blendshapes onto the 3D head rig in real time.
 * - Includes a graceful Simulation / Manual Practice mode when no camera is available or permission is denied.
 */

import { estimateAUsFromBlendshapes, getAUDefinition } from '../face/auMap.js';
import { resolveExpressionState } from '../face/resolver.js';

export class MirrorModeController {
  constructor(containerEl, { rig, expressionsCatalog, auCatalog } = {}) {
    this.containerEl = containerEl;
    this.rig = rig;
    this.expressionsCatalog = expressionsCatalog;
    this.auCatalog = auCatalog;

    this.targetEmotionId = 'happiness';
    this.cameraActive = false;
    this.simulating = false;
    this.calibrating = false;
    this.calibrationSamples = [];
    this.baselineMap = {};
    this.liveAUs = {};
    this.similarityScore = 0;

    this.videoEl = null;
    this.stream = null;
    this.faceLandmarker = null;
    this._rafId = null;
    this._disposed = false;

    this.render();
  }

  getTargetOptions() {
    const core = this.expressionsCatalog?.core || [];
    const variants = (this.expressionsCatalog?.variants || []).filter((v) =>
      ['happiness_social', 'horror_terror', 'sadness_no17'].includes(v.id)
    );
    return [...core, ...variants];
  }

  getCurrentTargetDef() {
    const opts = this.getTargetOptions();
    return opts.find((e) => e.id === this.targetEmotionId) || opts[0];
  }

  render() {
    const options = this.getTargetOptions();
    const targetDef = this.getCurrentTargetDef();
    const requiredAUs = (targetDef?.aus || []).map((a) => ({
      auId: Number(a.au),
      targetIntensity: Number(a.intensity || 0.7),
      def: getAUDefinition(this.auCatalog, a.au)
    }));

    this.containerEl.innerHTML = `
      <div class="mirror-mode-panel">
        <div class="mirror-header-row">
          <div>
            <h3>FACS Mirror &amp; Proprioception Lab (100% On-Device)</h3>
            <p class="muted-text">Practice activating individual Action Units and universal expressions. Camera video stays strictly in local memory and is never uploaded or stored.</p>
          </div>
          <div class="mirror-controls-bar">
            <label>Target Expression:
              <select id="mirrorTargetSelect">
                ${options.map((opt) => `<option value="${opt.id}" ${opt.id === this.targetEmotionId ? 'selected' : ''}>${opt.name}</option>`).join('')}
              </select>
            </label>
            ${!this.cameraActive ? `
              <button type="button" class="btn btn-primary" id="mirrorStartCamBtn">Enable Camera (Offline MediaPipe)</button>
              <button type="button" class="btn btn-secondary" id="mirrorSimModeBtn">Practice via AU Sliders (No Camera)</button>
            ` : `
              <button type="button" class="btn btn-secondary" id="mirrorRecalibrateBtn">Re-Calibrate Neutral (3 s)</button>
              <button type="button" class="btn btn-danger" id="mirrorStopCamBtn">Stop Camera</button>
            `}
          </div>
        </div>

        <div id="mirrorStatusBanner" class="mirror-status-banner">
          ${this.cameraActive
            ? (this.calibrating ? 'Calibrating neutral resting face for 3 seconds... Relax your face and look ahead.' : 'Live MediaPipe Face Landmarker active (52 ARKit blendshapes -> FACS AU estimator).')
            : (this.simulating ? 'No-Camera Practice Mode active: adjust the AU sliders below to test the cosine similarity matcher and drive the 3D head.' : 'Camera is off. Click "Enable Camera" to start on-device tracking, or use "Practice via AU Sliders" if you do not have a webcam.')}
        </div>

        <div class="mirror-grid">
          <div class="mirror-video-card">
            <div class="webcam-viewport" id="mirrorWebcamBox">
              <video id="mirrorVideoEl" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:${this.cameraActive ? 'block' : 'none'};"></video>
              ${!this.cameraActive ? `
                <div class="webcam-placeholder">
                  <div class="webcam-icon">📷</div>
                  <p>Webcam stream inactive</p>
                  <small>3D Head Rig shows Target Expression until camera or slider simulation is started.</small>
                </div>
              ` : ''}
            </div>
            <div class="mirror-target-cue-box">
              <h4>Target Recipe: ${targetDef?.name || ''}</h4>
              <p class="muted-text">${targetDef?.diagnosticSummary || ''}</p>
              <button type="button" class="btn btn-sm btn-secondary" id="mirrorPreviewTargetOnRigBtn">Preview Target on 3D Head</button>
            </div>
          </div>

          <div class="mirror-metrics-card">
            <div class="similarity-meter-header">
              <span>Overall Expression Match (Cosine Similarity)</span>
              <strong id="mirrorSimilarityValue" class="similarity-pct">${Math.round(this.similarityScore * 100)}%</strong>
            </div>
            <div class="progress-bar-track">
              <div id="mirrorSimilarityFill" class="progress-bar-fill" style="width:${Math.round(this.similarityScore * 100)}%;"></div>
            </div>

            <h4>Target Action Unit Checklist</h4>
            <div class="mirror-au-bars" id="mirrorAUBars">
              ${requiredAUs.map((req) => {
                const userVal = Number(this.liveAUs[req.auId] || 0);
                const passThreshold = Math.max(0.25, req.targetIntensity * 0.55);
                const passed = userVal >= passThreshold;
                return `
                  <div class="mirror-au-row" data-au-id="${req.auId}">
                    <div class="mirror-au-label-line">
                      <span><strong>AU${req.auId}</strong> ${req.def?.name || ''}</span>
                      <span class="au-pass-badge ${passed ? 'pass' : 'pending'}" id="mirrorBadgeAU_${req.auId}">
                        ${passed ? '✓ Matched' : `Target ≥ ${Math.round(passThreshold * 100)}%`} (${Math.round(userVal * 100)}%)
                      </span>
                    </div>
                    <div class="progress-bar-track sm">
                      <div class="progress-bar-fill au-fill" id="mirrorBarAU_${req.auId}" style="width:${Math.round(userVal * 100)}%;"></div>
                    </div>
                    ${this.simulating ? `
                      <input type="range" class="sim-au-slider" data-sim-au="${req.auId}" min="0" max="1" step="0.05" value="${userVal}" aria-label="Simulate AU${req.auId}" />
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    // Show target expression on 3D rig initially if not actively mirroring
    if (this.rig && !this.cameraActive && !this.simulating && targetDef) {
      this.rig.setExpressionFromRecipe(targetDef);
    }

    this._bindEvents();
  }

  _bindEvents() {
    this.containerEl.querySelector('#mirrorTargetSelect')?.addEventListener('change', (e) => {
      this.targetEmotionId = e.target.value;
      this.liveAUs = {};
      this.similarityScore = 0;
      this.render();
    });

    this.containerEl.querySelector('#mirrorStartCamBtn')?.addEventListener('click', () => {
      this.startCamera();
    });

    this.containerEl.querySelector('#mirrorSimModeBtn')?.addEventListener('click', () => {
      this.simulating = !this.simulating;
      this.render();
    });

    this.containerEl.querySelector('#mirrorRecalibrateBtn')?.addEventListener('click', () => {
      this.startBaselineCalibration();
    });

    this.containerEl.querySelector('#mirrorStopCamBtn')?.addEventListener('click', () => {
      this.stopCamera();
      this.render();
    });

    this.containerEl.querySelector('#mirrorPreviewTargetOnRigBtn')?.addEventListener('click', () => {
      const targetDef = this.getCurrentTargetDef();
      if (this.rig && targetDef) {
        this.rig.setExpressionFromRecipe(targetDef);
      }
    });

    this.containerEl.querySelectorAll('.sim-au-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const auId = Number(slider.getAttribute('data-sim-au'));
        this.liveAUs[auId] = Number(slider.value);
        this._updateLiveMetricsUI();
        if (this.rig) {
          const ausList = Object.entries(this.liveAUs).map(([au, intensity]) => ({
            au: Number(au),
            intensity: Number(intensity)
          }));
          const state = resolveExpressionState({ aus: ausList }, this.auCatalog);
          this.rig.applyResolvedState(state);
        }
      });
    });
  }

  async ensureLandmarkerLoaded() {
    if (this.faceLandmarker) return this.faceLandmarker;
    const visionModule = await import('../../models/vendor/mediapipe/vision_bundle.mjs');
    const { FaceLandmarker, FilesetResolver } = visionModule;
    const filesetResolver = await FilesetResolver.forVisionTasks('./models/vendor/mediapipe/wasm');
    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: './models/vendor/mediapipe/face_landmarker.task',
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
    return this.faceLandmarker;
  }

  async startCamera() {
    const banner = this.containerEl.querySelector('#mirrorStatusBanner');
    try {
      if (banner) banner.textContent = 'Initializing offline MediaPipe Face Landmarker WASM...';
      await this.ensureLandmarkerLoaded();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      this.cameraActive = true;
      this.simulating = false;
      this.render();

      this.videoEl = this.containerEl.querySelector('#mirrorVideoEl');
      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
      }
      this.startBaselineCalibration();
      this._startTrackingLoop();
    } catch (err) {
      this.cameraActive = false;
      this.simulating = true;
      this.render();
      const errBanner = this.containerEl.querySelector('#mirrorStatusBanner');
      if (errBanner) {
        errBanner.textContent = `Webcam unavailable (${err?.message || 'permission denied'}). Switched to interactive AU Slider Simulation Mode so you can still practice every cue.`;
      }
    }
  }

  startBaselineCalibration() {
    this.calibrating = true;
    this.calibrationSamples = [];
    this.calibrationStartMs = performance.now();
    const banner = this.containerEl.querySelector('#mirrorStatusBanner');
    if (banner) {
      banner.textContent = 'Calibrating neutral resting face for 3.0 seconds... Relax your face.';
    }
  }

  _startTrackingLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    let lastVideoTime = -1;

    const loop = (now) => {
      if (this._disposed || !this.cameraActive) return;
      this._rafId = requestAnimationFrame(loop);

      if (!this.videoEl || this.videoEl.readyState < 2 || !this.faceLandmarker) return;
      if (this.videoEl.currentTime === lastVideoTime) return;
      lastVideoTime = this.videoEl.currentTime;

      const result = this.faceLandmarker.detectForVideo(this.videoEl, now);
      const categories = result?.faceBlendshapes?.[0]?.categories;
      if (!categories) return;

      const rawMap = {};
      for (const c of categories) {
        rawMap[c.categoryName] = c.score;
      }

      if (this.calibrating) {
        this.calibrationSamples.push(rawMap);
        if (now - this.calibrationStartMs >= 3000) {
          this.calibrating = false;
          const avg = {};
          const n = this.calibrationSamples.length || 1;
          for (const sample of this.calibrationSamples) {
            for (const [k, v] of Object.entries(sample)) {
              avg[k] = (avg[k] || 0) + v / n;
            }
          }
          this.baselineMap = avg;
          const banner = this.containerEl.querySelector('#mirrorStatusBanner');
          if (banner) {
            banner.textContent = 'Neutral baseline locked! Now perform the target expression.';
          }
        }
        return;
      }

      const { auScores, deltas } = estimateAUsFromBlendshapes(rawMap, this.baselineMap, this.auCatalog);
      this.liveAUs = auScores;
      if (this.rig) {
        this.rig.setRawBlendshapes(deltas);
      }
      this._updateLiveMetricsUI();
    };

    this._rafId = requestAnimationFrame(loop);
  }

  _updateLiveMetricsUI() {
    const targetDef = this.getCurrentTargetDef();
    const requiredAUs = (targetDef?.aus || []).map((a) => ({
      auId: Number(a.au),
      targetIntensity: Number(a.intensity || 0.7)
    }));

    // Compute cosine similarity across target AUs
    let dot = 0;
    let normTarget = 0;
    let normUser = 0;

    for (const req of requiredAUs) {
      const u = Number(this.liveAUs[req.auId] || 0);
      const t = req.targetIntensity;
      dot += u * t;
      normTarget += t * t;
      normUser += u * u;

      const passThreshold = Math.max(0.25, t * 0.55);
      const passed = u >= passThreshold;
      const barEl = this.containerEl.querySelector(`#mirrorBarAU_${req.auId}`);
      const badgeEl = this.containerEl.querySelector(`#mirrorBadgeAU_${req.auId}`);
      if (barEl) barEl.style.width = `${Math.round(u * 100)}%`;
      if (badgeEl) {
        badgeEl.className = `au-pass-badge ${passed ? 'pass' : 'pending'}`;
        badgeEl.textContent = `${passed ? '✓ Matched' : `Target ≥ ${Math.round(passThreshold * 100)}%`} (${Math.round(u * 100)}%)`;
      }
    }

    // Scale cosine similarity by activation magnitude so tiny noise doesn't yield 100%
    const rawCos = (normTarget > 0 && normUser > 0) ? dot / (Math.sqrt(normTarget) * Math.sqrt(normUser)) : 0;
    const magScale = normTarget > 0 ? Math.min(1, Math.sqrt(normUser / normTarget)) : 0;
    this.similarityScore = Math.max(0, Math.min(1, rawCos * magScale));

    const pct = Math.round(this.similarityScore * 100);
    const valEl = this.containerEl.querySelector('#mirrorSimilarityValue');
    const fillEl = this.containerEl.querySelector('#mirrorSimilarityFill');
    if (valEl) valEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
  }

  stopCamera() {
    this.cameraActive = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  dispose() {
    this._disposed = true;
    this.stopCamera();
  }
}
