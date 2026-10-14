/**
 * AU-driven wrinkle normal map controller (Section 4.6).
 * Blends base skin normal map with the wrinkle normal map + procedural micro-furrows
 * per anatomical region driven by live AU weights:
 *   x = forehead (AU1/AU2)
 *   y = glabella (AU4)
 *   z = crow's feet (AU6 — Duchenne marker, strictly 0 in AU12 social smile)
 *   w = nose bridge (AU9)
 */

import * as THREE from 'three';

export class WrinkleController {
  constructor() {
    this.uniforms = {
      uWrinkleNormalMap: { value: null },
      uHasWrinkleMap: { value: 0.0 },
      uWrinkleWeights: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFaceRegions: { value: new THREE.Vector4(1.625, 1.608, 1.592, .046) }
    };
    this.textureLoader = new THREE.TextureLoader();
  }

  async loadWrinkleMap(url) {
    if (!url) {
      this.uniforms.uWrinkleNormalMap.value = null;
      this.uniforms.uHasWrinkleMap.value = 0.0;
      return null;
    }
    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.NoColorSpace;
          tex.flipY = false;
          this.uniforms.uWrinkleNormalMap.value = tex;
          this.uniforms.uHasWrinkleMap.value = 1.0;
          resolve(tex);
        },
        undefined,
        () => {
          this.uniforms.uWrinkleNormalMap.value = null;
          this.uniforms.uHasWrinkleMap.value = 0.0;
          resolve(null);
        }
      );
    });
  }

  setWeights({ forehead = 0, glabella = 0, crowsFeet = 0, nose = 0 } = {}) {
    this.uniforms.uWrinkleWeights.value.set(
      forehead,
      glabella,
      crowsFeet,
      nose
    );
  }

  getWeights() {
    const v = this.uniforms.uWrinkleWeights.value;
    return {
      forehead: v.x,
      glabella: v.y,
      crowsFeet: v.z,
      nose: v.w
    };
  }
}
