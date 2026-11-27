import { gsap } from 'gsap';
import { state } from '../core/state.js';

/**
 * A two-part cursor: a precise dot and a lagging ring that stretches along its
 * velocity like a droplet, swells over interactive elements and shows a label
 * over [data-cursor] targets.
 */
export function initCursor() {
  if (state.isTouch || !window.matchMedia('(pointer: fine)').matches) return null;
  const root = document.querySelector('.cursor');
  if (!root) return null;
  document.documentElement.classList.add('has-cursor');

  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');

  const pos = { x: state.pointer.x, y: state.pointer.y };
  const ringPos = { x: pos.x, y: pos.y };
  let scale = 1;
  let targetScale = 1;
  let visible = false;

  gsap.set([dot, ring], { x: pos.x, y: pos.y, opacity: 0 });

  window.addEventListener(
    'pointermove',
    (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!visible) {
        visible = true;
        gsap.to([dot, ring], { opacity: 1, duration: 0.4 });
      }
    },
    { passive: true }
  );
  document.addEventListener('pointerleave', () => {
    visible = false;
    gsap.to([dot, ring], { opacity: 0, duration: 0.3 });
  });

  const setTarget = (t) => {
    root.classList.toggle('is-hover', !!t);
    const text = t?.getAttribute?.('data-cursor');
    if (text) {
      label.textContent = text;
      root.classList.add('is-label');
      targetScale = 2.15;
      gsap.to(label, { opacity: 1, duration: 0.3, delay: 0.05 });
    } else {
      root.classList.remove('is-label');
      gsap.to(label, { opacity: 0, duration: 0.15 });
      targetScale = t ? 1.65 : 1;
    }
  };

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a, button, [data-cursor], .chip');
    setTarget(t);
  });
  document.addEventListener('pointerdown', () => root.classList.add('is-down'));
  window.addEventListener('pointerup', () => root.classList.remove('is-down'));

  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 16.667, 3);
    const k = 1 - Math.pow(1 - 0.16, dt);
    const vx = pos.x - ringPos.x;
    const vy = pos.y - ringPos.y;
    ringPos.x += vx * k;
    ringPos.y += vy * k;
    scale += (targetScale - scale) * (1 - Math.pow(1 - 0.18, dt));
    const speed = Math.min(Math.hypot(vx, vy) / 160, 0.45);
    const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
    const press = root.classList.contains('is-down') ? 0.82 : 1;
    gsap.set(dot, { x: pos.x, y: pos.y });
    gsap.set(ring, {
      x: ringPos.x,
      y: ringPos.y,
      rotation: angle,
      scaleX: scale * press * (1 + speed),
      scaleY: scale * press * (1 - speed * 0.55),
    });
    gsap.set(label, { rotation: -angle });
  });

  return { setTarget };
}
