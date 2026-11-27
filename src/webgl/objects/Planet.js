import * as THREE from 'three';
import { bakeCube, bakeHelpers } from '../bake.js';

/**
 * Ringed gas giant — HD edition.
 *  • Surface baked once into a cube map (1024² × 6): jet bands with irregular
 *    widths, longitude-stretched turbulence, eddies along belt edges, a great
 *    oval storm and a string of white ovals. At runtime the bake is sampled
 *    through a latitude-dependent rotation → differential zonal flow.
 *  • Rings from a 4096-px radial profile (C ring, B ring, Cassini division, A
 *    ring with Encke/Keeler gaps, F ring, fine ringlets). Slant-path opacity,
 *    lit-face reflection vs. unlit-face transmission, forward scattering.
 *  • Ring shadows on the planet, planet shadow on the rings, ring-shine on the
 *    night side, impact-parameter atmosphere with an eclipse halo.
 */

/* ── baked surface ─────────────────────────────────────────────────────── */
const surfaceFragment = /* glsl */ `
varying vec3 vDir;
#include <cosmos_noise>
${bakeHelpers}

float bandSignal(float y) {
  float b = sin(y * 10.5 + 0.6) * 0.5 + sin(y * 22.0 + 1.9) * 0.26 + sin(y * 39.0 + 0.3) * 0.13 + sin(y * 71.0 + 2.2) * 0.07;
  b += snoise(vec3(y * 7.0, 3.1, 1.7)) * 0.3 + snoise(vec3(y * 23.0, 9.1, 4.2)) * 0.1;
  return b;
}

const vec3 GREAT_OVAL = vec3(0.6146, -0.3768, 0.6929);

void main() {
  vec3 d = normalize(vDir);
  vec3 p = swirl(d, GREAT_OVAL, 0.17, 2.4);
  for (int i = 0; i < 7; i++) {
    float a = float(i) * 0.897 + 0.4;
    vec3 c = normalize(vec3(cos(a) * 0.83, 0.56, sin(a) * 0.83));
    p = swirl(p, c, 0.05, -2.6);
  }
  vec3 w = vec3(fbmN(p * 2.2, uOct - 3), fbmN(p * 2.2 + 7.3, uOct - 3), 0.0);
  float y = p.y + w.x * 0.028;
  float streak = fbmN(vec3(p.x * 2.6, y * 15.0, p.z * 2.6) + w * 1.4, uOct);
  float fine = fbmN(vec3(p.x * 9.0, y * 72.0, p.z * 9.0) + streak * 2.0, uOct - 2);
  float b = bandSignal(y + streak * 0.012);

  vec3 zone = vec3(0.86, 0.78, 0.63);
  vec3 belt = vec3(0.62, 0.46, 0.31);
  vec3 deep = vec3(0.40, 0.27, 0.17);
  vec3 col = mix(belt, zone, smoothstep(-0.3, 0.32, b));
  col = mix(col, deep, smoothstep(0.45, 1.05, -b) * 0.65);
  col = mix(col, vec3(0.93, 0.84, 0.62), exp(-y * y * 90.0) * 0.45);
  col = mix(col, vec3(0.5, 0.54, 0.58), smoothstep(0.62, 0.92, abs(y)) * 0.7);
  col *= 1.0 + streak * 0.16 + fine * 0.075;

  float edge = exp(-b * b * 6.0);
  float eddy = fbmN(p * 14.0 + w * 3.0, uOct - 2);
  col *= 1.0 + eddy * 0.26 * edge;

  vec3 q = (d - GREAT_OVAL) * vec3(1.0, 1.7, 1.0);
  float gd = length(q);
  float ring = smoothstep(0.17, 0.1, gd);
  col = mix(col, vec3(0.70, 0.40, 0.24), ring * 0.72);
  col = mix(col, vec3(0.88, 0.74, 0.55) * (1.0 + eddy * 0.2), smoothstep(0.085, 0.0, gd) * 0.65);

  for (int i = 0; i < 7; i++) {
    float a = float(i) * 0.897 + 0.4;
    vec3 c = normalize(vec3(cos(a) * 0.83, 0.56, sin(a) * 0.83));
    float od = length((d - c) * vec3(1.0, 1.5, 1.0));
    col = mix(col, vec3(0.9, 0.86, 0.8), smoothstep(0.04, 0.012, od) * 0.55);
  }
  // the palette above is authored in display (sRGB) values → convert to linear light
  col = pow(max(col, vec3(0.0)), vec3(2.2));
  gl_FragColor = encode(col, 1.0);
}
`;

