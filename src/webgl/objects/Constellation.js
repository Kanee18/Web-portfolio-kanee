import * as THREE from 'three';

/**
 * Skills as a constellation. Node positions are generated deterministically,
 * connected with a minimum spanning tree (+ a few chords), and revealed in BFS
 * order as the user scrolls. Stars render with JWST-style six-point
 * diffraction spikes; edges are screen-space anti-aliased lines with data
 * pulses travelling along them. DOM labels are projected every frame.
 */

const starVertex = /* glsl */ `
uniform float uPixelRatio;
uniform float uReveal;
uniform float uHover;
uniform float uTime;
attribute float aOrder;
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(aOrder - 0.2, aOrder + 0.6, uReveal);
  float hover = 1.0 - smoothstep(0.0, 0.5, abs(uHover - aOrder));
  float tw = 0.85 + 0.15 * sin(uTime * 2.0 + aOrder * 4.0);
  gl_PointSize = aSize * uPixelRatio * (0.55 + 0.45 * on + hover * 0.5) * (40.0 / max(-mv.z, 1.0));
  vColor = aColor * (1.0 + hover * 1.4);
  vAlpha = on * tw;
}
`;
const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r = length(c);
  float core = exp(-r * r * 160.0) * 3.0 + exp(-r * r * 22.0) * 0.6 + exp(-r * 5.0) * 0.12;
  float spikes = 0.0;
  for (int k = 0; k < 3; k++) {
    float a = float(k) * 1.0471976 + 1.5707963;
    vec2 d = vec2(cos(a), sin(a));
    float along = abs(dot(c, d));
    float perp = abs(dot(c, vec2(-d.y, d.x)));
    spikes += exp(-perp * 70.0) * exp(-along * 3.0);
  }
  spikes += 0.45 * exp(-abs(c.y) * 110.0) * exp(-abs(c.x) * 4.5);
  float a = (core + spikes * 0.85) * smoothstep(1.0, 0.82, r) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

