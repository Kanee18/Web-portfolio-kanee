import * as THREE from 'three';

/**
 * A procedural barred-spiral galaxy: ~160k GPU particles (bulge, arms, diffuse
 * disk, HII star-forming knots, halo) + a subtractive dust-lane layer.
 *
 *  • Differential rotation (inner regions orbit faster) in the vertex shader
 *  • "Big bang" formation driven by uIntro (GSAP tween in the opening sequence)
 *  • Cursor gravity well: particles near the pointer swirl & lift
 */

const sharedVertex = /* glsl */ `
uniform float uTime;
uniform float uIntro;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uMouse;
uniform float uMouseStrength;
uniform float uOpacity;

attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;

varying vec3 vColor;
varying float vAlpha;
varying float vSeed;

mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
float easeOutExpo(float x) { return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * x); }

vec3 galaxyPosition(out float formed) {
  vec3 p = position;
  float r = length(p.xz);

  // differential rotation — inner orbits are faster (flat-ish rotation curve)
  float ang = uTime * (0.028 + 0.11 / (1.0 + r * 0.55));
  p.xz = rot2(ang) * p.xz;

  // formation: particles burst from the singularity, swirl and settle (inner first)
  float delay = clamp(r / 12.0, 0.0, 1.0) * 0.36 + aSeed * 0.14;
  float lp = clamp((uIntro - delay) / 0.5, 0.0, 1.0);
  float e = easeOutExpo(lp);
  vec3 dir = normalize(vec3(fract(aSeed * 13.37) - 0.5, (fract(aSeed * 7.13) - 0.5) * 0.6, fract(aSeed * 3.91) - 0.5) + 1e-4);
  vec3 start = dir * (0.02 + aSeed * 0.35);
  vec3 swirl = p;
  swirl.xz = rot2((1.0 - e) * 3.2) * swirl.xz;
  p = mix(start, swirl, e);
  p *= 1.0 + sin(lp * 3.14159) * 0.16; // shock-front overshoot
  formed = e;

  // pointer gravity well (galaxy-local plane)
  vec2 dm = p.xz - uMouse.xz;
  float infl = exp(-dot(dm, dm) / 3.4) * uMouseStrength;
  p.xz = uMouse.xz + rot2(infl * 1.25) * dm * (1.0 + infl * 0.12);
  p.y += infl * (0.35 + aSeed * 0.6);
  return p;
}
`;

const starVertex = /* glsl */ `
${sharedVertex}
void main() {
  float formed;
  vec3 p = galaxyPosition(formed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.001);
  float size = aSize * uSize * uPixelRatio / depth;
  size *= mix(2.6, 1.0, formed);
  float clamped = clamp(size, 1.0, 72.0 * uPixelRatio);
  gl_PointSize = clamped;

  // energy-preserving for sub-pixel points; fade when the camera flies through
  float area = min(size * size, 1.0);
  float nearFade = smoothstep(0.35, 3.2, depth);
  vColor = mix(vec3(1.5, 1.35, 1.7), aColor, formed);
  vAlpha = area * nearFade * uOpacity * smoothstep(0.0, 0.04, uIntro);
  vSeed = aSeed;
}
`;

