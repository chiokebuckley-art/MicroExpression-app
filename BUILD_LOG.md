# BUILD_LOG — Reading Faces (MicroExpression App)

## 1. Environment & Tooling Discovery
- **Python**: `/usr/bin/python3` (`3.9.6`) with project virtual environment `.venv` (`playwright`, `pillow` frozen in `requirements.txt`).
- **Blender**: `/Applications/Blender.app/Contents/MacOS/Blender` (`Blender 5.2.1`).
- **Headless Browser**: Google Chrome (`/Applications/Google Chrome.app`) driven via Playwright Python (`tests/selftest.py`).
- **GitHub CLI**: `/Users/chiokebuckleymini/bin/gh` authenticated as `chiokebuckley-art`.

## 2. 3D Head Asset Pipeline (`tools/prepare_head.py` & `tools/compress.sh`)
- Checked `models/source/riya/` on startup; directory was empty (no pre-downloaded Riya export present).
- Per Section 0.2 / Section 4.3 of the specification, acquired 5 diverse adult facial rigs (`*_facial.fbx` + TGA diffuse/normal/opacity textures) from **Microsoft Rocketbox** (MIT License):
  - `Female_Adult_01` &rarr; exported to `models/riya/head.glb` (Primary Realistic Head) and `models/rocketbox/female_adult_01/head.glb` (`16.63 MB`)
  - `Female_Adult_08` &rarr; `models/rocketbox/female_adult_08/head.glb` (`15.90 MB`)
  - `Female_Adult_12` &rarr; `models/rocketbox/female_adult_12/head.glb` (`15.54 MB`)
  - `Male_Adult_01` &rarr; `models/rocketbox/male_adult_01/head.glb` (`14.64 MB`)
  - `Male_Adult_06` &rarr; `models/rocketbox/male_adult_06/head.glb` (`16.42 MB`)
