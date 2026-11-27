import { gsap } from 'gsap';
import { state } from '../core/state.js';

/**
 * LIQUID GLASS ENGINE
 * ───────────────────
 * 1. Refraction — for every glass element we compute a displacement map from
 *    the signed-distance field of its rounded shape. The bezel follows a convex
 *    squircle profile h(t) = (1 − (1 − t)⁴)^¼ and each pixel's offset comes from
 *    Snell's law (n = 1.5), so light bends hardest right at the rim, exactly
 *    like a real lens. The map feeds an SVG filter (feDisplacementMap ×3 with
 *    slightly different strengths per channel → chromatic dispersion) that is
 *    applied through `backdrop-filter: url(#…)` (Chromium). Other engines get a
 *    tuned frosted fallback; everything else below works everywhere.
 * 2. Light — a conic rim highlight rotates toward the pointer, plus a sheen
 *    that follows it across the surface.
 * 3. Physics — springs (not tweens) drive magnetism, squash & stretch from
 *    pointer velocity, a squish on press and a jelly wobble on release.
 */

const SVGNS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

export const supportsRefraction = (() => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua) && !isIOS;
  const params = new URLSearchParams(location.search);
  if (params.get('glass') === 'flat') return false;
  return isChromium && !!window.CSS?.supports?.('backdrop-filter', 'blur(1px)');
})();

if (supportsRefraction) document.documentElement.classList.add('lg-refract');

/* ── displacement maps ─────────────────────────────────────────────────── */
const mapCache = new Map();

function buildMap(w, h, radius, bezel) {
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  const key = `${W}x${H}:${radius.toFixed(1)}:${bezel.toFixed(1)}`;
  const hit = mapCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const hw = W / 2;
  const hh = H / 2;
  const r = Math.min(radius, hw, hh);
  const sdf = (x, y) => {
    const qx = Math.abs(x - hw) - (hw - r);
    const qy = Math.abs(y - hh) - (hh - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const IOR = 1.5;
  const vec = new Float32Array(W * H * 2);
  let maxMag = 1e-6;
  const MAGNIFY = 0.09; // gentle whole-surface zoom: reads as a thick lens
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = sdf(px, py);
      if (d >= 0) continue;
      const i = (y * W + x) * 2;
      // body: sample slightly toward the centre → magnification
      let vx = -((px - hw) / hw) * MAGNIFY;
      let vy = -((py - hh) / hh) * MAGNIFY;
      const t = -d / bezel;
      if (t < 1) {
        // bezel: Snell refraction through a convex squircle profile
        const gx = sdf(px + 0.5, py) - sdf(px - 0.5, py);
        const gy = sdf(px, py + 0.5) - sdf(px, py - 0.5);
        const gl = Math.hypot(gx, gy) || 1;
        const s = 1 - t;
        const slope = (s * s * s) / Math.pow(Math.max(1 - s * s * s * s, 1e-6), 0.75);
        const ti = Math.atan(slope);
        const tt = Math.asin(Math.sin(ti) / IOR);
        const mag = Math.tan(ti - tt);
        vx -= (gx / gl) * mag; // inward: the rim pulls the scene behind it
        vy -= (gy / gl) * mag;
      }
      vec[i] = vx;
      vec[i + 1] = vy;
      const m = Math.hypot(vx, vy);
      if (m > maxMag) maxMag = m;
    }
  }
  for (let p = 0, q = 0; p < W * H; p++, q += 4) {
    data[q] = 128 + Math.round((vec[p * 2] / maxMag) * 127);
    data[q + 1] = 128 + Math.round((vec[p * 2 + 1] / maxMag) * 127);
    data[q + 2] = 128;
    data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const res = { url: canvas.toDataURL('image/png'), W, H };
  mapCache.set(key, res);
  if (mapCache.size > 64) mapCache.delete(mapCache.keys().next().value);
  return res;
}

const defs = () => document.getElementById('lg-defs');
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* ── shared loop & observers ───────────────────────────────────────────── */
const instances = new Set();
const visible = new Set();
let running = false;

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      const inst = e.target.__lg;
      if (!inst) return;
      if (e.isIntersecting) visible.add(inst);
      else visible.delete(inst);
    });
  },
  { rootMargin: '80px' }
);

const ro = new ResizeObserver((entries) => {
  entries.forEach((e) => e.target.__lg?.queueRebuild());
});