const lineVertex = /* glsl */ `
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uDraw;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec2 aCorner;   // x: side (-1/1), y: 0 start / 1 end
attribute float aOrder;
varying float vT;
varying float vSide;
varying float vReveal;
varying float vOrder;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
  vec2 sa = a.xy / a.w * 0.5 * uResolution;
  vec2 sb = b.xy / b.w * 0.5 * uResolution;
  vec2 dir = normalize(sb - sa + 1e-5);
  vec2 n = vec2(-dir.y, dir.x);
  float w = 1.35 * uPixelRatio;
  vec4 p = mix(a, b, aCorner.y);
  vec2 sp = p.xy / p.w * 0.5 * uResolution + n * aCorner.x * w;
  gl_Position = vec4(sp / (0.5 * uResolution) * p.w, p.z, p.w);
  vT = aCorner.y;
  vSide = aCorner.x;
  vReveal = clamp(uDraw - aOrder, 0.0, 1.0);
  vOrder = aOrder;
}
`;
const lineFragment = /* glsl */ `
uniform float uTime;
uniform float uLineAlpha;
varying float vT;
varying float vSide;
varying float vReveal;
varying float vOrder;
void main() {
  if (vT > vReveal) discard;
  float edge = 1.0 - abs(vSide);
  float a = smoothstep(0.0, 0.8, edge);
  // (never pow() a possibly-negative base: undefined in GLSL, NaN on D3D)
  float hd = (vT - vReveal) * 9.0;
  float head = exp(-hd * hd) * step(vReveal, 0.999);
  float pd = (fract(uTime * 0.18 + vOrder * 0.37) - vT) * 14.0;
  float pulse = exp(-pd * pd) * step(0.999, vReveal);
  vec3 col = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.85, 0.65), vT) * 0.55;
  col += vec3(1.0, 0.9, 0.75) * (head * 2.2 + pulse * 1.4);
  gl_FragColor = vec4(col, a * (0.55 + head + pulse) * uLineAlpha);
}
`;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Constellation {
  constructor(labels, { pixelRatio = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'constellation';
    const n = labels.length;
    const rand = mulberry32(42);

    // ── node layout: jittered points inside an ellipse with minimum spacing ──
    const pts = [];
    const RX = 13.5,
      RY = 6.8;
    let guard = 0;
    while (pts.length < n && guard++ < 5000) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const p = new THREE.Vector3(Math.cos(a) * r * RX, Math.sin(a) * r * RY, (rand() - 0.5) * 7);
      const minD = 4.2 - Math.min(guard / 1500, 1.5);
      if (pts.every((q) => q.distanceTo(p) > minD)) pts.push(p);
    }
    while (pts.length < n) pts.push(new THREE.Vector3((rand() - 0.5) * RX * 2, (rand() - 0.5) * RY * 2, 0));

    // ── edges: Prim MST + 2 chords ──
    const inTree = [0];
    const edges = [];
    const left = new Set(pts.map((_, i) => i).slice(1));
    // start from the leftmost node for a left→right reveal
    let start = 0;
    pts.forEach((p, i) => {
      if (p.x < pts[start].x) start = i;
    });
    inTree[0] = start;
    left.clear();
    pts.forEach((_, i) => i !== start && left.add(i));
    while (left.size) {
      let best = null;
      for (const i of inTree)
        for (const j of left) {
          const d = pts[i].distanceTo(pts[j]);
          if (!best || d < best[2]) best = [i, j, d];
        }
      edges.push([best[0], best[1]]);
      inTree.push(best[1]);
      left.delete(best[1]);
    }
    // a couple of short chords to close loops
    const extra = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
        extra.push([i, j, pts[i].distanceTo(pts[j])]);
      }
    extra.sort((a, b) => a[2] - b[2]);
    extra.slice(0, 2).forEach(([i, j]) => edges.push([i, j]));

    // reveal order = order nodes joined the tree
    const order = new Array(n).fill(0);
    inTree.forEach((node, k) => (order[node] = k));
    this.order = order;
    this.points = pts;
    this.count = n;

    // ── stars ──
    const pos = new Float32Array(n * 3);
    const ord = new Float32Array(n);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const palette = ['#ffe7c7', '#cfe2ff', '#ffffff', '#ffd2a6'].map((c) => new THREE.Color(c));
    pts.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      ord[i] = order[i];
      size[i] = 70 + rand() * 50;
      const c = palette[i % palette.length];
      col.set([c.r * 1.4, c.g * 1.4, c.b * 1.4], i * 3);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aOrder', new THREE.BufferAttribute(ord, 1));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.uniforms = {
      uPixelRatio: { value: pixelRatio },
      uReveal: { value: -1 },
      uHover: { value: -10 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uDraw: { value: 0 },
      uLineAlpha: { value: 1 },
    };
    this.stars = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: starVertex,
        fragmentShader: starFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 8;

    // ── lines: each edge revealed when its far node joins ──
    const E = edges.length;
    const aStart = new Float32Array(E * 4 * 3);
    const aEnd = new Float32Array(E * 4 * 3);
    const aCorner = new Float32Array(E * 4 * 2);
    const aOrder = new Float32Array(E * 4);
    const index = [];
    edges.forEach(([i, j], e) => {
      // orient from the earlier node to the later one
      let a = i,
        b = j;
      if (order[a] > order[b]) [a, b] = [b, a];
      const o = order[b] - 1; // drawn while node b is being reached
      const corners = [
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
      ];
      corners.forEach((c, k) => {
        const v = e * 4 + k;
        aStart.set([pts[a].x, pts[a].y, pts[a].z], v * 3);
        aEnd.set([pts[b].x, pts[b].y, pts[b].z], v * 3);
        aCorner.set(c, v * 2);
        aOrder[v] = o;
      });
      const b0 = e * 4;
      index.push(b0, b0 + 1, b0 + 2, b0 + 2, b0 + 1, b0 + 3);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(E * 4 * 3), 3));
    lg.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
    lg.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 3));
    lg.setAttribute('aCorner', new THREE.BufferAttribute(aCorner, 2));
    lg.setAttribute('aOrder', new THREE.BufferAttribute(aOrder, 1));
    lg.setIndex(index);
    this.lines = new THREE.Mesh(
      lg,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, // screen-space quads: winding depends on direction
      })
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;

    this.group.add(this.lines, this.stars);
    this.state = { draw: 0 };
    this._v = new THREE.Vector3();
    this.labels = [];
  }

  setSize(w, h, pr) {
    this.uniforms.uResolution.value.set(w * pr, h * pr);
    this.uniforms.uPixelRatio.value = pr;
  }

  bindLabels(labelEls, chipEls) {
    this.labels = labelEls;
    this.chips = chipEls;
  }

  setHover(index) {
    this.uniforms.uHover.value = index < 0 ? -10 : this.order[index];
  }

  /** reveal progress 0..1 → node index space */
  update(time, camera, viewport, visible, labelAlpha = 1) {
    this.uniforms.uTime.value = time;
    const reveal = this.state.draw * (this.count - 0.4) - 0.2;
    this.uniforms.uReveal.value = reveal;
    this.uniforms.uDraw.value = reveal;
    if (!this.labels.length) return;
    const show = visible && labelAlpha > 0.001;
    if (!show) {
      if (this._labelsShown) {
        this.labels.forEach((el) => (el.style.opacity = 0));
        this._labelsShown = false;
      }
      return;
    }
    this._labelsShown = true;
    this.group.updateMatrixWorld();
    const { width, height } = viewport;
    for (let i = 0; i < this.count; i++) {
      const el = this.labels[i];
      if (!el) continue;
      this._v.copy(this.points[i]).applyMatrix4(this.group.matrixWorld).project(camera);
      const x = (this._v.x * 0.5 + 0.5) * width;
      const y = (-this._v.y * 0.5 + 0.5) * height;
      const on = THREE.MathUtils.clamp((reveal - this.order[i] + 0.2) / 0.8, 0, 1);
      const behind = this._v.z > 1;
      el.style.transform = `translate3d(${(x + 16).toFixed(1)}px, ${(y - 7).toFixed(1)}px, 0)`;
      el.style.opacity = behind ? 0 : (on * labelAlpha).toFixed(3);
      const lit = on > 0.6;
      if (el._lit !== lit) {
        el._lit = lit;
        el.classList.toggle('is-lit', lit);
        this.chips?.[i]?.classList.toggle('is-lit', lit);
      }
    }
  }
}
