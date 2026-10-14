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
