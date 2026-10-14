# 3D Face Models & Vendor Asset Sources

All assets in this repository use permissive licenses that allow modification and offline distribution.
No models with no-derivatives (`CC BY-NC-ND`, e.g., Eisko Louise) or study-only licenses (e.g., Dragonboots MetaHuman) are used.

## Primary Realistic Head (`models/riya/head.glb`)
- **Fallback notice (per Brief Section 0.2 & 4.3)**: `models/source/riya/` did not contain a pre-downloaded CGTrader Riya archive at build time, and per strict instructions the agent did not log in to any external site. Therefore, Microsoft Rocketbox `Female_Adult_01_facial.fbx` was processed through the headless Blender 5.2.1 pipeline (`tools/prepare_head.py`) to serve as the primary realistic textured head (`models/riya/head.glb`), with full 2K PBR skin, SSS map, wrinkle normal map (`f001_head_normal_wrinkle.tga`), separated glossy cornea/eye material, mouth cavity material, and alpha-tested hair, eyebrows, and eyelashes.
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_01
- **License**: MIT License (verified in `microsoft/Microsoft-Rocketbox` repository)
- **Blendshapes**: 52 canonical ARKit blendshapes (`browDownLeft` ... `tongueOut`, renamed from `AK_01_...` to `AK_52_...`) + 48 FACS `AU_*` shapes + 15 visemes. **Missing ARKit names**: 0.
- **GLB Size**: 16.63 MB (target <= 40 MB)

## Identity Panel Avatars (`models/rocketbox/<id>/head.glb`)
### `female_adult_01` — Elena (Adult Female 01)
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_01
- **License**: MIT License (Microsoft Rocketbox)
- **Demographics**: Sex: `female`, Age band: `25-35`, Ethnicity: `European / Mediterranean`, Skin variant: `light-warm`
- **GLB Size**: 16.63 MB | **Morph count**: 175 | **Missing ARKit names**: 0

### `female_adult_08` — Amara (Adult Female 08)
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_08
- **License**: MIT License (Microsoft Rocketbox)
- **Demographics**: Sex: `female`, Age band: `25-35`, Ethnicity: `African / Afro-Caribbean`, Skin variant: `deep-warm`
- **GLB Size**: 15.9 MB | **Morph count**: 175 | **Missing ARKit names**: 0

### `female_adult_12` — Mei (Adult Female 12)
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Female_Adult_12
- **License**: MIT License (Microsoft Rocketbox)
- **Demographics**: Sex: `female`, Age band: `30-45`, Ethnicity: `East Asian`, Skin variant: `light-neutral`
- **GLB Size**: 15.54 MB | **Morph count**: 175 | **Missing ARKit names**: 0

### `male_adult_01` — Marcus (Adult Male 01)
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_01
- **License**: MIT License (Microsoft Rocketbox)
- **Demographics**: Sex: `male`, Age band: `30-40`, Ethnicity: `European / North American`, Skin variant: `medium-warm`
- **GLB Size**: 14.64 MB | **Morph count**: 175 | **Missing ARKit names**: 0

### `male_adult_06` — Mateo (Adult Male 06)
- **Source URL**: https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/Male_Adult_06
- **License**: MIT License (Microsoft Rocketbox)
- **Demographics**: Sex: `male`, Age band: `35-50`, Ethnicity: `South Asian / Latino`, Skin variant: `olive-tan`
- **GLB Size**: 16.42 MB | **Morph count**: 175 | **Missing ARKit names**: 0

## Developer Fallback (`models/dev/facecap.glb`)
- **Source URL**: https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/facecap.glb
- **License**: MIT License (Three.js examples)
- **Usage**: Untextured grey developer head reachable **only** via `?rig=facecap`.

## Environment HDRI & Runtime Libraries
- **Studio Environment HDRI**: `models/vendor/hdri/studio_small_09_1k.hdr` — Poly Haven (`https://polyhaven.com/a/studio_small_09`), License: **CC0 1.0 Universal (Public Domain)**.
- **Three.js (v0.169.0)**: `lib/three.module.js` and `lib/addons/*` — MIT License (`https://github.com/mrdoob/three.js`).
- **MediaPipe Tasks Vision (v0.10.17)**: `models/vendor/mediapipe/` (`vision_bundle.mjs`, `wasm/*`, `face_landmarker.task`) — Apache 2.0 License (`https://developers.google.com/mediapipe`).