function tick(time, deltaMs) {
  const dt = Math.min(deltaMs / 1000, 1 / 30);
  // read phase
  visible.forEach((inst) => inst.measure());
  // write phase
  visible.forEach((inst) => inst.step(dt, time));
}

function startLoop() {
  if (running) return;
  running = true;
  gsap.ticker.add(tick);
}

/* ── spring helper ─────────────────────────────────────────────────────── */
class Spring {
  constructor(value, k = 170, c = 13) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.k = k;
    this.c = c;
  }
  step(dt) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  get settled() {
    return Math.abs(this.v) < 1e-3 && Math.abs(this.x - this.target) < 1e-3;
  }
}

let uid = 0;

export class LiquidGlass {
  /**
   * @param {HTMLElement} node
   * @param {object} opts
   *  refract     — use SVG refraction when supported (default true)
   *  strength    — max rim displacement as a fraction of the element height
   *  bezel       — bezel width in px (defaults to the corner radius)
   *  blur        — residual blur on top of refraction (px)
   *  dispersion  — chromatic split across channels
   *  interactive — magnetic / jelly / ripple behaviours
   */
  constructor(node, opts = {}) {
    this.node = node;
    node.__lg = this;
    this.o = {
      refract: true,
      strength: 0.58,
      bezel: null,
      blur: 1.1,
      saturate: 1.7,
      brightness: 1.07,
      dispersion: true,
      interactive: true,
      magnetic: node.hasAttribute('data-magnetic'),
      magnet: 0.32,
      ...opts,
    };
    this.id = `lg-f-${uid++}`;
    this.hover = false;
    this.pressed = false;
    this.fx = { boost: 0 };
    this.rect = null;
    this.label = node.querySelector('.lg-btn__label');
    this.icon = node.querySelector('.lg-btn__icon');

    this.clip = document.createElement('span');
    this.clip.className = 'lg__clip';
    this.clip.setAttribute('aria-hidden', 'true');
    node.prepend(this.clip);

    // springs: translation (magnet), scale (jelly), label parallax
    this.sx = new Spring(1, 210, 12);
    this.sy = new Spring(1, 210, 12);
    this.tx = new Spring(0, 120, 15);
    this.ty = new Spring(0, 120, 15);
    this.lx = new Spring(0, 140, 14);
    this.ly = new Spring(0, 140, 14);
    this.base = 1;
    this.pvx = 0;
    this.pvy = 0;
    this.local = { x: 0.5, y: 0.5 };
    this.awake = false;

    if (supportsRefraction && this.o.refract) this.initFilter();
    if (this.o.interactive) this.bind();

    instances.add(this);
    io.observe(node);
    ro.observe(node);
    startLoop();
  }