/* ── ring profile (radial texture, built on the CPU) ─────────────────── */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRingTexture(size = 4096) {
  const data = new Uint8Array(size * 4);
  const rand = mulberry32(77);
  const waves = Array.from({ length: 56 }, () => [30 + rand() * 1400, rand() * Math.PI * 2, 0.015 + rand() * 0.06]);
  const tintWaves = Array.from({ length: 12 }, () => [5 + rand() * 60, rand() * Math.PI * 2, 0.05 + rand() * 0.1]);
  const g = (u, c, w) => Math.exp(-(((u - c) / w) ** 2));
  const ss = (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < size; i++) {
    const u = i / (size - 1);
    let tau;
    let tint;
    if (u < 0.21) {
      tau = 0.1 + 0.14 * (u / 0.21); // C ring: faint, grey
      tint = 0.15;
    } else if (u < 0.25) {
      tau = 0.24 + ss(0.21, 0.25, u) * 0.58;
      tint = 0.15 + ss(0.21, 0.25, u) * 0.85;
    } else if (u < 0.6) {
      tau = 0.82 + 0.1 * Math.sin(u * 47.0) + 0.06 * Math.sin(u * 131.0); // B ring: dense, cream
      tint = 1;
    } else if (u < 0.648) {
      tau = 0.05 + 0.03 * Math.sin(u * 900); // Cassini division
      tint = 0.3;
    } else if (u < 0.955) {
      tau = 0.5 + 0.12 * Math.sin(u * 60.0 + 1.0); // A ring
      tint = 0.72;
    } else {
      tau = 0.02;
      tint = 0.5;
    }
    let f = 0;
    for (const [fr, ph, amp] of waves) f += Math.sin(u * fr + ph) * amp;
    tau *= 1 + f;
    tau *= 1 - 0.96 * g(u, 0.905, 0.0035); // Encke gap
    tau *= 1 - 0.85 * g(u, 0.945, 0.0018); // Keeler gap
    tau += 0.55 * g(u, 0.985, 0.0025); // F ring
    tau *= ss(0.0, 0.015, u) * (1 - ss(0.993, 1.0, u));
    let bright = 0.5;
    for (const [fr, ph, amp] of tintWaves) bright += Math.sin(u * fr + ph) * amp;
    data[i * 4] = Math.round(Math.min(Math.max(tau, 0), 1) * 255);
    data[i * 4 + 1] = Math.round(Math.min(Math.max(bright, 0), 1) * 255);
    data[i * 4 + 2] = Math.round(Math.min(Math.max(tint, 0), 1) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/* ── runtime shaders ───────────────────────────────────────────────────── */
const planetVertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vPosW;
varying vec3 vNormalW;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ringOpticalDepth = /* glsl */ `
float ringTau(float r) {
  float u = (r - uRingInner) / (uRingOuter - uRingInner);
  if (u < 0.0 || u > 1.0) return 0.0;
  return texture2D(uRingTex, vec2(u, 0.5)).r;
}
`;

const planetFragment = /* glsl */ `
uniform samplerCube uSurface;
uniform sampler2D uRingTex;
uniform float uTime;
uniform float uFlow;
uniform vec3 uSunDir;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uExposure;
uniform float uFade;
varying vec3 vObj;
varying vec3 vPosW;
varying vec3 vNormalW;

${ringOpticalDepth}

vec3 flowDir(vec3 d) {
  float jet = sin(d.y * 13.0) * 0.6 + sin(d.y * 4.0 + 0.5) * 0.25 + 0.3;
  float a = uTime * uFlow * jet;
  float c = cos(a), s = sin(a);
  return vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}

void main() {
  vec3 d = normalize(vObj);
  vec3 albedo = textureCube(uSurface, flowDir(d)).rgb;
  albedo *= albedo;

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);
  float ndv = max(dot(N, V), 0.0);

  // ring shadow: follow the ray to the sun into the ring plane
  float shadow = 1.0;
  float denom = dot(L, uRingNormal);
  if (abs(denom) > 1e-4) {
    float t = dot(uCenter - vPosW, uRingNormal) / denom;
    if (t > 0.0) {
      float tau = ringTau(distance(vPosW + L * t, uCenter));
      shadow = 1.0 - (1.0 - exp(-tau * 2.6 / max(abs(denom), 0.06))) * 0.88;
    }
  }

  // soft terminator + gentle limb darkening; haze desaturates the limb
  float diff = smoothstep(-0.1, 0.9, ndl);
  vec3 lit = albedo * diff * shadow;
  lit *= 0.42 + 0.58 * pow(ndv, 0.45);
  float limb = pow(1.0 - ndv, 2.5);
  lit = mix(lit, vec3(dot(lit, vec3(0.3, 0.55, 0.15))) * vec3(1.05, 0.98, 0.9), limb * 0.45);
  lit += vec3(0.95, 0.74, 0.52) * pow(1.0 - ndv, 3.0) * smoothstep(-0.25, 0.6, ndl) * 0.32;
  float tz = ndl / 0.15;
  lit += vec3(0.6, 0.22, 0.08) * exp(-tz * tz) * 0.06 * albedo;

  // ring-shine: sunlight reflected off the lit ring face onto the night side
  float litFace = sign(dot(L, uRingNormal));
  float shine = max(dot(N, uRingNormal * litFace), 0.0) * (1.0 - diff) * abs(denom);
  lit += albedo * shine * 0.06;

  // uFade: the giant emerges out of the distance instead of popping in
  gl_FragColor = vec4(lit * uExposure, uFade);
}
`;

const atmoVertex = /* glsl */ `
varying vec3 vPosW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const atmoFragment = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform float uAtmo;
uniform vec3 uSunDir;
uniform vec3 uColorDay;
uniform vec3 uColorRim;
uniform float uIntensity;
uniform float uFade;
varying vec3 vPosW;
void main() {
  vec3 rd = normalize(vPosW - cameraPosition);
  vec3 oc = uCenter - cameraPosition;
  float tca = dot(oc, rd);
  vec3 closest = cameraPosition + rd * tca;
  float h = distance(closest, uCenter);
  float x = clamp((h - uRadius) / (uAtmo - uRadius), 0.0, 1.0);
  if (h < uRadius * 0.995) discard;
  float dens = exp(-x * 5.5) * (1.0 - x);
  float chord = sqrt(max(uAtmo * uAtmo - h * h, 0.0)) / uAtmo;
  vec3 n = normalize(closest - uCenter);
  vec3 L = normalize(uSunDir);
  float day = smoothstep(-0.35, 0.55, dot(n, L));
  float cosF = max(dot(rd, L), 0.0);
  float forward = pow(cosF, 24.0) * 4.0 + pow(cosF, 6.0) * 0.6;
  vec3 col = uColorDay * day * 0.55 + uColorRim * forward;
  float limb = exp(-x * 14.0);
  gl_FragColor = vec4(col * (dens * chord * 0.6 + limb * 0.5) * uIntensity * uFade, 1.0);
}
`;

const ringVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vPosW;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ringFragment = /* glsl */ `
uniform sampler2D uRingTex;
uniform float uInner;
uniform float uOuter;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uSunDir;
uniform vec3 uNormal;
uniform float uOpacity;
uniform float uExposure;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vPosW;

#include <cosmos_hash>

void main() {
  float r = length(vLocal.xy);
  float u = (r - uInner) / (uOuter - uInner);
  if (u < 0.0 || u > 1.0) discard;
  vec4 rt = texture2D(uRingTex, vec2(u, 0.5));
  float tau = rt.r;
  if (tau < 0.004) discard;

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vPosW);
  float lN = dot(L, uNormal);
  float vN = dot(V, uNormal);
  float muL = abs(lN);
  float muV = max(abs(vN), 0.025);

  // slant-path opacity: rings get more opaque at grazing angles, like the real thing
  float opacity = 1.0 - exp(-tau * 2.2 / muV);

  // lit face reflects; the unlit face transmits (sparse rings glow, dense rings go dark)
  float refl = muL * (0.32 + 0.68 * tau);
  float trans = muL * tau * (1.0 - tau) * 2.6;
  float lit = lN * vN > 0.0 ? refl : trans;
  float phase = max(dot(-V, L), 0.0);
  lit += pow(phase, 14.0) * (1.0 - tau) * 1.6; // forward-scattering dust

  // planet shadow with a soft penumbra
  vec3 oc = uCenter - vPosW;
  float tca = dot(oc, L);
  float sh = 1.0;
  if (tca > 0.0) {
    float d2 = dot(oc, oc) - tca * tca;
    sh = smoothstep(uRadius * uRadius * 0.9, uRadius * uRadius * 1.06, d2);
  }

  // azimuthal clumping (self-gravity wakes) — subtle
  float ang = atan(vLocal.y, vLocal.x);
  float wake = 0.93 + 0.07 * hash12(vec2(floor(ang * 900.0), floor(u * 500.0)));

  vec3 grey = vec3(0.58, 0.57, 0.55);
  vec3 cream = vec3(0.86, 0.77, 0.62);
  vec3 tint = mix(grey, cream, rt.b) * (0.6 + 0.8 * rt.g);
  vec3 col = tint * lit * sh * wake;
  gl_FragColor = vec4(col * uExposure, opacity * uOpacity);
}
`;

export class Planet {
  constructor({ radius = 6, segments = 256, bakeSize = 1024 } = {}) {
    this.radius = radius;
    this.bakeSize = bakeSize;
    this.group = new THREE.Group();
    this.group.name = 'planet';

    this.tilt = new THREE.Group();
    this.tilt.rotation.set(0.22, 0, 0.42);
    this.group.add(this.tilt);
    this.spin = new THREE.Group();
    this.tilt.add(this.spin);

    const sunDir = new THREE.Vector3(-0.7, 0.3, 0.6).normalize();
    this.sunDir = sunDir;
    this.center = new THREE.Vector3();
    this.ringNormal = new THREE.Vector3(0, 1, 0);
    const inner = radius * 1.3;
    const outer = radius * 2.32;
    this.ringTex = makeRingTexture();

    this.uniforms = {
      uSurface: { value: null },
      uRingTex: { value: this.ringTex },
      uTime: { value: 0 },
      uFlow: { value: 0.006 },
      uSunDir: { value: sunDir },
      uCenter: { value: this.center },
      uRadius: { value: radius },
      uRingNormal: { value: this.ringNormal },
      uRingInner: { value: inner },
      uRingOuter: { value: outer },
      uExposure: { value: 0.85 },
      uFade: { value: 1 },
    };
    this.body = new THREE.Mesh(
      new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.66)),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: planetVertex,
        fragmentShader: planetFragment,
        transparent: true, // only so it can fade in from the distance
        depthWrite: true,
      })
    );
    this.body.renderOrder = 3;
    this.spin.add(this.body);

    this.atmoUniforms = {
      uCenter: { value: this.center },
      uRadius: { value: radius },
      uAtmo: { value: radius * 1.14 },
      uSunDir: { value: sunDir },
      uColorDay: { value: new THREE.Color('#f0b27a') },
      uColorRim: { value: new THREE.Color('#ffe2bd') },
      uIntensity: { value: 0.8 },
      uFade: this.uniforms.uFade,
    };
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.14, 128, 80),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: atmoVertex,
        fragmentShader: atmoFragment,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    atmo.renderOrder = 5;
    this.tilt.add(atmo);

    this.ringUniforms = {
      uRingTex: { value: this.ringTex },
      uInner: { value: inner },
      uOuter: { value: outer },
      uCenter: { value: this.center },
      uRadius: { value: radius },
      uSunDir: { value: sunDir },
      uNormal: { value: this.ringNormal },
      uOpacity: { value: 1 },
      uExposure: { value: 0.62 },
      uTime: { value: 0 },
    };
    const rings = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 512, 1),
      new THREE.ShaderMaterial({
        uniforms: this.ringUniforms,
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      })
    );
    rings.rotation.x = -Math.PI / 2;
    rings.renderOrder = 4;
    this.tilt.add(rings);
    this.rings = rings;
  }

  /** Bake the HD surface (call once, during loading). */
  bake(renderer) {
    const rt = bakeCube(renderer, {
      size: this.bakeSize,
      fragment: surfaceFragment,
      uniforms: { uOct: { value: 8 } },
    });
    this.uniforms.uSurface.value = rt.texture;
    this.surfaceRT = rt;
  }

  setFade(f) {
    this.uniforms.uFade.value = f;
    this.ringUniforms.uOpacity.value = f;
  }

  update(time) {
    this.uniforms.uTime.value = time;
    this.ringUniforms.uTime.value = time;
    this.group.updateMatrixWorld();
    this.center.setFromMatrixPosition(this.group.matrixWorld);
    this.ringNormal.set(0, 1, 0).transformDirection(this.tilt.matrixWorld);
  }
}
