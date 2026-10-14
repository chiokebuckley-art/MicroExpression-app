# Section 10 Acceptance Checklist (`CHECKLIST.md`)

- [x] **10.1 Realistic 3D Human Head Rig & PBR Shading**:
  - [x] Default head (`models/riya/head.glb`) is a textured, human-proportioned head-and-shoulders bust with distinct skin, eyes, teeth/tongue, brows, lashes, and hair (`models/dev/facecap.glb` loads only with `?rig=facecap`).
  - [x] All 52 canonical ARKit blendshapes present (`window.__missing.length === 0`).
  - [x] `MeshPhysicalMaterial` skin with subsurface wrap + reddish terminator scatter and AU-driven regional wrinkle normal blending (`AU1/2` forehead, `AU4` glabella, `AU6` crow's feet, `AU9` nose).
  - [x] Glossy cornea eyes (`roughness 0.025`, `clearcoat 1.0`, `IOR 1.376`) with visible key-light catchlight.
  - [x] Fixed three-point portrait lighting + vendored 1K studio HDRI PMREM environment + neutral `#383d45` training backdrop.
  - [x] 5 diverse realistic adult identities (`riya`, `female_adult_08`, `female_adult_12`, `male_adult_01`, `male_adult_06`) selectable in the stage toolbar.
  - [x] Shader pre-compilation (`renderer.compileAsync`) + 3 warmup frames during load so the first stimulus flash drops 0 frames.

- [x] **10.2 Action Unit Engine & Combination Correctives**:
  - [x] All 18 core AUs (+ 27, 43, 45, 46) mapped in `content/aus.json` and resolved by `src/face/resolver.js`.
  - [x] Fear corrective (`AU1+AU2+AU4+AU5+AU20+AU25+AU26(0.08)`) clamps `jawOpen <= 0.10` and clearly separates Fear from Surprise (`screenshots/realistic/fear-vs-surprise.png`).
  - [x] Duchenne Smile (`AU6+AU12`) vs. Social Smile (`AU12` alone) clearly separated (`screenshots/realistic/duchenne-vs-social.png`).
  - [x] Unilateral `Left`/`Right` support for `AU12` and `AU14` (Contempt).
  - [x] 3D-anchored SVG AU highlight overlays (`src/face/overlays.js`).

- [x] **10.3 Frame-Accurate `requestAnimationFrame` Scheduler**:
  - [x] Pure rAF frame-counting scheduler (`src/face/scheduler.js`) with display refresh rate calibration.
  - [x] Zero `setTimeout` or `setInterval` calls in `src/` (verified by `tests/copylint.py`).
  - [x] Displays nominal ms, actual frames, actual ms, and measured Hz badge in Level 6.

- [x] **10.4 Complete 10-Level Curriculum + Ethics Gate**:
  - [x] Level 1: Plutchik 8×3 Wheel + Dyads (`src/ui/wheel.js`), 2D Valence-Arousal Drag-and-Drop Grid + Dominance slider (`src/ui/vaGrid.js`), Cowen & Keltner 27-Emotion Map (`src/ui/map27.js`), 64-Word Vocabulary Deck, 12-item Quiz.
  - [x] Level 2: 3 facial zones, 11 muscles (interactive 2D SVG + 3D head raycast hotspots), 6 wrinkle guides, 22-item Quiz.
  - [x] Level 3: 18-AU Encyclopedia (`A–E` intensity ladder + unilateral L/R), 36-item AU Flash Drill, 12-item Build-the-Face sandbox.
  - [x] Level 4: 7 Universal Expressions Atlas + 1-click Contrast View + Recognition Drill (`1–7`, `?`, `Space`).
  - [x] Level 5: FACS Intensity `A–E` & Zone Isolation (`full`, `upper`, `lower`) + 22-item Spot-the-Difference A/B challenge.
  - [x] Ethics Gate (`#/ethics`): 4 scientific/ethical cards + 3/3 comprehension quiz required before Level 6 (unless "Unlock All" is toggled).
  - [x] Level 6: Adaptive 3-down / 1-up speed staircase (`[500..40]` ms) + 30 confusable pair drills.
  - [x] Level 7: 12 compound blends (two-tag selection), 18 masked flashes & upper-face leaks with millisecond scrubber, 4 genuine vs. posed timing comparisons.
  - [x] Level 8: 12 social & self-conscious states (3D head pitch/yaw/roll + gaze + bespoke posture SVGs).
  - [x] Level 9: 15 contextual scene vignettes + Common Misreads Workshop.
  - [x] Level 10: 8 scripted multi-second conversation simulations (two-part observation + calibrated follow-up questions) + 10 Context-Swap pairs (20 scenes).

- [x] **10.5 Psychophysics, SRS, Benchmark, Analytics & Mirror Mode**:
  - [x] 3-down / 1-up staircase (`src/train/staircase.js`) converges to ~79.4% threshold in simulated observer unit test.
  - [x] 6-box Leitner/SM-2 SRS (`src/train/srs.js`) with `[0, 1, 3, 7, 14, 30]` day intervals and 60/25/15 session mixer.
  - [x] Fixed-seed 42-item Standardized Benchmark (`src/train/assessment.js`) separated from training trials.
  - [x] 7×7 + "Not sure" Row-Normalized Confusion Matrix (`src/ui/dashboard.js`) with tap-cell targeted pair drill launcher.
  - [x] Offline MediaPipe Face Landmarker Mirror Mode (`src/ui/mirror.js`) with 3 s resting baseline calibration, AU bars, cosine similarity, live 3D head mirroring, and no-camera slider simulation fallback.
  - [x] IndexedDB persistence (`src/store/db.js`) + lossless JSON Export / Import / Reset (`src/store/export.js`).

## Desktop handoff fixes and teaching lesson (2026-10-14)

- [x] Fix 1: Per-identity landmark camera fitting; full-face trial framing; desktop/phone NDC checks and 25 camera views at each size.
- [x] Fix 2: Rendered identity synchronization; trial locks/reasons; latest-request-wins loading; restore user identity/camera.
- [x] Fix 3: Detached preparation, texture decode, shader compile, atomic swap, ready gating, next-identity preload and loading status.
- [x] Fix 4: Stage previews excluded from earned progress; baseline skip/reminder; baseline still needed for final comparison.
- [x] Fix 5: Bounded per-rig gains, stronger AU6/brows/disgust/contempt corner, aligned wrinkle masks, configurable beginner floor, unscored practice option and softer nose highlights.
- [x] Lesson: Seven provided cards, live slider, projected annotations, AU chips, comparisons, cue text, keyboard controls and no-WebGL fallback.
- [x] Relative static assets and service worker v6 cache, including lesson JSON, new modules and all seven reference PNGs.
- [x] Final verification: complete self-test, offline and phone smoke checks, cold-cache Slow 4G before/after evidence, no console/page/failed/external requests.
- [x] BUILD_LOG and this checklist record changes and reproducible checks.
