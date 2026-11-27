import * as THREE from 'three';
import { createNoiseVolume } from '../noiseTexture.js';

/* ── distant galaxies (directions are in world space; the camera mostly looks down −Z) ──
   type: 0 spiral · 1 elliptical · 2 edge-on.  r: angular radius (deg).  q: axis ratio.
   One spiral sits right behind the black hole so it gets lensed into arcs. */
// placed by (azimuth, elevation) relative to −Z: every view in the journey looks
// within roughly az −27°…+36°, el −25°…+11°
const azEl = (az, el) => {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const GALAXIES = [
  { d: azEl(-22, 5), r: 3.6, q: 0.32, pa: 34, type: 0, b: 0.7, k: 1.9, seed: 1.3 }, // big inclined spiral
  { d: azEl(28, 6), r: 1.6, q: 0.9, pa: 12, type: 0, b: 0.75, k: 2.4, seed: 4.1 }, // face-on spiral
  { d: azEl(20, -18), r: 2.0, q: 0.12, pa: -16, type: 2, b: 0.7, k: 0, seed: 2.2 }, // edge-on, dust lane
  { d: azEl(-12, -20), r: 0.95, q: 0.7, pa: 60, type: 1, b: 0.6, k: 0, seed: 7.7 }, // elliptical
  { d: [0.05, -0.13, -0.99], r: 2.3, q: 0.75, pa: 20, type: 0, b: 1.4, k: 2.1, seed: 3.3 }, // behind the black hole → lensed
  { d: azEl(-30, -8), r: 0.9, q: 0.5, pa: -40, type: 0, b: 0.6, k: 2.0, seed: 5.5 },
  { d: azEl(33, -2), r: 0.8, q: 0.2, pa: 70, type: 2, b: 0.6, k: 0, seed: 6.1 },
  { d: azEl(5, 9), r: 0.6, q: 0.6, pa: 5, type: 1, b: 0.55, k: 0, seed: 8.8 },
  { d: azEl(-8, -5), r: 0.5, q: 0.85, pa: 0, type: 0, b: 0.6, k: 2.6, seed: 9.9 },
  { d: azEl(12, -10), r: 0.45, q: 0.45, pa: 33, type: 0, b: 0.55, k: 2.2, seed: 1.9 },
  { d: azEl(-18, -14), r: 0.4, q: 0.3, pa: -60, type: 2, b: 0.5, k: 0, seed: 4.7 },
  { d: azEl(24, 10), r: 0.42, q: 0.8, pa: 0, type: 1, b: 0.5, k: 0, seed: 6.6 },
  { d: [0.2, 0.9, -0.38], r: 2.6, q: 0.6, pa: 0, type: 0, b: 0.5, k: 2.0, seed: 2.9 },
  { d: [-0.9, -0.3, 0.3], r: 2.0, q: 0.28, pa: 45, type: 2, b: 0.5, k: 0, seed: 3.9 },
];

function galaxyGLSL() {
  const f = (n) => Number(n).toFixed(5);
  const rows = GALAXIES.map((g) => {
    const c = new THREE.Vector3(...g.d).normalize();
    const up = Math.abs(c.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(up, c).normalize();
    const e2 = new THREE.Vector3().crossVectors(c, e1).normalize();
    const R = THREE.MathUtils.degToRad(g.r);
    const pa = THREE.MathUtils.degToRad(g.pa);
    return {
      c: `vec4(${f(c.x)}, ${f(c.y)}, ${f(c.z)}, ${f(Math.cos(R * 2.4))})`,
      e1: `vec4(${f(e1.x)}, ${f(e1.y)}, ${f(e1.z)}, ${f(1 / R)})`,
      e2: `vec4(${f(e2.x)}, ${f(e2.y)}, ${f(e2.z)}, ${f(g.q)})`,
      p: `vec4(${f(Math.cos(pa))}, ${f(Math.sin(pa))}, ${f(g.type)}, ${f(g.b)})`,
      s: `vec2(${f(g.k)}, ${f(g.seed)})`,
    };
  });
  const n = rows.length;
  const arr = (type, key) => `const ${type} GAL_${key.toUpperCase()}[${n}] = ${type}[${n}](${rows.map((r) => r[key]).join(', ')});`;
  return `
#define NGAL ${n}
${arr('vec4', 'c')}
${arr('vec4', 'e1')}
${arr('vec4', 'e2')}
${arr('vec4', 'p')}
${arr('vec2', 's')}

uniform int uGalCount; // uniform bound: keeps the loop rolled (fast compile)
vec3 galaxies(vec3 d) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < uGalCount; i++) {
    vec4 c = GAL_C[i];
    if (dot(d, c.xyz) < c.w) continue;
    vec4 e1 = GAL_E1[i];
    vec4 e2 = GAL_E2[i];
    vec4 pr = GAL_P[i];
    vec2 st = GAL_S[i];
    vec2 xy = vec2(dot(d, e1.xyz), dot(d, e2.xyz)) * e1.w;
    vec2 uv = vec2(pr.x * xy.x + pr.y * xy.y, -pr.y * xy.x + pr.x * xy.y);
    vec3 col;
    if (pr.z < 0.5) {
      // spiral: core, bulge, exponential disk modulated by log-spiral arms, dust, HII knots
      vec2 dv = vec2(uv.x, uv.y / e2.w);
      float r = length(dv);
      float th = atan(dv.y, dv.x);
      float a = th - st.x * log(r + 0.04) + st.y;
      float arm = pow(0.5 + 0.5 * cos(2.0 * a), 3.0);
      float dust = pow(0.5 + 0.5 * cos(2.0 * a + 0.9), 6.0) * smoothstep(0.08, 0.3, r) * 0.6;
      float disk = exp(-r * 2.7) * (0.16 + 1.15 * arm) * (1.0 - dust);
      float knots = step(0.965, hash12(floor(dv * 46.0) + st.y)) * arm * exp(-r * 2.0);
      col = vec3(1.0, 0.84, 0.64) * (exp(-r * r * 220.0) * 2.4 + exp(-r * 10.0) * 0.9)
          + vec3(0.68, 0.79, 1.0) * disk
          + vec3(1.0, 0.45, 0.62) * knots * 0.6;
    } else if (pr.z < 1.5) {
      // elliptical: smooth, warm, de Vaucouleurs-ish
      vec2 dv = vec2(uv.x, uv.y / e2.w);
      float r = length(dv);
      col = vec3(1.0, 0.82, 0.62) * (exp(-r * 7.0) + exp(-r * r * 300.0) * 1.5);
    } else {
      // edge-on: thin disk, round bulge, dark mid-plane dust lane
      float x = uv.x, y = uv.y;
      float t = y / (0.07 * max(e2.w, 0.05) * 6.0);
      float light = exp(-abs(x) * 2.6) * exp(-t * t);
      float bz = (x * x + (y / 0.45) * (y / 0.45)) * 32.0;
      float bulge = exp(-bz);
      float ld = y / 0.012;
      float lane = 1.0 - 0.82 * exp(-ld * ld) * smoothstep(1.3, 0.12, abs(x));
      col = (vec3(0.82, 0.86, 1.0) * light + vec3(1.0, 0.84, 0.64) * bulge * 1.4) * lane;
    }
    acc += col * pr.w;
  }
  return acc * 0.34;
}

// a deep field of tiny, faint galaxies
vec3 deepField(vec3 d) {
  vec3 p = d * 46.0;
  vec3 id = floor(p);
  vec3 h = hash33(id + 31.7);
  if (h.x > 0.05) return vec3(0.0);
  vec3 c = id + 0.3 + 0.4 * hash33(id + 5.1);
  vec3 o = p - c;
  vec3 ax = normalize(hash33(id + 9.3) - 0.5);
  float along = dot(o, ax);
  vec3 perp = o - ax * along;
  float e = 0.3 + 0.55 * h.y;
  float r2 = along * along + dot(perp, perp) / (e * e);
  float size = 0.05 + 0.1 * h.z;
  float s = exp(-r2 / (size * size));
  vec3 col = mix(vec3(1.0, 0.84, 0.68), vec3(0.74, 0.84, 1.0), fract(h.z * 7.0));
  return col * s * (0.035 + 0.09 * h.y);
}
`;
}

/**
 * Procedural sky (nebula + two hashed star layers) and a ray-marched
 * Schwarzschild black hole with a relativistic accretion disk.
 *
 * The black hole lives at a world position, so as the camera flies toward it
 * it grows naturally and lenses the sky behind it. Photon paths are integrated
 * with the Binet-equation force  a = −1.5·h²·x / r⁵  (units of Rs), and the
 * weak-field deflection outside the integration bound is added analytically so
 * there is no visible seam while approaching from far away.
 *
 * Rendered into its own (optionally down-scaled) HDR target, then composited
 * as the scene background.
 */

const vertex = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 view = uInvProj * vec4(position.xy, 1.0, 1.0);
  view.xyz /= view.w;
  vDir = (uCamWorld * vec4(view.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform float uNebula;
uniform vec3 uCamPos;
uniform vec3 uBhPos;
uniform float uBhScale;
uniform mat3 uBhRot;
uniform mat3 uBhRotInv;
uniform float uBhOn;
uniform float uDiskSpeed;
uniform float uDiskGain;
uniform float uSkyGain;
uniform int uSteps; // a uniform bound keeps D3D/FXC from unrolling the march (fast compile)
uniform highp sampler3D uNoise;
varying vec3 vDir;

#include <cosmos_hash>

// texture-backed noise: one fetch per octave (see noiseTexture.js).
// Explicit LOD: no derivatives needed, so it is legal (and fast) inside the
// dynamic ray-march loop.
float snoise(vec3 p) { return (textureLod(uNoise, p * 0.125, 0.0).r - 0.5) * 2.1; }
float fbm2(vec3 p) { return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1); }
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm4(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.01 + 11.7; a *= 0.5; }
  return s;
}

#define DISK_IN 2.6
#define DISK_OUT 13.5
#define BOUND 30.0

/* ── sky ─────────────────────────────────────────────────────────────── */
vec3 starLayer(vec3 d, float scale, float density, float bright) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 h = hash33(id);
  if (h.x > density) return vec3(0.0);
  vec3 c = id + 0.3 + 0.4 * hash33(id + 7.7);
  float dist = length(p - c);
  float s = exp(-dist * dist * 34.0);
  vec3 col = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.82, 1.0), h.y);
  float tw = 0.7 + 0.3 * sin(uTime * (0.4 + h.z * 1.6) + h.y * 50.0);
  return col * s * bright * tw * (0.25 + h.z * h.z * 1.6);
}