const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = exp(-d * d * 5.5) + exp(-d * d * 28.0) * 0.6;
  a *= smoothstep(1.0, 0.72, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

const dustVertex = /* glsl */ `
${sharedVertex}
void main() {
  float formed;
  vec3 p = galaxyPosition(formed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(-mv.z, 0.001);
  float size = aSize * uSize * 3.4 * uPixelRatio / depth;
  gl_PointSize = clamp(size, 1.0, 140.0 * uPixelRatio);
  float nearFade = smoothstep(1.0, 5.0, depth);
  vColor = aColor;
  vAlpha = nearFade * uOpacity * smoothstep(0.55, 1.0, formed);
  vSeed = aSeed;
}
`;

const dustFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  // subtractive blending: rgb is the amount of light removed
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

// Unresolved starlight: the smooth glow real galaxies have between their stars.
// Same log-spiral and the same differential rotation as the particles, so the
// glow and the stars stay locked together; the dust layer darkens it too.
const glowVertex = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const glowFragment = /* glsl */ `
uniform float uTime;
uniform float uIntro;
uniform float uOpacity;
uniform float uR;
uniform float uR0;
varying vec3 vLocal;
void main() {
  vec2 p = vLocal.xz;
  float r = length(p);
  float rn = r / uR;
  float ang = atan(p.y, p.x) + uTime * (0.028 + 0.11 / (1.0 + r * 0.55));
  float a = ang - 2.45 * log(max(r, uR0) / uR0);
  float arm = pow(0.5 + 0.5 * cos(2.0 * a), 2.5) * smoothstep(uR0 * 0.7, uR0 * 1.6, r);
  float dust = pow(0.5 + 0.5 * cos(2.0 * (a + 0.2)), 8.0) * smoothstep(1.2, 3.0, r) * (1.0 - smoothstep(0.7, 1.0, rn));
  float core = exp(-r * r / 0.2) * 1.1;
  float bulge = exp(-r / 0.8) * 0.42;
  float disk = exp(-rn * 3.0) * (0.06 + 0.42 * arm);
  vec3 col = vec3(1.0, 0.76, 0.5) * (core + bulge) + vec3(0.6, 0.72, 1.0) * disk;
  col *= 1.0 - dust * 0.55;
  float edge = 1.0 - smoothstep(0.85, 1.25, rn);
  gl_FragColor = vec4(col * edge * uOpacity * smoothstep(0.35, 1.0, uIntro), 1.0);
}
`;

// ── helpers ──────────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Galaxy {
  constructor({ count = 160000, radius = 11, pixelRatio = 1 } = {}) {
    this.radius = radius;
    this.group = new THREE.Group();
    this.group.name = 'galaxy';

    this.uniforms = {
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uSize: { value: 30 },
      uPixelRatio: { value: pixelRatio },
      uMouse: { value: new THREE.Vector3(999, 0, 999) },
      uMouseStrength: { value: 0 },
      uOpacity: { value: 1 },
    };

    const rand = mulberry32(1337);
    const gauss = () => {
      let u = 0,
        v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);

    const R = radius;
    const ARMS = 2;
    const cCore = new THREE.Color('#ffd2a1');
    const cCore2 = new THREE.Color('#ffb070');
    const cMid = new THREE.Color('#fff1e6');
    const cArm = new THREE.Color('#b9d4ff');
    const cOuter = new THREE.Color('#7d8cff');
    const cYoung = new THREE.Color('#9fd0ff');
    const cHII = new THREE.Color('#ff6f9e');
    const cHII2 = new THREE.Color('#ffb8d2');
    const tmp = new THREE.Color();

    const R0 = 1.55; // arms start at the tips of the bar
    const armAngle = (r) => 2.45 * Math.log(Math.max(r, R0) / R0); // log spiral, ~22° pitch
    const BAR = 1.75; // half-length of the central bar

    // HII clump centres along the arms
    const clumps = [];
    for (let k = 0; k < 90; k++) {
      const r = 2.4 + rand() * (R * 0.85 - 2.4);
      const arm = k % ARMS;
      const a = (arm / ARMS) * Math.PI * 2 + armAngle(r) + gauss() * 0.08;
      clumps.push([Math.cos(a) * r, gauss() * 0.04, Math.sin(a) * r]);
    }

    const radialColor = (r, out) => {
      const t = r / R;
      if (t < 0.2) out.copy(cCore).lerp(cMid, t / 0.2);
      else if (t < 0.55) out.copy(cMid).lerp(cArm, (t - 0.2) / 0.35);
      else out.copy(cArm).lerp(cOuter, Math.min((t - 0.55) / 0.45, 1));
      return out;
    };

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const roll = rand();
      let x, y, z, size, bright;

      if (roll < 0.12) {
        // ── bulge + bar ──
        const bar = rand() < 0.5;
        if (bar) {
          x = (rand() * 2 - 1) * BAR + gauss() * 0.16;
          z = gauss() * 0.24;
          y = gauss() * 0.18;
        } else {
          const rr = Math.abs(gauss()) * 0.85;
          const th = rand() * Math.PI * 2;
          const ph = Math.acos(2 * rand() - 1);
          x = rr * Math.sin(ph) * Math.cos(th);
          y = rr * Math.cos(ph) * 0.6;
          z = rr * Math.sin(ph) * Math.sin(th);
        }
        tmp.copy(cCore).lerp(cCore2, rand() * 0.9);
        size = 0.5 + rand() * 0.6;
        bright = 0.3 + rand() * 0.28;
      } else if (roll < 0.76) {
        // ── spiral arms (with spurs feathering off them) ──
        const r = R0 + Math.pow(rand(), 1.05) * (R - R0);
        const arm = i % ARMS;
        const spur = rand() < 0.16;
        const spread = gauss() * (spur ? 0.08 : 0.16 + 0.26 * (r / R));
        const a = arm * Math.PI + armAngle(r) + spread + (spur ? 0.85 + 0.25 * Math.sin(r * 2.0) : 0);
        const rr = r + gauss() * 0.22 * (0.4 + r / R);
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        y = gauss() * (0.045 + 0.1 * Math.exp(-r / 2.4));
        radialColor(r, tmp);
        // young hot stars hug the arm ridge
        if (Math.abs(spread) < 0.06 && rand() < 0.4) tmp.lerp(cYoung, 0.75);
        size = 0.45 + Math.pow(rand(), 3.0) * 1.5;
        bright = (spur ? 0.34 : 0.52) + rand() * 0.42;
      } else if (roll < 0.92) {
        // ── diffuse disk (inter-arm) ──
        const r = 0.6 + -Math.log(1 - rand() * 0.985) * (R * 0.28);
        const a = rand() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        y = gauss() * (0.05 + 0.09 * Math.exp(-r / 2.0));
        radialColor(Math.min(r, R), tmp);
        size = 0.35 + rand() * 0.5;
        bright = 0.16 + rand() * 0.22;
      } else if (roll < 0.946) {
        // ── HII star-forming knots ──
        const c = clumps[Math.floor(rand() * clumps.length)];
        x = c[0] + gauss() * 0.13;
        y = c[1] + gauss() * 0.04;
        z = c[2] + gauss() * 0.13;
        tmp.copy(cHII).lerp(cHII2, rand());
        size = 0.6 + rand() * 0.9;
        bright = 0.55 + rand() * 0.35;
      } else {
        // ── sparse halo ──
        const rr = R * (0.3 + Math.pow(rand(), 0.6) * 1.1);
        const th = rand() * Math.PI * 2;
        const ph = Math.acos(2 * rand() - 1);
        x = rr * Math.sin(ph) * Math.cos(th);
        y = rr * Math.cos(ph) * 0.35;
        z = rr * Math.sin(ph) * Math.sin(th);
        tmp.copy(cMid).lerp(cArm, rand());
        size = 0.4 + rand() * 0.5;
        bright = 0.25 + rand() * 0.25;
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      colors[i3] = tmp.r * bright;
      colors[i3 + 1] = tmp.g * bright;
      colors[i3 + 2] = tmp.b * bright;
      sizes[i] = size;
      seeds[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.6);

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);

    // ── dust lanes (subtractive) ──
    const dustCount = Math.round(count * 0.07);
    const dPos = new Float32Array(dustCount * 3);
    const dCol = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);
    const dSeed = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      const r = R0 * 0.8 + Math.pow(rand(), 0.85) * (R * 0.9 - R0 * 0.8);
      const arm = i % ARMS;
      // dust lanes trace the concave edge of each arm
      const a = arm * Math.PI + armAngle(r) - 0.2 + gauss() * 0.05;
      const rr = r + gauss() * 0.12;
      dPos[i * 3] = Math.cos(a) * rr;
      dPos[i * 3 + 1] = gauss() * 0.03;
      dPos[i * 3 + 2] = Math.sin(a) * rr;
      const k = (0.18 + rand() * 0.3) * (1.0 - (r / R) * 0.55);
      dCol[i * 3] = k * 0.92;
      dCol[i * 3 + 1] = k * 1.0;
      dCol[i * 3 + 2] = k * 1.08;
      dSize[i] = 0.6 + rand() * 1.0;
      dSeed[i] = rand();
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.SubtractiveBlending,
      premultipliedAlpha: true, // dest *= (1 − src.rgb)
    });
    this.dust = new THREE.Points(dGeo, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 3;
    this.group.add(this.dust);

    // ── diffuse starlight plane ──
    const glowGeo = new THREE.PlaneGeometry(R * 2.6, R * 2.6, 1, 1);
    glowGeo.rotateX(-Math.PI / 2);
    this.glowUniforms = {
      uTime: this.uniforms.uTime,
      uIntro: this.uniforms.uIntro,
      uOpacity: { value: 1 },
      uR: { value: R },
      uR0: { value: R0 },
    };
    this.glow = new THREE.Mesh(
      glowGeo,
      new THREE.ShaderMaterial({
        uniforms: this.glowUniforms,
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 1;
    this.group.add(this.glow);
    this._camLocal = new THREE.Vector3();

    // Hero framing: inclined ~62° and rolled for a diagonal composition
    this.group.rotation.set(0.5, 0.25, -0.34);

    this._plane = new THREE.Plane();
    this._hit = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._mouseTarget = new THREE.Vector3(999, 0, 999);
    this._strength = 0;
  }

  setPixelRatio(pr) {
    this.uniforms.uPixelRatio.value = pr;
  }

  /** ray: THREE.Ray from the camera through the pointer. active: pointer is over the hero. */
  update(time, ray, active, pointerSpeed, cameraPosition) {
    this.uniforms.uTime.value = time;
    // the glow plane fades as the camera dives through the disk
    if (cameraPosition) {
      this._camLocal.copy(cameraPosition);
      this.group.worldToLocal(this._camLocal);
      this.glowUniforms.uOpacity.value = THREE.MathUtils.smoothstep(Math.abs(this._camLocal.y), 0.6, 5.0);
    }
    // intersect pointer ray with the galaxy plane
    this.group.updateMatrixWorld();
    this._normal.set(0, 1, 0).transformDirection(this.group.matrixWorld);
    this._plane.setFromNormalAndCoplanarPoint(this._normal, this.group.position);
    let target = 0;
    if (ray && ray.intersectPlane(this._plane, this._hit)) {
      this.group.worldToLocal(this._hit);
      if (this._hit.length() < this.radius * 1.4) {
        this._mouseTarget.copy(this._hit);
        target = active ? 0.55 + Math.min(pointerSpeed * 0.9, 0.9) : 0;
      }
    }
    this._strength += (target - this._strength) * 0.045;
    this.uniforms.uMouse.value.lerp(this._mouseTarget, 0.08);
    this.uniforms.uMouseStrength.value = this._strength;
  }
}
