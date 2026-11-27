import * as THREE from 'three';
import { bakeCube, bakeHelpers } from '../bake.js';

/**
 * One procedural world per project, orbiting the gas giant on a polar orbit.
 *
 * HD surfaces: each world is baked once into a cube map — albedo in RGB,
 * relief height in A — with 6–9 octaves of noise, voronoi plates, lineae and
 * crater fields. At runtime the relief becomes per-pixel normals (finite
 * differences of the bake along the tangent frame), so close-ups stay crisp.
 *
 *   lava  — cooled basalt plates, glowing fissures (emission derived from relief)
 *   ice   — fractured shell with ridged lineae and fresh craters
 *   terra — oceans, continents with ranges, ice caps, drifting cloud deck
 *   gas   — banded dwarf with flowing jets and a bright vortex
 *
 * Entrance: worlds are *captured* — each swoops in from deep space along a
 * curved path, decelerating into its orbital slot and growing naturally with
 * perspective. No popping, no fade from black.
 */

/* ── bake shaders ──────────────────────────────────────────────────────── */
const bakeCommon = /* glsl */ `
varying vec3 vDir;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uSeed;
#include <cosmos_noise>
${bakeHelpers}

// crater relief: bowls below 0, raised rims; density = share of cells holding a crater
float craters(vec3 p, float scale, float density) {
  vec3 q = p * scale;
  vec3 id = floor(q);
  vec3 f = fract(q);
  float h = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 rnd = hash33(id + g + uSeed);
    if (rnd.z > density) continue;
    vec3 o = g + rnd - f;
    float r = 0.16 + 0.3 * rnd.x;
    float dd = length(o) / r;
    if (dd < 1.7) {
      float bowl = dd < 1.0 ? (dd * dd - 1.0) : 0.0;
      float rr = (dd - 1.0) / 0.28;
      h += (bowl + exp(-rr * rr) * 0.35) * r;
    }
  }
  return h;
}

// F2 − F1 voronoi edge distance
float voronoiEdge(vec3 p) {
  vec3 id = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(id + g) - f;
    float dd = dot(r, r);
    if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }
  }
  return sqrt(f2) - sqrt(f1);
}
`;