vec3 nebula(vec3 d) {
  vec3 bandN = normalize(vec3(0.32, 1.0, 0.16));
  float bz = dot(d, bandN) / 0.34;
  float band = exp(-bz * bz);
  float n1 = fbm4(d * 1.7 + vec3(3.1, 0.0, uTime * 0.0025));
  float n2 = fbm3(d * 3.3 + vec3(13.1, 7.7, 2.3));
  float dens = smoothstep(-0.15, 0.85, n1 + band * 0.55) * (0.28 + 0.72 * band);
  vec3 cViolet = vec3(0.085, 0.045, 0.19);
  vec3 cTeal = vec3(0.012, 0.075, 0.15);
  vec3 cAmber = vec3(0.22, 0.085, 0.03);
  vec3 col = mix(cViolet, cTeal, smoothstep(-0.45, 0.55, n2));
  col = mix(col, cAmber, smoothstep(0.25, 0.85, n1 * 0.8 + n2 * 0.4 + band * 0.25) * 0.85);
  float rift = smoothstep(-0.2, 0.55, fbm2(d * 6.0 + 4.0));
  // a few emission knots
  float knots = pow(max(snoise(d * 9.0 + 1.7), 0.0), 6.0) * band;
  col += vec3(0.5, 0.12, 0.2) * knots * 0.6;
  return col * dens * (0.45 + 0.55 * rift) * uNebula;
}