  /* ── refraction filter ── */
  initFilter() {
    const f = el('filter', {
      id: this.id,
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    this.feImage = el('feImage', { result: 'map', x: 0, y: 0, width: 10, height: 10, preserveAspectRatio: 'none' });
    f.appendChild(this.feImage);
    const disp = (scaleMul, result) =>
      el('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result, 'data-mul': scaleMul });
    if (this.o.dispersion) {
      this.disps = [disp(0.86, 'dr'), disp(0.94, 'dg'), disp(1.0, 'db')];
      this.disps.forEach((d) => f.appendChild(d));
      f.appendChild(el('feColorMatrix', { in: 'dr', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'r' }));
      f.appendChild(el('feColorMatrix', { in: 'dg', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'g' }));
      f.appendChild(el('feColorMatrix', { in: 'db', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'b' }));
      f.appendChild(el('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }));
      f.appendChild(el('feBlend', { in: 'rg', in2: 'b', mode: 'screen' }));
    } else {
      this.disps = [disp(1, 'd')];
      f.appendChild(this.disps[0]);
    }
    this.filter = f;
    defs()?.appendChild(f);
    this.rebuild();
  }

  queueRebuild() {
    if (!this.filter || this._rebuildQueued) return;
    this._rebuildQueued = true;
    requestAnimationFrame(() => {
      this._rebuildQueued = false;
      this.rebuild();
    });
  }

  rebuild() {
    if (!this.filter) return;
    const w = this.node.offsetWidth;
    const h = this.node.offsetHeight;
    if (!w || !h) return;
    const cs = getComputedStyle(this.node);
    const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || h / 2, h / 2, w / 2);
    const bezel = this.o.bezel ?? Math.max(radius * 0.95, 8);
    const map = buildMap(w, h, radius, bezel);
    for (const n of [this.filter, this.feImage]) {
      n.setAttribute('width', map.W);
      n.setAttribute('height', map.H);
    }
    this.feImage.setAttribute('href', map.url);
    this.feImage.setAttributeNS(XLINK, 'xlink:href', map.url);
    this.maxOffset = h * this.o.strength;
    this.applyScale();
    const bf = `url(#${this.id}) blur(${this.o.blur}px) saturate(${this.o.saturate}) brightness(${this.o.brightness})`;
    this.node.style.backdropFilter = bf;
    this.node.style.webkitBackdropFilter = bf;
  }

  applyScale() {
    if (!this.disps) return;
    const s = this.maxOffset * 2 * (1 + this.fx.boost);
    this.disps.forEach((d) => d.setAttribute('scale', (s * parseFloat(d.getAttribute('data-mul'))).toFixed(2)));
  }

  /* ── interaction ── */
  bind() {
    const n = this.node;
    if (state.isTouch) {
      n.addEventListener('pointerdown', (e) => this.press(e), { passive: true });
      n.addEventListener('pointerup', () => this.release());
      n.addEventListener('pointercancel', () => this.release());
      return;
    }
    n.addEventListener('pointerenter', (e) => this.enter(e));
    n.addEventListener('pointermove', (e) => this.move(e));
    n.addEventListener('pointerleave', () => this.leave());
    n.addEventListener('pointerdown', (e) => this.press(e));
    window.addEventListener('pointerup', () => this.pressed && this.release());
    n.addEventListener('focus', () => this.setGlow(1));
    n.addEventListener('blur', () => !this.hover && this.setGlow(0));
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.press(null);
    });
    n.addEventListener('keyup', () => this.release());
  }

  setGlow(v, dur = 0.6) {
    gsap.to(this.node, { '--lg-glow': v, duration: dur, ease: 'power2.out', overwrite: 'auto' });
  }

  enter(e) {
    this.hover = true;
    this.base = 1.035;
    this.wake();
    this.setGlow(1, 0.45);
    gsap.to(this.fx, { boost: 0.45, duration: 0.7, ease: 'power3.out', overwrite: 'auto', onUpdate: () => this.applyScale() });
    this.move(e);
    LiquidGlass.onHover?.(this);
  }

  move(e) {
    if (!this.rect) this.rect = this.node.getBoundingClientRect();
    const r = this.rect;
    const lx = (e.clientX - r.left) / r.width;
    const ly = (e.clientY - r.top) / r.height;
    this.local.x = lx;
    this.local.y = ly;
    this.node.style.setProperty('--lg-mx', `${(lx * 100).toFixed(1)}%`);
    this.node.style.setProperty('--lg-my', `${(ly * 100).toFixed(1)}%`);
    if (this.o.magnetic) {
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      this.tx.target = dx * this.o.magnet;
      this.ty.target = dy * this.o.magnet;
      this.lx.target = dx * 0.14;
      this.ly.target = dy * 0.18;
    }
    // pointer velocity → squash & stretch
    const now = performance.now();
    if (this._lastMove) {
      const dt = Math.max(now - this._lastMove.t, 8) / 1000;
      const vx = (e.clientX - this._lastMove.x) / dt;
      const vy = (e.clientY - this._lastMove.y) / dt;
      this.pvx = this.pvx * 0.6 + vx * 0.4;
      this.pvy = this.pvy * 0.6 + vy * 0.4;
    }
    this._lastMove = { x: e.clientX, y: e.clientY, t: now };
    this.wake();
  }

  leave() {
    this.hover = false;
    this.base = 1;
    this.tx.target = this.ty.target = 0;
    this.lx.target = this.ly.target = 0;
    this.pvx = this.pvy = 0;
    this._lastMove = null;
    this.setGlow(0, 0.8);
    gsap.to(this.fx, { boost: 0, duration: 0.9, ease: 'power2.out', overwrite: 'auto', onUpdate: () => this.applyScale() });
    this.wake();
  }

  press(e) {
    this.pressed = true;
    this.wake();
    // squish — volume-preserving-ish
    this.sx.v += 2.4;
    this.sy.v -= 3.2;
    gsap.fromTo(this.fx, { boost: 1.3 }, { boost: this.hover ? 0.45 : 0, duration: 1.1, ease: 'power3.out', overwrite: 'auto', onUpdate: () => this.applyScale() });
    if (e) this.ripple(e);
  }

  release() {
    if (!this.pressed) return;
    this.pressed = false;
    this.sy.v += 2.6;
    this.sx.v -= 1.6;
    this.wake();
  }

  ripple(e) {
    const r = this.node.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const d = document.createElement('span');
    d.className = 'lg__ripple';
    this.clip.appendChild(d);
    const size = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) * 2.2;
    gsap.set(d, { x, y });
    gsap.fromTo(
      d,
      { scale: 0, opacity: 1 },
      { scale: size / 10, opacity: 0, duration: 1.0, ease: 'power2.out', onComplete: () => d.remove() }
    );
  }

  wake() {
    this.awake = true;
  }

  /* ── per-frame ── */
  measure() {
    this.rect = this.node.getBoundingClientRect();
  }

  step(dt) {
    // ambient: rim light faces the cursor even when not hovered
    if (!state.isTouch && this.rect && !this.hover) {
      const cx = this.rect.left + this.rect.width / 2;
      const cy = this.rect.top + this.rect.height / 2;
      const ang = (Math.atan2(state.pointer.y - cy, state.pointer.x - cx) * 180) / Math.PI + 90;
      this.node.style.setProperty('--lg-angle', `${ang.toFixed(1)}deg`);
    } else if (this.hover) {
      const ang = (Math.atan2(this.local.y - 0.5, this.local.x - 0.5) * 180) / Math.PI + 90;
      this.node.style.setProperty('--lg-angle', `${ang.toFixed(1)}deg`);
    }
    if (!this.awake) return;

    // velocity decays → stretch relaxes
    this.pvx *= 0.88;
    this.pvy *= 0.88;
    const stx = Math.min(Math.abs(this.pvx) / 3200, 0.1);
    const sty = Math.min(Math.abs(this.pvy) / 3200, 0.1);
    this.sx.target = this.base + stx - sty * 0.5;
    this.sy.target = this.base + sty - stx * 0.5;
    if (this.pressed) {
      this.sx.target += 0.05;
      this.sy.target -= 0.07;
    }
    const sx = this.sx.step(dt);
    const sy = this.sy.step(dt);
    const tx = this.tx.step(dt);
    const ty = this.ty.step(dt);
    const lx = this.lx.step(dt);
    const ly = this.ly.step(dt);
    gsap.set(this.node, { x: tx, y: ty, scaleX: sx, scaleY: sy });
    if (this.label) gsap.set(this.label, { x: lx, y: ly });
    if (this.icon) gsap.set(this.icon, { x: lx * 1.4, y: ly * 1.4 });

    const settled = [this.sx, this.sy, this.tx, this.ty, this.lx, this.ly].every((s) => s.settled);
    if (settled && !this.hover && !this.pressed && Math.abs(this.pvx) < 1 && Math.abs(this.pvy) < 1) this.awake = false;
  }

  destroy() {
    instances.delete(this);
    visible.delete(this);
    io.unobserve(this.node);
    ro.unobserve(this.node);
    this.filter?.remove();
  }
}

/** Initialise every `.lg` element in `root`. */
export function initLiquidGlass(root = document) {
  const created = [];
  root.querySelectorAll('.lg').forEach((node) => {
    if (node.__lg) return;
    const isChip = node.classList.contains('chip');
    const isNav = node.classList.contains('nav');
    const isBlob = node.classList.contains('nav__blob');
    const isIcon = node.classList.contains('lg-btn--icon');
    const opts = {};
    if (isChip) Object.assign(opts, { refract: false, interactive: true, magnetic: false });
    if (isNav) Object.assign(opts, { strength: 0.3, blur: 3, interactive: false, dispersion: false, saturate: 1.5 });
    if (isBlob) Object.assign(opts, { strength: 0.55, blur: 0.3, interactive: false, saturate: 1.25, brightness: 1.12 });
    if (isIcon) Object.assign(opts, { strength: 0.48 });
    created.push(new LiquidGlass(node, opts));
  });
  return created;
}

export function refreshLiquidGlass() {
  instances.forEach((i) => i.queueRebuild());
}