const BAKES = {
  0: /* glsl */ `${bakeCommon}
void main() {
  vec3 d = normalize(vDir);
  float n = fbmN(d * 2.4 + uSeed, uOct);
  float edge = voronoiEdge(d * 3.6 + n * 0.25 + uSeed);
  float fine = voronoiEdge(d * 11.0 + n * 0.4 + uSeed * 2.0);
  float rough = fbmN(d * 24.0 + uSeed, uOct - 3);
  float plate = smoothstep(0.0, 0.07, edge);
  float scorch = 1.0 - smoothstep(0.0, 0.18, edge);
  vec3 col = mix(uC0, uC1, smoothstep(-0.6, 0.8, n)) * 0.55;
  col = mix(col, vec3(0.035, 0.03, 0.03), smoothstep(0.05, 0.6, n) * 0.45);
  col *= 1.0 - scorch * 0.55;
  col *= 0.86 + 0.14 * smoothstep(0.0, 0.05, fine);
  col *= 0.9 + rough * 0.25;
  float h = 0.5 + n * 0.12 + rough * 0.035 - (1.0 - plate) * 0.34 - (1.0 - smoothstep(0.0, 0.04, fine)) * 0.03;
  gl_FragColor = encode(col, clamp(h, 0.0, 1.0));
}`,

  1: /* glsl */ `${bakeCommon}
void main() {
  vec3 d = normalize(vDir);
  float n = fbmN(d * 2.2 + uSeed, uOct);
  float l = ridgedN(d * 3.3 + uSeed, uOct - 2);
  float lineae = smoothstep(0.6, 0.92, l);
  float band = smoothstep(0.45, 0.8, l) * (1.0 - lineae);
  float chaos = smoothstep(0.25, 0.6, fbmN(d * 5.0 + uSeed * 3.0, uOct - 3));
  float cr = craters(d, 7.5, 0.22);
  vec3 col = mix(uC2, uC3, smoothstep(-0.5, 0.7, n)) * 0.72;
  // Europa-like lineae: dark rust-brown bands flanking bright central ridges
  col = mix(col, vec3(0.26, 0.15, 0.09), band * 0.62);
  col = mix(col, uC3 * 0.85, lineae * 0.55);
  col = mix(col, vec3(0.3, 0.2, 0.14), chaos * 0.4);
  col += vec3(0.06) * smoothstep(0.0, 0.06, cr);
  float h = 0.5 + n * 0.06 + lineae * 0.1 - band * 0.03 + cr * 0.45 - chaos * 0.03;
  gl_FragColor = encode(col, clamp(h, 0.0, 1.0));
}`,

  2: /* glsl */ `${bakeCommon}
void main() {
  vec3 d = normalize(vDir);
  float n = fbmN(d * 1.9 + uSeed, uOct) + 0.12 * ridgedN(d * 3.0 + uSeed, uOct - 3) - 0.06;
  float land = smoothstep(0.015, 0.045, n);
  float mtn = ridgedN(d * 4.2 + uSeed * 1.7, uOct - 2) * smoothstep(0.05, 0.3, n);
  float lat = abs(d.y);
  float moist = fbmN(d * 3.0 + uSeed * 5.0, uOct - 3);
  vec3 deep = uC0, shallow = uC1 * 1.25;
  vec3 ocean = mix(deep, shallow, smoothstep(-0.35, 0.02, n));
  vec3 forest = uC2 * 0.75;
  vec3 desert = mix(uC3, vec3(0.35, 0.22, 0.1), 0.5);
  vec3 ground = mix(desert, forest, smoothstep(-0.15, 0.25, moist + (0.5 - lat) * 0.3));
  ground = mix(ground, vec3(0.16, 0.14, 0.12), smoothstep(0.35, 0.75, mtn));
  vec3 col = mix(ocean, ground, land);
  float snow = smoothstep(0.87, 0.94, lat + n * 0.08) + smoothstep(0.7, 0.95, mtn) * land * 0.8;
  col = mix(col, vec3(0.58, 0.62, 0.68), clamp(snow, 0.0, 1.0));
  float h = mix(0.5, 0.53 + n * 0.12 + mtn * 0.22, land);
  gl_FragColor = encode(col, clamp(h, 0.0, 1.0));
}`,

  3: /* glsl */ `${bakeCommon}
void main() {
  vec3 d = normalize(vDir);
  vec3 vc = normalize(vec3(-0.5, 0.25, 0.83));
  vec3 p = swirl(d, vc, 0.14, 2.2);
  vec3 w = vec3(fbmN(p * 2.0 + uSeed, uOct - 3), fbmN(p * 2.0 + uSeed + 5.0, uOct - 3), 0.0);
  float streak = fbmN(vec3(p.x * 3.0, p.y * 22.0, p.z * 3.0) + w * 1.5, uOct);
  float fine = fbmN(vec3(p.x * 10.0, p.y * 80.0, p.z * 10.0) + streak * 2.0, uOct - 2);
  float y = p.y + w.x * 0.03 + streak * 0.014;
  float b = sin(y * 17.0 + 0.4) * 0.45 + sin(y * 39.0 + w.y) * 0.3 + sin(y * 83.0) * 0.15 + sin(y * 151.0 + 1.3) * 0.08;
  vec3 col = mix(uC0, uC1, smoothstep(-0.9, 0.0, b));
  col = mix(col, uC2, smoothstep(-0.1, 0.6, b) * 0.75);
  col = mix(col, uC3, smoothstep(0.6, 0.98, b) * 0.4);
  col *= 1.0 + streak * 0.22 + fine * 0.08;
  float eddy = fbmN(p * 16.0 + w * 3.0, uOct - 2);
  col *= 1.0 + eddy * 0.3 * exp(-b * b * 5.0);
  float vd = length((d - vc) * vec3(1.0, 1.8, 1.0));
  col = mix(col, uC3 * 0.8, smoothstep(0.13, 0.0, vd) * 0.6);
  // a touch of desaturation reads as atmosphere rather than paint
  col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))), 0.22);
  gl_FragColor = encode(col, 0.5);
}`,
};

/* ── runtime shaders ───────────────────────────────────────────────────── */
const vertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vPosW;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform samplerCube uSurface;
uniform highp sampler3D uNoise;
uniform mat3 uObjToWorld;
uniform float uTime;
uniform float uSeed;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uSunDir;
uniform float uActive;
uniform float uBump;
uniform float uEps;
varying vec3 vObj;
varying vec3 vPosW;

float tnoise(vec3 p) { return (texture(uNoise, p * 0.125).r - 0.5) * 2.1; }