GALAXY_LAYER

vec3 sky(vec3 d) {
  vec3 col = nebula(d);
  col += galaxies(d);
  col += deepField(d);
  col += starLayer(d, 150.0, 0.075, 0.75);
  col += starLayer(d.yzx, 72.0, 0.05, 1.1);
  col += starLayer(d.zxy, 34.0, 0.03, 1.5);
  return col * uSkyGain;
}

/* ── accretion disk ──────────────────────────────────────────────────── */
vec3 blackbody(float t) {
  vec3 c = mix(vec3(0.9, 0.16, 0.03), vec3(1.0, 0.52, 0.17), smoothstep(0.0, 0.4, t));
  c = mix(c, vec3(1.0, 0.86, 0.66), smoothstep(0.38, 0.78, t));
  c = mix(c, vec3(0.9, 0.94, 1.0), smoothstep(0.86, 1.0, t));
  return c;
}

float diskPattern(float ang, float r, float phase, float seed) {
  // Keplerian shear (ω ∝ r^-1.5), but only for a bounded phase window
  float a = ang + phase * pow(r, -1.5) * 9.0;
  vec2 q = vec2(cos(a), sin(a)) * r;
  float n = fbm3(vec3(q * 0.5, r * 0.32 + seed));
  float fine = fbm2(vec3(q * 2.3, 4.0 + r * 0.2 + seed));
  float rings = 0.5 + 0.5 * sin(r * 6.2 + n * 4.5);
  return clamp(0.3 + 0.95 * n + 0.35 * fine, 0.0, 1.6) * (0.5 + 0.5 * rings);
}

