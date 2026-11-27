import { ShaderChunk } from 'three';

/**
 * Shared GLSL, registered as three.js shader chunks so any ShaderMaterial can
 * `#include <cosmos_noise>` etc.
 */

// Hashes without sine (Dave Hoskins, MIT)
const hash = /* glsl */ `
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
`;

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) + fbm helpers
const noise = /* glsl */ `
${hash}
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm2(vec3 p) {
  return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03 + 17.1);
}
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
float fbm5(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * snoise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return s;
}
// ridged multifractal — sharp crests (ice lineae, lava cracks)
float ridged(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { float n = 1.0 - abs(snoise(p)); s += a * n * n; p = p * 2.1 + 3.3; a *= 0.5; }
  return s;
}
`;

// Cellular noise: returns (F1, F2)
const worley = /* glsl */ `
vec2 worley(vec3 p) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(id + g);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
`;

// Ring-system optical density, shared by the ring mesh and the planet (ring shadows)
const ring = /* glsl */ `
float ringDensity(float u) {
  // u: 0 = inner edge, 1 = outer edge
  if (u < 0.0 || u > 1.0) return 0.0;
  float d = 0.55
    + 0.22 * sin(u * 37.0 + 1.3)
    + 0.14 * sin(u * 91.0 + 0.4)
    + 0.10 * sin(u * 211.0 + 2.1)
    + 0.06 * sin(u * 433.0);
  d *= smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.86, u);
  // Cassini-like division and a few gaps
  float g1 = (u - 0.62) / 0.018;
  float g2 = (u - 0.835) / 0.008;
  float g3 = (u - 0.21) / 0.012;
  d *= 1.0 - 0.92 * exp(-g1 * g1);
  d *= 1.0 - 0.55 * exp(-g2 * g2);
  d *= 1.0 - 0.45 * exp(-g3 * g3);
  // brighter B-ring band
  d *= 0.75 + 0.5 * smoothstep(0.28, 0.36, u) * (1.0 - smoothstep(0.58, 0.6, u));
  return clamp(d, 0.0, 1.0);
}
`;

const bump = /* glsl */ `
vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy) {
  vec3 vSigmaX = dFdx(surf_pos);
  vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

ShaderChunk.cosmos_hash = hash;
ShaderChunk.cosmos_noise = noise;
ShaderChunk.cosmos_worley = worley;
ShaderChunk.cosmos_ring = ring;
ShaderChunk.cosmos_bump = bump;
