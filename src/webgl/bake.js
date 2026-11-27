import * as THREE from 'three';

/**
 * Bake a procedural surface into a cube map — once, at load time.
 *
 * A CubeCamera at the origin renders the inside of a box whose fragment shader
 * evaluates `vec4 surface(vec3 dir)`. Because this uses three.js' own cube
 * conventions, sampling the result with `textureCube(map, dir)` in any shader
 * returns exactly `surface(dir)` — no seams, no hand-written face math.
 *
 * Baking lets us afford 8–10 octaves of noise, domain warping, vortices and
 * hundreds of craters per texel (far beyond a real-time budget), while the
 * runtime shaders only pay for a texture fetch. Colour is stored gamma-2
 * encoded in RGBA8 (decode with c*c) for better precision in the darks.
 */
const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function bakeCube(renderer, { size = 1024, fragment, uniforms = {} }) {
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
  });
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const scene = new THREE.Scene();
  scene.add(box);
  const camera = new THREE.CubeCamera(0.1, 10, rt);
  const prev = renderer.getRenderTarget();
  camera.update(renderer, scene);
  renderer.setRenderTarget(prev);
  box.geometry.dispose();
  material.dispose();
  return rt;
}

/** GLSL helpers shared by the bake shaders (uniform loop bounds → fast compiles). */
export const bakeHelpers = /* glsl */ `
uniform int uOct;
float fbmN(vec3 p, int oct) {
  float a = 0.5, s = 0.0, norm = 0.0;
  for (int i = 0; i < oct; i++) {
    s += a * snoise(p);
    norm += a;
    p = p * 2.03 + vec3(19.1, 7.3, 3.9);
    a *= 0.52;
  }
  return s / norm;
}
float ridgedN(vec3 p, int oct) {
  float a = 0.5, s = 0.0, norm = 0.0;
  for (int i = 0; i < oct; i++) {
    float n = 1.0 - abs(snoise(p));
    s += a * n * n;
    norm += a;
    p = p * 2.07 + vec3(5.3, 11.7, 2.1);
    a *= 0.5;
  }
  return s / norm;
}
mat3 rotAxis(vec3 a, float t) {
  float s = sin(t), c = cos(t), oc = 1.0 - c;
  return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
              oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
              oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
}
// swirl the sphere around a vortex centre c (unit vector)
vec3 swirl(vec3 p, vec3 c, float r, float k) {
  float d = length(p - c);
  float w = exp(-(d * d) / (r * r));
  return rotAxis(c, k * w) * p;
}
vec4 encode(vec3 albedo, float a) { return vec4(sqrt(clamp(albedo, 0.0, 1.0)), a); }
`;