vec4 diskSample(vec3 p, vec3 rayDir) {
  float r = length(p.xz);
  float ang = atan(p.z, p.x);
  // flow-map style cross-fade: two sheared copies, each reset while invisible,
  // so the disk keeps streaming forever without winding into vinyl grooves
  float t = uTime * uDiskSpeed * 0.06;
  float ph1 = fract(t);
  float ph2 = fract(t + 0.5);
  float w1 = 1.0 - abs(ph1 * 2.0 - 1.0);
  float pat = diskPattern(ang, r, ph1 * 4.0, 1.7) * w1 + diskPattern(ang, r, ph2 * 4.0, 5.3) * (1.0 - w1);
  float dens = smoothstep(DISK_IN, DISK_IN + 0.55, r) * (1.0 - smoothstep(DISK_OUT - 6.0, DISK_OUT, r));
  dens *= pat;

  float temp = clamp(pow(DISK_IN / r, 0.95), 0.0, 1.0);
  vec3 col = blackbody(temp) * (0.32 + 1.9 * pow(temp, 2.2));

  // relativistic beaming (softened for art direction) + doppler tint
  vec3 orbit = normalize(vec3(-p.z, 0.0, p.x));
  float v = clamp(sqrt(0.5 / r), 0.0, 0.7);
  float gamma = inversesqrt(1.0 - v * v);
  float D = 1.0 / (gamma * (1.0 - v * dot(orbit, -rayDir)));
  float beam = mix(1.0, pow(D, 2.4), 0.7);
  col *= beam;
  col *= mix(vec3(1.12, 0.78, 0.6), vec3(0.86, 0.96, 1.18), smoothstep(0.65, 1.45, D));
  // gravitational redshift
  col *= sqrt(max(1.0 - 1.0 / r, 0.0));

  float alpha = clamp(dens * 0.92, 0.0, 0.97);
  return vec4(col * alpha * uDiskGain, alpha);
}

vec3 bendToward(vec3 dir, vec3 pos, float amount) {
  vec3 perp = -(pos - dir * dot(pos, dir));
  float l = length(perp);
  if (l < 1e-5) return dir;
  return normalize(dir + perp / l * amount);
}

/*
 * Single exit: sky() is evaluated exactly once per pixel, at the very end.
 * (Shader compilers inline every call site — one call keeps compile time low.)
 * The black hole "materialises" by scaling its gravity, horizon and disk by
 * uBhOn instead of cross-fading two skies.
 */
