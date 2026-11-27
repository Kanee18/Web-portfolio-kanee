import * as THREE from 'three';

/**
 * A distant star rendered as a camera-facing billboard: hot core, corona,
 * anamorphic streak and faint rays. It is depth-tested, so planets eclipse it.
 */
const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;
const fragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  float r = length(p);
  float core = smoothstep(0.06, 0.04, r) * 5.0;
  float corona = exp(-r * 12.0) * 1.6 + exp(-r * 5.5) * 0.18;
  float streak = exp(-abs(p.y) * 110.0) * exp(-abs(p.x) * 2.6) * 0.9;
  float ang = atan(p.y, p.x);
  float rays = pow(abs(sin(ang * 6.0 + uTime * 0.05)), 18.0) * exp(-r * 4.0) * 0.5;
  vec3 col = uColor * (corona + rays) + vec3(1.0, 0.97, 0.92) * core + vec3(0.65, 0.78, 1.0) * streak;
  float a = smoothstep(1.0, 0.7, r);
  gl_FragColor = vec4(col * a * uIntensity, 1.0);
}
`;

export class Sun {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uColor: { value: new THREE.Color('#ffc58a') },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.scale.setScalar(130);
  }
}