vec3 rotY(vec3 d, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}

void main() {
  vec3 d = normalize(vObj);
#if TYPE == 3
  float jet = sin(d.y * 12.0) * 0.6 + 0.3;
  vec3 sd = rotY(d, uTime * 0.01 * jet);
#else
  vec3 sd = d;
#endif
  vec4 s = textureCube(uSurface, sd);
  vec3 albedo = s.rgb * s.rgb;
  float h0 = s.a;

  // relief → normal (object space), then to world
  vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(up, d));
  vec3 t2 = cross(d, t1);
  float h1 = textureCube(uSurface, normalize(sd + t1 * uEps)).a;
  float h2 = textureCube(uSurface, normalize(sd + t2 * uEps)).a;
  vec3 nObj = normalize(d - (t1 * (h1 - h0) + t2 * (h2 - h0)) * (uBump / uEps));
  vec3 N = normalize(uObjToWorld * nObj);
  vec3 Ng = normalize(uObjToWorld * d);

  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);
  // the geometric terminator stays soft; relief only shapes the lit side
  float diff = clamp(ndl, 0.0, 1.0) * smoothstep(-0.12, 0.25, dot(Ng, L));
  vec3 H = normalize(L + V);
  float spec = 0.0;
#if TYPE == 1
  spec = pow(max(dot(N, H), 0.0), 90.0) * 0.18;
#elif TYPE == 2
  spec = pow(max(dot(N, H), 0.0), 220.0) * 0.5 * step(h0, 0.5005);
#elif TYPE == 0
  spec = pow(max(dot(N, H), 0.0), 60.0) * 0.06;
#endif
  vec3 lit = albedo * diff * 0.95 + vec3(1.0, 0.96, 0.9) * spec * step(0.0, ndl);
  lit += albedo * 0.008;

#if TYPE == 0
  // molten fissures glow, brighter on the night side
  float fis = smoothstep(0.26, 0.12, h0);
  float pulse = 0.82 + 0.18 * sin(uTime * 1.5 + tnoise(d * 3.0) * 6.0);
  vec3 glow = mix(uC2, uC3, fis * fis) * fis * 1.5 * pulse;
  lit += glow * (0.45 + 0.55 * smoothstep(0.3, -0.3, dot(Ng, L)));
#endif

#if TYPE == 2
  // drifting cloud deck with soft shadows on the ground below
  vec3 cp = rotY(d, uTime * 0.012) * 2.6 + uSeed;
  float c = tnoise(cp) * 0.55 + tnoise(cp * 2.3) * 0.28 + tnoise(cp * 5.1) * 0.12 + tnoise(cp * 11.0) * 0.05;
  float cloud = smoothstep(0.16, 0.55, c);
  vec3 sp2 = rotY(d - L * 0.015, uTime * 0.012) * 2.6 + uSeed;
  float cs = smoothstep(0.16, 0.55, tnoise(sp2) * 0.55 + tnoise(sp2 * 2.3) * 0.28);
  lit *= 1.0 - cs * 0.35 * (1.0 - cloud);
  float cdiff = clamp(dot(Ng, L) * 0.9 + 0.1, 0.0, 1.0) * smoothstep(-0.12, 0.25, dot(Ng, L));
  lit = mix(lit, vec3(0.5, 0.52, 0.56) * cdiff, cloud * 0.8);