void main() {
  vec3 rd = normalize(vDir);
  vec3 outDir = rd;
  vec4 acc = vec4(0.0);
  bool captured = false;
  float g = uBhOn; // gravity strength 0..1

  if (g > 0.001) {
    vec3 ro = uBhRot * ((uCamPos - uBhPos) / uBhScale);
    vec3 dir = uBhRot * rd;
    float ro2 = dot(ro, ro);
    float R2 = BOUND * BOUND;
    vec3 pos = ro;
    bool march = true;

    if (ro2 >= R2) {
      float tca = -dot(ro, dir);
      float b0 = length(cross(ro, dir));
      float d2 = b0 * b0;
      if (tca < 0.0 || d2 > R2) {
        // weak-field deflection of the whole straight path: (1/b)(1 + tca/√(b²+tca²))
        float defl = (1.0 / max(b0, 1e-3)) * (1.0 + tca * inversesqrt(b0 * b0 + tca * tca));
        dir = bendToward(dir, ro, defl * g);
        march = false;
      } else {
        // camera-side deflection outside the bound, then jump to the entry point
        float L0 = sqrt(max(R2 - d2, 0.0));
        float nearMiss = (1.0 / max(b0, 1e-3)) * (tca * inversesqrt(b0 * b0 + tca * tca) - L0 / BOUND);
        dir = bendToward(dir, ro, max(nearMiss, 0.0) * g);
        tca = -dot(ro, dir);
        d2 = ro2 - tca * tca;
        pos = ro + dir * max(tca - sqrt(max(R2 - d2, 0.0)), 0.0);
      }
    }

    vec3 vel = dir;
    if (march) {
      vec3 hv = cross(pos, vel);
      float h2 = dot(hv, hv) * g;
      float horizon = g * g;
      for (int i = 0; i < uSteps; i++) {
        float r2 = dot(pos, pos);
        float r = sqrt(r2);
        float dt = clamp(0.075 * r, 0.022, 1.3);
        vec3 prev = pos;
        vel += (-1.5 * h2 * pos / (r2 * r2 * r)) * dt;
        pos += vel * dt;

        if (prev.y * pos.y < 0.0) {
          float k = prev.y / (prev.y - pos.y);
          vec3 hp = mix(prev, pos, k);
          float hr = length(hp.xz);
          if (hr > DISK_IN * 0.92 && hr < DISK_OUT) {
            vec4 ds = diskSample(hp, normalize(vel)) * g;
            acc.rgb += (1.0 - acc.a) * ds.rgb;
            acc.a += (1.0 - acc.a) * ds.a;
          }
        }
        if (r2 < horizon) { captured = true; break; }
        if (r2 > R2 * 1.02 && dot(pos, vel) > 0.0) break;
        if (acc.a > 0.985) break;
      }
      vec3 v = normalize(vel);
      float b1 = length(cross(pos, v));
      float L1 = sqrt(max(R2 - b1 * b1, 0.0));
      float farMiss = (1.0 / max(b1, 1e-3)) * (1.0 - L1 / BOUND);
      vel = bendToward(v, pos, farMiss * g);
    }
    outDir = uBhRotInv * normalize(vel);
  }

  vec3 bg = captured ? vec3(0.0) : sky(outDir);
  gl_FragColor = vec4(acc.rgb + (1.0 - acc.a) * bg, 1.0);
}
`;

const compositeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const compositeFragment = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }
`;

function fullscreenTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export class Sky {
  constructor({ steps = 150, scale = 1 } = {}) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.uniforms = {
      uTime: { value: 0 },
      uNebula: { value: 1 },
      uSkyGain: { value: 1 },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uBhPos: { value: new THREE.Vector3() },
      uBhScale: { value: 2.5 },
      uBhRot: { value: new THREE.Matrix3() },
      uBhRotInv: { value: new THREE.Matrix3() },
      uBhOn: { value: 0 },
      uDiskSpeed: { value: 1 },
      uDiskGain: { value: 1 },
      uSteps: { value: steps },
      uNoise: { value: createNoiseVolume() },
      uGalCount: { value: GALAXIES.length },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment.replace('GALAXY_LAYER', galaxyGLSL()),
      depthTest: false,
      depthWrite: false,
    });
    const geo = fullscreenTriangle();
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // background quad in the main scene that shows the sky target
    this.background = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: this.rt.texture } },
        vertexShader: compositeVertex,
        fragmentShader: compositeFragment,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.background.frustumCulled = false;
    this.background.renderOrder = -1000;

    this._rot = new THREE.Matrix4();
    this.setBlackHoleRotation(new THREE.Euler(0.1, 0, 0.16));
  }

  setBlackHoleRotation(euler) {
    this._rot.makeRotationFromEuler(euler); // local → world
    this.uniforms.uBhRotInv.value.setFromMatrix4(this._rot);
    this.uniforms.uBhRot.value.copy(this.uniforms.uBhRotInv.value).transpose();
  }

  setSize(w, h, pr) {
    const s = this.scale;
    this.rt.setSize(Math.max(2, Math.round(w * pr * s)), Math.max(2, Math.round(h * pr * s)));
  }

  render(renderer, camera, time) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }
}
