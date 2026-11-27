import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import 'lenis/dist/lenis.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/ui.css';
import './styles/sections.css';

import { renderContent, skillList } from './render.js';
import { projects } from './content.js';
import { lenis, gsap, ScrollTrigger, bindScrollLinks } from './core/scroll.js';
import { state, detectQuality } from './core/state.js';
import { Journey } from './core/journey.js';
import { initLiquidGlass, LiquidGlass } from './ui/liquidGlass.js';
import { initCursor } from './ui/cursor.js';
import { initNav } from './ui/nav.js';
import { initHud } from './ui/hud.js';
import { createPreloader } from './ui/preloader.js';
import { Soundtrack } from './ui/audio.js';
import { initSections } from './sections.js';

/*
 * Boot order is tuned for a fast first paint:
 *   1. this small entry chunk paints the loader immediately
 *   2. the WebGL layer (three.js + scenes) is a separate chunk, fetched next
 *   3. shaders are warmed stage-by-stage while the loader reports progress
 *   4. the bang → hero intro → Lenis starts
 */

const params = new URLSearchParams(location.search);
const reduced = state.reducedMotion || params.has('reduced');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

renderContent(document.querySelector('[data-main]'));
lenis.stop();
const loader = createPreloader({ reduced: reduced || params.has('fast') });
const soundtrack = new Soundtrack(); // starts fetching + decoding the music right away

/* ── fallback when WebGL is unavailable: same interface, no 3D ───────── */
class FallbackExperience {
  constructor(count) {
    this.count = count;
    this.workIndex = 0;
    this.warp = 0;
    this.cbs = [];
  }
  onWorkIndex(cb) {
    this.cbs.push(cb);
  }
  bindStarLabels() {}
  setSkillHover() {}
  holdIntro() {}
  playIntro() {
    return gsap.timeline();
  }
  update(time, dt, T) {
    const idx = Math.round(Math.min(Math.max(T - 3, 0), 1) * (this.count - 1));
    if (idx !== this.workIndex) {
      const prev = this.workIndex;
      this.workIndex = idx;
      this.cbs.forEach((cb) => cb(idx, prev));
    }
  }
  telemetry() {
    return { speed: 0, warp: 0, distance: 0, position: { x: 0, y: 0, z: 0 }, T: 0 };
  }
}

async function createExperience() {
  const canvas = document.querySelector('canvas.webgl');
  try {
    const { Experience } = await import('./webgl/Experience.js');
    performance.mark('cosmos:imported');
    loader.setProgress(0.12);
    await nextFrame();
    const quality = detectQuality();
    performance.mark('cosmos:boot');
    const experience = new Experience(canvas, { quality, projects, skills: skillList });
    performance.mark('cosmos:scene-built');
    loader.setProgress(0.22);
    await nextFrame();
    await experience.compileStaged((p) => loader.setProgress(0.22 + p * 0.7));
    performance.mark('cosmos:compiled');
    return experience;
  } catch (err) {
    console.error('[cosmos] WebGL unavailable — running without the 3D layer.', err);
    document.documentElement.classList.add('no-webgl');
    canvas?.remove();
    return new FallbackExperience(projects.length);
  }
}

async function boot() {
  performance.mark('cosmos:entry');
  // let the loader paint before anything heavy runs
  await nextFrame();
  await nextFrame();
  performance.mark('cosmos:painted');

  const experience = await createExperience();
  const journey = new Journey();
  experience.holdIntro();

  // one loop for everything — runs on GSAP's ticker right after Lenis' raf
  gsap.ticker.add((time, deltaMs) => {
    const T = journey.T;
    state.journeyT = T;
    experience.update(time, deltaMs / 1000, T);
    soundtrack.update(experience.warp || 0);
  });

  if (document.fonts) await document.fonts.ready;
  const sections = initSections({ experience });
  initLiquidGlass();
  initNav();
  initCursor();
  initHud(experience);
  bindScrollLinks();
  ScrollTrigger.refresh();
  loader.setProgress(1);

  // sound: header toggle mirrors the soundtrack state
  const soundBtn = document.querySelector('[data-sound]');
  soundtrack.onChange((on) => {
    soundBtn?.classList.toggle('is-on', on);
    soundBtn?.setAttribute('aria-pressed', String(on));
  });
  soundBtn?.addEventListener('click', () => soundtrack.toggle());
  LiquidGlass.onHover = (inst) => soundtrack.ping(inst.node.classList.contains('lg-btn--primary') ? 0.84 : 1);

  await loader.finish({
    gate: !params.has('fast'), // ?fast skips the Start gate (handy for automated checks)
    onStart: (withSound) => withSound && soundtrack.start(),
    onBang: () => {
      experience.playIntro(reduced);
      sections.playIntro();
      document.documentElement.classList.remove('is-loading');
      gsap.delayedCall(reduced ? 0.2 : 1.4, () => {
        lenis.start();
        ScrollTrigger.refresh();
      });
      gsap.delayedCall(reduced ? 0.2 : 2.6, () => (state.introDone = true));
    },
  });

  // deep-link a journey time for review: ?t=5.4
  if (params.has('t')) {
    lenis.start();
    lenis.scrollTo(journey.scrollFor(parseFloat(params.get('t')) || 0), { immediate: true, force: true });
  }

  if (params.has('debug') || import.meta.env.DEV) {
    window.__cosmos = { lenis, experience, journey, gsap, ScrollTrigger, state };
    window.__soundtrack = soundtrack;
  }
}

boot();
