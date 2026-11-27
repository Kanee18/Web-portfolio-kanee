import * as THREE from 'three';

/**
 * Instanced "thick line" stars filling the whole flight corridor.
 * Each star is a screen-space capsule from its current position to where it
 * was `uTrail` seconds ago (camera-relative) — so when the camera moves fast,
 * stars stretch into hyperspace streaks that are exactly synced to scroll speed.
 */

const vertex = /* glsl */ `
uniform vec2 uResolution;
uniform vec3 uVelView;
uniform float uTrail;
uniform float uTime;
uniform float uOpacity;
uniform float uPixelRatio;
uniform float uFadeCenter; // fade stars near a screen-space point (black hole)
uniform vec2 uFadePoint;
uniform float uFadeRadius;

attribute vec2 corner;
attribute vec4 aStar;   // xyz + size
attribute vec4 aColor;  // rgb + twinkle phase

varying vec2 vLocal;
varying float vLen;
varying float vHalfW;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 headV = viewMatrix * vec4(aStar.xyz, 1.0);
  if (headV.z > -0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec3 tailV = headV.xyz + uVelView * uTrail;
  tailV.z = min(tailV.z, -0.6);

  vec4 headC = projectionMatrix * headV;
  vec4 tailC = projectionMatrix * vec4(tailV, 1.0);
  vec2 headS = (headC.xy / headC.w * 0.5 + 0.5) * uResolution;
  vec2 tailS = (tailC.xy / tailC.w * 0.5 + 0.5) * uResolution;

  vec2 dir = tailS - headS;
  float len = length(dir);
  vec2 d = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  len = min(len, uResolution.y * 0.7);
  vec2 n = vec2(-d.y, d.x);

  float dist = -headV.z;
  float w = clamp(aStar.w * uPixelRatio * (42.0 / dist), 1.0 * uPixelRatio, 3.6 * uPixelRatio);
  float halfW = w * 0.5 + 1.0;

  float along = mix(-halfW, len + halfW, corner.y);
  float across = corner.x * halfW;
  vec2 pS = headS + d * along + n * across;
  vec2 ndc = pS / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc, headC.z / headC.w, 1.0);

  vLocal = vec2(along, across);
  vLen = len;
  vHalfW = w * 0.5;

  float tw = 0.72 + 0.28 * sin(uTime * (0.6 + aColor.w * 2.4) + aColor.w * 40.0);
  float fadeNear = smoothstep(0.6, 6.0, dist);
  float fadeFar = 1.0 - smoothstep(520.0, 900.0, dist);
  float spread = mix(1.0, 0.35, smoothstep(0.0, 120.0, len));
  float fadeBH = 1.0;
  if (uFadeCenter > 0.0) {
    float k = length((headS - uFadePoint) / uResolution.y);
    fadeBH = mix(1.0, smoothstep(uFadeRadius * 0.6, uFadeRadius * 1.6, k), uFadeCenter);
  }
  vAlpha = tw * fadeNear * fadeFar * spread * uOpacity * fadeBH;
  // tiny far stars: shrink alpha instead of width to avoid shimmering
  vAlpha *= clamp(aStar.w * (42.0 / dist), 0.2, 1.0);
  vColor = aColor.rgb;
}
`;

const fragment = /* glsl */ `
varying vec2 vLocal;
varying float vLen;
varying float vHalfW;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float u = vLocal.x;
  float v = vLocal.y;
  float du = max(max(-u, u - vLen), 0.0);
  float dd = length(vec2(du, v)) / max(vHalfW, 0.5);
  float core = exp(-dd * dd * 2.6);
  float tail = vLen > 1.0 ? 1.0 - clamp(u / vLen, 0.0, 1.0) * 0.82 : 1.0;
  float a = core * tail * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class Starfield {
  constructor({ count = 7000, pixelRatio = 1 } = {}) {
    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute(
      'corner',
      new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2)
    );
    base.setIndex([0, 1, 2, 2, 1, 3]);
    // three requires a position attribute for draw-range computation
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));

    const star = new Float32Array(count * 4);
    const col = new Float32Array(count * 4);
    const palette = ['#9cc3ff', '#cfe0ff', '#ffffff', '#fff2dc', '#ffd6a3', '#ffb37a'].map((c) => new THREE.Color(c));
    let s = 7;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      // a long box around the flight corridor (z from +120 to −1250)
      const z = 120 - rand() * 1370;
      const ang = rand() * Math.PI * 2;
      const rad = 4 + Math.pow(rand(), 0.7) * 260;
      star[i * 4] = Math.cos(ang) * rad;
      star[i * 4 + 1] = Math.sin(ang) * rad * 0.7;
      star[i * 4 + 2] = z;
      star[i * 4 + 3] = 0.5 + Math.pow(rand(), 4.0) * 2.2;
      const c = palette[Math.floor(Math.pow(rand(), 1.4) * palette.length)];
      const b = 0.22 + Math.pow(rand(), 2.5) * 1.15;
      col[i * 4] = c.r * b;
      col[i * 4 + 1] = c.g * b;
      col[i * 4 + 2] = c.b * b;
      col[i * 4 + 3] = rand();
    }
    base.setAttribute('aStar', new THREE.InstancedBufferAttribute(star, 4));
    base.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
    base.instanceCount = count;

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uVelView: { value: new THREE.Vector3() },
      uTrail: { value: 0.045 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPixelRatio: { value: pixelRatio },
      uFadeCenter: { value: 0 },
      uFadePoint: { value: new THREE.Vector2() },
      uFadeRadius: { value: 0.2 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, // screen-space quads: winding depends on streak direction
    });
    this.mesh = new THREE.Mesh(base, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  setSize(w, h, pr) {
    this.uniforms.uResolution.value.set(w * pr, h * pr);
    this.uniforms.uPixelRatio.value = pr;
  }
}
