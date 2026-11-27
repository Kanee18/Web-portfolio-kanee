import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/**
 * Renders the scene into a multisampled HDR target (WebGL2 MSAA), then copies
 * the resolved image into the composer chain. Only the scene pays for MSAA —
 * bloom and the finishing passes stay single-sampled — so planet limbs, ring
 * edges and rock silhouettes get clean edges at a modest cost.
 */
export class MSAARenderPass extends Pass {
  constructor(scene, camera, samples = 4) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples });
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  setSize(w, h) {
    this.target.setSize(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.quad.material.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.quad.dispose();
  }
}
