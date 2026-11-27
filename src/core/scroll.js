import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Lenis drives the page; GSAP's ticker drives Lenis. Every scroll-linked thing
 * (ScrollTrigger, the WebGL journey, the HUD) reads the same smoothed value in
 * the same frame — no double smoothing, no drift between DOM and canvas.
 */
export const lenis = new Lenis({
  lerp: 0.085,
  smoothWheel: true,
  wheelMultiplier: 0.9,
  touchMultiplier: 1.2,
  syncTouch: false,
  autoRaf: false,
  anchors: false, // anchor clicks are routed through scrollToTarget for custom easing
  stopInertiaOnNavigate: true,
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

ScrollTrigger.config({ ignoreMobileResize: true });

const easeInOutExpo = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

/** Smooth programmatic scroll; long jumps take longer (and look like a hyperspace jump). */
export function scrollToTarget(target, opts = {}) {
  let y = 0;
  if (typeof target === 'number') y = target;
  else {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    y = el.getBoundingClientRect().top + lenis.scroll + (opts.offset || 0);
  }
  const distance = Math.abs(y - lenis.scroll) / window.innerHeight;
  const duration = opts.duration ?? Math.min(1.2 + distance * 0.22, 3.6);
  lenis.scrollTo(y, { duration, easing: easeInOutExpo, force: true, ...opts, offset: 0 });
}

/** Route every [data-scroll-to] link through Lenis. */
export function bindScrollLinks(root = document) {
  root.addEventListener('click', (e) => {
    // placeholder links (href="#") from content.js shouldn't yank the page to the top
    const placeholder = e.target.closest('a[href="#"]:not([data-scroll-to])');
    if (placeholder) {
      e.preventDefault();
      return;
    }
    const a = e.target.closest('[data-scroll-to]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    e.preventDefault();
    if (href === '#top' || href === '#') scrollToTarget(0);
    else scrollToTarget(href);
  });
}

export { gsap, ScrollTrigger, SplitText };
