/**
 * Realistic Three.js Renderer, PMREM Environment, and Fixed Three-Point Lighting Setup (Section 4.6).
 * - WebGL2, outputColorSpace = SRGBColorSpace, toneMapping = ACESFilmicToneMapping,
 *   exposure 1.0, MSAA antialiasing, PCFSoftShadowMap.
 * - Environment map from PMREMGenerator: vendored 1K CC0 studio HDRI (studio_small_09_1k.hdr)
 *   with RoomEnvironment fallback. Environment intensity 0.75.
 * - Plain mid-grey background (#383d45) so background never distracts during training.
 * - Fixed three-point light rig:
 *   1. Soft key light (directional, 35 deg up, 30 deg to side, 2048 shadow map)
 *   2. Fill light at ~30% from the opposite side
 *   3. Rim / back light for head-and-shoulder separation
 */

import * as THREE from 'three';
import { RGBELoader } from '../../lib/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from '../../lib/addons/environments/RoomEnvironment.js';

export const TRAINING_BG_HEX = 0x383d45;

export function createRenderer(canvas, quality = 'high') {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2));
  return renderer;
}

export function setupThreePointLights(scene) {
  const lightGroup = new THREE.Group();
  lightGroup.name = 'ThreePointLightRig';

  // Target at face center (approx y = 1.60 m in world space)
  const targetObj = new THREE.Object3D();
  targetObj.position.set(0, 1.59, 0);
  scene.add(targetObj);

  // 1. Key light: 35 deg up, 30 deg to subject's left/viewer's right, 2048 shadow map
  const elevRad = THREE.MathUtils.degToRad(35);
  const azimRad = THREE.MathUtils.degToRad(30);
  const dist = 2.2;
  const keyLight = new THREE.DirectionalLight(0xfffaf2, 2.25);
  keyLight.name = 'KeyLight';
  keyLight.position.set(
    dist * Math.cos(elevRad) * Math.sin(azimRad),
    1.59 + dist * Math.sin(elevRad),
    dist * Math.cos(elevRad) * Math.cos(azimRad)
  );
  keyLight.target = targetObj;
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 4.0;
  const d = 0.32;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.012;
  lightGroup.add(keyLight);

  // 2. Fill light: ~30% of key intensity from opposite side (-35 deg azimuth, 15 deg up)
  const fillLight = new THREE.DirectionalLight(0xeef4ff, 0.68);
  fillLight.name = 'FillLight';
  fillLight.position.set(-1.4, 1.85, 1.6);
  fillLight.target = targetObj;
  lightGroup.add(fillLight);

  // 3. Rim / back light: separation from behind and above
  const rimLight = new THREE.DirectionalLight(0xfff6e8, 0.95);
  rimLight.name = 'RimLight';
  rimLight.position.set(-0.6, 2.25, -1.5);
  rimLight.target = targetObj;
  lightGroup.add(rimLight);

  scene.add(lightGroup);
  return { lightGroup, keyLight, fillLight, rimLight, targetObj };
}

export async function setupEnvironmentMap(renderer, scene, hdriUrl = './models/vendor/hdri/studio_small_09_1k.hdr') {
  scene.background = new THREE.Color(TRAINING_BG_HEX);
  scene.environmentIntensity = 0.78;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  try {
    const rgbeLoader = new RGBELoader();
    const hdrTex = await new Promise((resolve, reject) => {
      rgbeLoader.load(hdriUrl, resolve, undefined, reject);
    });
    const envRT = pmrem.fromEquirectangular(hdrTex);
    scene.environment = envRT.texture;
    hdrTex.dispose();
    pmrem.dispose();
    return envRT.texture;
  } catch (err) {
    // Fallback to built-in RoomEnvironment per Section 4.6
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
    return envRT.texture;
  }
}