#endif

  // atmosphere / selection rim
  float ndv = max(dot(Ng, V), 0.0);
  float fres = pow(1.0 - ndv, 3.4);
  vec3 rimCol = mix(uC2, uC3, 0.5);
  lit += rimCol * fres * smoothstep(-0.35, 0.55, dot(Ng, L)) * (0.16 + uActive * 0.3);
  gl_FragColor = vec4(lit, 1.0);
}
`;

const TYPES = { lava: 0, ice: 1, terra: 2, gas: 3 };
const BUMP = { 0: 0.045, 1: 0.03, 2: 0.035, 3: 0.0 };

export class Moons {
  constructor(projects, { segments = 160, bakeSize = 512, noise = null } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'moons';
    this.orbit = new THREE.Group();
    this.group.add(this.orbit);

    this.count = projects.length;
    this.radius = 11;
    this.spacing = (Math.PI * 2) / Math.max(projects.length, 3);
    this.items = [];
    this.bakeSize = bakeSize;
    this.sunDir = new THREE.Vector3(-0.6, 0.35, 0.72).normalize();
    this.front = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.side = new THREE.Vector3(1, 0, 0);

    const geo = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.66));
    projects.forEach((p, i) => {
      const pal = (p.palette || ['#111', '#444', '#999', '#eee']).map((c) => new THREE.Color(c));
      const type = TYPES[p.world] ?? 0;
      const uniforms = {
        uSurface: { value: null },
        uNoise: { value: noise },
        uObjToWorld: { value: new THREE.Matrix3() },
        uTime: { value: 0 },
        uSeed: { value: i * 3.17 + 1.3 },
        uC2: { value: pal[2] },
        uC3: { value: pal[3] },
        uSunDir: { value: this.sunDir },
        uActive: { value: i === 0 ? 1 : 0 },
        uBump: { value: BUMP[type] },
        uEps: { value: 2.2 / bakeSize },
      };
      const mesh = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, defines: { TYPE: type } })
      );
      const size = [2.2, 1.95, 2.1, 2.3][i % 4];
      mesh.scale.setScalar(size);
      mesh.rotation.order = 'ZXY';
      mesh.rotation.set(0.3 * i, i * 1.3, 0.2);
      mesh.userData = { size, uniforms, type, palette: pal, seed: uniforms.uSeed.value };
      this.orbit.add(mesh);
      this.items.push(mesh);
    });

    this.state = { orbit: 0, reveal: 0 };
    this.focusWorld = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Vector3();
  }

  /** Bake every world's HD surface (once, during loading). */
  bake(renderer) {
    this.items.forEach((m) => {
      const { type, palette, seed } = m.userData;
      const rt = bakeCube(renderer, {
        size: this.bakeSize,
        fragment: BAKES[type],
        uniforms: {
          uOct: { value: 9 },
          uSeed: { value: seed },
          uC0: { value: palette[0] },
          uC1: { value: palette[1] },
          uC2: { value: palette[2] },
          uC3: { value: palette[3] },
        },
      });
      m.userData.uniforms.uSurface.value = rt.texture;
    });
  }

  /** Orient the orbital plane: `front` points from the planet toward the viewer. */
  setBasis(front, up) {
    this.front.copy(front).normalize();
    this.up.copy(up).projectOnPlane(this.front).normalize();
    this.side.crossVectors(this.up, this.front).normalize();
  }

  computeFocus() {
    this.group.updateMatrixWorld(true);
    this.focusWorld.copy(this.front).multiplyScalar(this.radius).add(this.group.position);
    return this.focusWorld;
  }

  update(time) {
    const { reveal, orbit } = this.state;
    this.group.updateMatrixWorld();
    this.items.forEach((m, i) => {
      // orbital slot — θ = 0 in front of the giant; +θ above; ±π hidden behind it
      const a = (i - orbit) * this.spacing;
      const slot = this._p
        .copy(this.front)
        .multiplyScalar(Math.cos(a) * this.radius)
        .addScaledVector(this.up, Math.sin(a) * this.radius);

      // capture from deep space: quadratic Bézier, decelerating into the slot
      const t = THREE.MathUtils.clamp((reveal - i * 0.11) / 0.67, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const sideSign = i % 2 ? -1 : 1;
      const start = this._s
        .copy(this.up)
        .multiplyScalar(80 + i * 22)
        .addScaledVector(this.side, sideSign * (45 + i * 12))
        .addScaledVector(this.front, -210);
      const ctrl = this._c
        .copy(this.up)
        .multiplyScalar(26 + i * 6)
        .addScaledVector(this.side, sideSign * 30)
        .addScaledVector(this.front, -30)
        .add(slot);
      const u = 1 - e;
      m.position.set(0, 0, 0).addScaledVector(start, u * u).addScaledVector(ctrl, 2 * u * e).addScaledVector(slot, e * e);

      m.visible = t > 0;
      m.rotation.y = time * (0.08 + i * 0.015) + i * 1.3 + (1 - e) * 4.0;
      const d = Math.abs(i - orbit);
      const active = Math.max(0, 1 - d * 1.6) * e;
      const un = m.userData.uniforms;
      un.uActive.value = active;
      un.uTime.value = time;
      m.scale.setScalar(m.userData.size * (0.82 + 0.18 * active));
      m.updateMatrixWorld();
      un.uObjToWorld.value.setFromMatrix4(m.matrixWorld);
    });
  }
}
