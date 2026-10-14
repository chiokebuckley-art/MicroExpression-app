# Reading Faces — Micro-Expression, Subtle Expression & Emotional Literacy Trainer

**Reading Faces** (`MicroExpression app`) is an offline-first, scientifically grounded web application for training facial Action Unit (FACS) literacy, subtle and partial expression recognition, sub-200 ms micro-expression perception, multi-dimensional affective vocabulary, and contextual real-world calibration.

---

## Key Features

1. **Realistic 3D Head Rig & Multi-Identity Diversity (`models/riya/` & `models/rocketbox/`)**
   - Textured head-and-shoulders 3D human busts built from Microsoft Rocketbox (`Female_Adult_01` primary realistic head, plus `Female_Adult_08`, `Female_Adult_12`, `Male_Adult_01`, and `Male_Adult_06`) via our reproducible headless Blender 5.2.1 pipeline (`tools/prepare_head.py`).
   - Full **52 canonical ARKit blendshapes** (`window.__missing.length === 0`) driven by a sparse Action Unit (`AU -> blendshape`) resolver with anatomical combination correctives (including the **Fear Fix** clamping `jawOpen <= 0.10` when `AU1+AU4+AU20` fire together, **Sadness oblique brow** boost, and **Duchenne `AU6+AU12` vs. Social Smile `AU12`** separation).
   - **Realistic PBR Shading**: `MeshPhysicalMaterial` skin with subsurface wrap diffuse + reddish shadow-terminator scatter (`src/face/materials.js`), AU-driven per-region dynamic wrinkle normal blending (`src/face/wrinkles.js` for forehead `AU1/2`, glabella `AU4`, crow's feet `AU6`, and nasalis `AU9`), glossy cornea eyes (`IOR 1.376`, `clearcoat 1.0`), cavity-darkened oral interior, and alpha-tested double-sided hair/brow/lash cards.
   - **Fixed Three-Point Portrait Lighting + Studio HDRI PMREM Environment** (`src/face/lighting.js`).
   - Developer reference fallback (`models/dev/facecap.glb`) loads **only** when explicitly requested via `?rig=facecap` or selected in `#/au-lab`.

2. **Frame-Accurate `requestAnimationFrame` Flash Scheduler (`src/face/scheduler.js`)**
   - Measures display refresh rate (`60 Hz`, `120 Hz`, `144 Hz`) and snaps nominal exposures (`[500, 333, 200, 133, 100, 67, 50, 40]` ms) to exact display frame counts.
   - Zero `setTimeout` or `setInterval` timers anywhere in stimulus exposure code.
   - Logs both nominal ms, actual frame count, actual duration ms, and display Hz on every trial.

3. **10-Level Progressive Curriculum + Mandatory Ethics Gate**
   - **Level 1 — Emotional Literacy & Foundations**: Interactive 8×3 Plutchik Wheel + Primary/Secondary/Tertiary Dyads (`src/ui/wheel.js`), 2D Valence-Arousal Drag-and-Drop Plane + Dominance slider (`src/ui/vaGrid.js`), Cowen & Keltner (2017) 27-Category Clustered Map (`src/ui/map27.js`), 64-Word Vocabulary Deck, and 12-item Mastery Quiz.
   - **Level 2 — Facial Anatomy, Zones & Muscle Map**: 3 facial zones, 11 core facial muscles with interactive 2D SVG diagram + 3D head mesh raycast hotspots, 6 transient wrinkle guides, and 22-item Anatomy Quiz.
   - **Level 3 — Action Units (FACS Core 22)**: Interactive 22-AU Encyclopedia with FACS intensity ladder (`A=0.15` to `E=0.95`) and bilateral/unilateral toggles, 36-item AU Flash Drill, and 12-item Build-the-Face sandbox.
   - **Level 4 — The 7 Universal Expressions (Full View)**: Interactive Atlas with 1-click Contrast View, 5 camera presets (`front`, `left34`, `right34`, `eyeCloseup`, `mouthCloseup`), and Full-View Recognition Drill (`1–7`, `?`, `Space`).
   - **Level 5 — Subtle & Partial Expressions**: FACS Intensity `A–E` and Zone Isolation (`Full`, `Upper Face Only`, `Lower Face Only`) explorer, Subtle/Partial Recognition Drill, and 22-item Spot-the-Difference A/B challenge.
   - **Scientific & Ethical Framing Gate (`#/ethics`)**: Covers Bond & DePaulo (2006), the Othello Error (Ekman 1985), baseline/cultural calibration, and using expressions as hypotheses for empathy rather than accusation (3/3 comprehension quiz).
   - **Level 6 — Micro-Expression Speed Training & Confusable Pairs**: Adaptive **3-down / 1-up staircase** per emotion (`79.4%` threshold tracking) + 30 targeted drills across the 5 most confusable emotion pairs.
   - **Level 7 — Compound Blends, Masked Flashes & Timing**: 12 two-tag compound emotion blends, 12 masked + 6 leakage micro-flash & upper-face leakage keyframe timelines with an interactive millisecond scrubber, and 4 genuine vs. posed smile onset/offset timing comparisons.
   - **Level 8 — Beyond the 7 (Extended & Self-Conscious States)**: 12 multi-modal states (*Embarrassment*, *Shame*, *Pride*, *Amusement*, *Interest*, *Relief*, *Sympathy*, *Pain*, *Concentration*, *Skepticism*, *Coyness*, *Triumph*) pairing 3D head pitch/yaw/roll + gaze with bespoke SVG body posture silhouettes (`src/ui/scenes.js`).
   - **Level 9 — Expressions in Context & Common Misreads**: 15 multi-cue situational vignettes + Common Misreads Workshop (*Concentration ≠ Anger*, *Pain ≠ Disgust*, *Polite Smile ≠ Genuine Joy*).
   - **Level 10 — Real-World Calibration & Conversation Simulations**: 8 multi-second scripted dialogue timelines with embedded micro-flashes and two-part questions (observation + non-accusatory calibrated follow-up question), plus 10 Context-Swap pairs (20 scenes).

4. **Psychophysics, SRS, Confusion Matrix Dashboard & Offline Mirror Mode**
   - **6-Box Leitner/SM-2 Spaced Repetition (`src/train/srs.js`)**: Intervals `[0, 1, 3, 7, 14, 30]` days across all 5 card kinds (`emotion`, `pair`, `au`, `vocab`, `scene`) with 60% due / 25% top-3 confused / 15% new session mixing.
   - **Fixed-Seed 42-Item Standardized Benchmark (`#/assessment`)**: Administered at baseline and every 14 days across `200, 100, 50` ms; stored separately from training trials.
   - **7×7 + "Not sure" Row-Normalized Confusion Matrix (`#/dashboard`)**: Filterable by level, exposure band, and date window; clicking any off-diagonal cell launches a targeted pair drill on that exact confusion pair.
   - **100% On-Device Webcam Mirror Mode (`#/mirror`)**: Uses vendored `@mediapipe/tasks-vision` Face Landmarker WASM + model with 3-second neutral baseline calibration, live AU bars, cosine similarity score, 3D avatar mirroring, and an interactive no-camera AU slider simulation fallback.

---

## Running Locally (Zero Build Step)

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in any modern browser.
- **Developer AU & 52-Blendshape Sandbox**: `http://localhost:8000/#/au-lab`
- **FaceCap Developer Rig Fallback**: `http://localhost:8000/?rig=facecap#/au-lab`
- **Browser Unit Test Suite**: `http://localhost:8000/tests/unit.html`

## Running Automated Verification

```bash
# 1. Copy-lint & static guardrails (0 forbidden words, 0 placeholders, 0 setTimeout/setInterval)
python3 tests/copylint.py

# 2. Full Playwright headless Chrome verification + screenshot generation
.venv/bin/python tests/selftest.py
```

## Beginner journey (October 2026)
Start at `#/home`. Eight stages use explicit first-answer Checks. Hints/replays earn supported practice credit; they cannot unlock mastery. Benchmark baseline, final (75% at 200 ms; 60% at 100 ms), printable recognition certificate and an in-app 30-day recheck are included. Reduced-motion speed checks are practice only. Breaks never erase practice-day rewards. Old fixed-score completions are not accepted as new-path evidence.

The region stage assesses observable movement, not an unidentifiable emotion from a partial face. Original lessons remain optional reference material. The five existing adult 3D identities remain: no licensed real-person clips or additional age/accessory models were supplied. A certificate does not establish real-world transfer. Recheck reminders appear in-app; no external notifications are scheduled.
