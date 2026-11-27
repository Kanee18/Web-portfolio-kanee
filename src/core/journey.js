import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { lenis } from './scroll.js';

/**
 * Converts the page scroll into "journey time" T ∈ [0, 10].
 * Each segment is a contiguous scroll range bound to real DOM sections, so the
 * mapping survives any viewport size or content change (ScrollTrigger refresh).
 */
const SEGMENTS = [
  ['#about', 'top bottom', 'top top'], // 0 hero → about
  ['#about', 'top top', 'bottom bottom'], // 1 about pinned
  ['#work', 'top bottom', 'top top'], // 2 → work
  ['#work', 'top top', 'bottom bottom'], // 3 work pinned
  ['#skills', 'top bottom', 'top top'], // 4 → skills
  ['#skills', 'top top', 'bottom bottom'], // 5 skills pinned
  ['#journey', 'top bottom', 'top top'], // 6 → journey
  ['#journey', 'top top', 'bottom bottom'], // 7 journey
  ['#contact', 'top bottom', 'top top'], // 8 → contact
  ['#contact', 'top top', 'bottom bottom'], // 9 contact pinned
];

export class Journey {
  constructor() {
    this.triggers = SEGMENTS.map(([trigger, start, end]) => ScrollTrigger.create({ trigger, start, end }));
  }

  /** exact T for the current (smoothed) Lenis scroll position */
  get T() {
    const y = lenis.animatedScroll;
    let t = 0;
    for (const st of this.triggers) {
      const span = st.end - st.start;
      if (span <= 0) {
        t += y >= st.end ? 1 : 0;
        continue;
      }
      t += Math.min(Math.max((y - st.start) / span, 0), 1);
    }
    return t;
  }

  /** scroll position for a given T (used by the debug panel) */
  scrollFor(T) {
    const i = Math.min(Math.floor(T), this.triggers.length - 1);
    const st = this.triggers[i];
    return st.start + (st.end - st.start) * (T - i);
  }
}
