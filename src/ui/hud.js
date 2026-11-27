import { gsap } from 'gsap';
import { lenis } from '../core/scroll.js';
import { state } from '../core/state.js';

/**
 * Flight telemetry on the right edge. The instruments power on once the
 * journey starts (they stay dark over the hero) and update at ~20 fps.
 */
export function initHud(experience) {
  const q = (s) => document.querySelector(s);
  const stack = q('.hud__stack');
  const vel = q('[data-hud-vel]');
  const dist = q('[data-hud-dist]');
  const sector = q('[data-hud-sector]');
  const pos = q('[data-hud-pos]');
  const fill = q('[data-hud-fill]');
  if (!vel || !stack) return;

  const rows = [...stack.children];
  gsap.set(rows, { opacity: 0, x: 8 });
  let on = false;
  const power = (v) => {
    if (v === on) return;
    on = v;
    gsap.to(rows, { opacity: v ? 1 : 0, x: v ? 0 : 8, duration: v ? 0.9 : 0.4, stagger: v ? 0.07 : 0, ease: 'expo.out', overwrite: true });
  };

  const sectors = ['top', 'about', 'work', 'skills', 'journey', 'contact'];
  const sectionEls = sectors.map((id) => document.getElementById(id));
  const fmt = new Intl.NumberFormat('en-US');
  const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);
  let frame = 0;

  gsap.ticker.add(() => {
    power(state.introDone && state.journeyT > 0.12);
    if (!on || ++frame % 3) return;
    const t = experience.telemetry();
    vel.textContent = `${Math.min(t.speed / 600, 0.999).toFixed(3)}c`;
    dist.textContent = `${fmt.format(Math.round(t.distance * 1270))} LY`;
    const p = t.position;
    pos.textContent = `${sign(p.x)} ${sign(p.y)} ${sign(p.z)}`;
    fill.style.transform = `scaleY(${lenis.progress.toFixed(4)})`;
    const mid = window.innerHeight * 0.5;
    let idx = 0;
    sectionEls.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top <= mid) idx = i;
    });
    sector.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(sectors.length).padStart(2, '0')}`;
  });
}