- Automated headless Blender 5.2.1 script (`tools/prepare_head.py`):
  - Renamed all 52 `AK_NN_*` shape keys to canonical ARKit camelCase (`browDownLeft` .. `tongueOut`), yielding **0 missing ARKit blendshapes** (`window.__missing.length === 0`).
  - Split head geometry into 5 dedicated material primitives (`Body_Shoulders`, `Skin`, `Hair_Opacity`, `Eyes`, `Mouth`) so eyes receive glossy cornea shading (`IOR 1.376`, `clearcoat 1.0`), mouth receives cavity AO darkening, hair/lashes receive alpha-tested double-sided rendering (`renderOrder = 2`), and skin receives subsurface wrap + terminator scatter + AU-driven regional wrinkle normal maps.
  - Trimmed geometry below the upper chest (`z < 1.30m`) in Edit Mode while preserving all 175 morph targets and shape-key normals.
  - Generated `head_normal_wrinkle.jpg` (procedural anatomical forehead, glabella, crow's feet, and nasalis normal map) and `head_sss.jpg` (subsurface scatter thickness map) for each identity.

## 3. Vendored Runtime Dependencies (100% Offline Execution)
- `lib/three.module.js` + `lib/addons/` (Three.js r169 `GLTFLoader`, `KTX2Loader`, `RGBELoader`, `OrbitControls`, `RoomEnvironment`, `BufferGeometryUtils`, `meshopt_decoder.module.js`, `basis_transcoder.{js,wasm}`).
- `models/vendor/mediapipe/` (`@mediapipe/tasks-vision@0.10.17` `vision_bundle.mjs`, `wasm/*`, and `face_landmarker.task`).
- `models/vendor/hdri/studio_small_09_1k.hdr` (CC0 1K studio HDRI environment map).
- `models/dev/facecap.glb` (developer reference fallback rig, loaded only when `?rig=facecap` is present in the URL or selected in `#/au-lab`).

## 4. Verification Summary
- `python3 tests/copylint.py`: **PASSED** (20 JSON files, 35 ES module JS files, `index.html`; 0 forbidden words, 0 placeholders, 0 `setTimeout`/`setInterval`).
- `.venv/bin/python tests/selftest.py`: **PASSED** (all browser unit tests in `tests/unit.html` pass; 0 console errors, 0 page errors, 0 failed network requests, 0 external network requests; all screenshots captured in `screenshots/` and `screenshots/realistic/`).

## Desktop handoff — 2026-10-14

Implemented the five fixes and the “What to look for” lesson from `codex-handoff/CODEX_TASK.md` against `928035b`.

- Camera presets now measure morph-displacement landmarks on each identity, fit vertical and horizontal FOV, and recalculate on resize. Runs force front framing; region practice uses the appropriate close-up. Camera/identity choices are restored when a run ends or is left.
- Rig loading is transactional: manifest, AU map, GLB, texture decoding and shader compilation complete off scene before a synchronous swap and first render. A request sequence prevents stale requests winning. A five-identity prepared-model cache supports next-item preload; inactive prepared heads are retained for reuse and disposed with the rig. Loading status leaves the previous face visible.
- The identity toolbar follows actual rendered identity, labels/locks trial ownership, and rejects overlapping load races. Countdown preparation awaits the latest ready promise and two animation frames. Flashes retain the unchanged frame-counted rAF scheduler.
- Later-stage practice previews save `preview:true` and cannot earn mastery, cards, SRS advancement or speed medals. Stage 1 shows the new lesson before the baseline offer; users may skip the baseline and see a persistent reminder. Ethics and baseline requirements still apply to final qualification.
- AU6 uses stronger lower-lid contribution, happiness uses full AU6/AU12, and each AU map contains bounded facial gains. Brow/nose/crow’s-feet shading uses measured feature heights, including the taller male heads. Contempt remains unilateral AU14 without upper-face action. Skin roughness is floored at 0.45 with reduced specular intensity.
- Stage 1 starts at 500/300/200 ms; the default beginner 200 ms practice floor is configurable and cannot manufacture a faster speed qualification. Benchmarks preserve 200/100/50 ms. A three-item, unscored 200 ms practice option precedes the baseline.
- Added seven live lesson cards, interpolated expression sliders, rAF play/200 ms flash controls, morph-following SVG labels, AU highlighting, comparison targets, text annotations, keyboard navigation and the provided reference PNGs. Motion preferences are respected. Phone layouts keep the live face visible while using lesson controls.
- Added `?nowebgl=1` reference-card mode, lesson review links, and service-worker cache v6 with all lesson assets. Everything remains static and relative to the GitHub Pages subdirectory; no additional external requests.

Validation evidence is in `screenshots/fixes/` and `screenshots/lesson/`. Pre-fix captures are retained under `screenshots/fixes/before/`. `tests/selftest.py` now exercises the supported Settings control instead of the removed global unlock switch and includes `tests/fixes_e2e.py` for camera NDC bounds at 1280×800 and 390×844, expression-region differences on all five identities, load races, ten rotating benchmark presentations, readiness/countdown pixels, every lesson card and annotation, reference fallbacks, offline reload and phone layout. `tests/journey.test.mjs` adds preview/baseline-skip/minimum-flash regression cases. Optional DOM tests resolve dependencies from `MICRO_TEST_DEPS` or `../test-deps/package.json`.

Verification results: all 14 browser unit tests, the journey DOM suite and the complete Playwright self-test passed. All 50 desktop/phone camera combinations passed NDC bounds; all 35 core emotion apex views were captured and visually checked. Happiness eye-region movement is 2.00–3.02× the before captures; Duchenne/social eye-region differences are 4.71–6.73, above the required 1.5. Contempt's pose-matched upper-face differences remain below 0.005. Ten rotating benchmark trials produced twenty nonblank countdown frames, with readiness true at every scheduled flash and identity/camera restoration verified. The lesson reloads offline, every no-WebGL card loads, and rapid toolbar changes plus simultaneous live-face/slider visibility pass at 390×844. A separate cold-cache 200 KiB/s, 150 ms latency check reproduced the original empty canvas (zero heads, center pixel standard deviation 0) and retained the previous face in the update (one head, standard deviation 42.01).

Public deployment smoke check: the seven-card lesson loads at the GitHub Pages URL. A follow-up 611×724 panel check exposed an oversized sticky face at tablet widths; the 601–1024 px lesson layout now uses a 260 px canvas and compact toolbar. The isolated check confirms the face and slider remain visible together without horizontal overflow; its screenshot is `screenshots/lesson/narrow-panel.png`.
