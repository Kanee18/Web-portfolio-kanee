import { gsap, ScrollTrigger, SplitText, scrollToTarget } from './core/scroll.js';
import { state } from './core/state.js';
import { profile } from './content.js';

/* ═══════════════════════════════════════════════════════════════════════
   DOM choreography. Everything scroll-linked uses `scrub: true` so it is
   driven 1:1 by Lenis' smoothed position — in the same frame as the WebGL.
   Glass elements are always animated individually (never via an ancestor's
   opacity) so their backdrop keeps seeing the scene.
   ═══════════════════════════════════════════════════════════════════════ */

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

/* ── hero ─────────────────────────────────────────────────────────────── */
function fitWordmark(word) {
  const title = word.parentElement;
  const cs = getComputedStyle(title);
  const avail = title.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  word.style.setProperty('--word-size', '100px');
  const w = word.getBoundingClientRect().width || 1;
  const size = Math.min((avail / w) * 100 * 0.995, window.innerHeight * 0.5);
  word.style.setProperty('--word-size', `${size.toFixed(2)}px`);
}

function prepareHero() {
  const word = q('[data-hero-word]');
  const text = word.textContent.trim();
  word.innerHTML = [...text]
    .map((ch) => `<span class="hero__char"><span class="hero__glyph">${ch === ' ' ? '&nbsp;' : ch}</span></span>`)
    .join('');
  // the gradient lives on the glyph so transforms on the outer char never break background-clip
  qa('.hero__glyph', word).forEach((g) => g.classList.add('hero__char-fill'));
  fitWordmark(word);
  window.addEventListener('resize', () => fitWordmark(word));

  const chars = qa('.hero__char', word);
  const glyphs = qa('.hero__glyph', word);
  const tagline = q('[data-hero-tagline]');
  const taglineSplit = SplitText.create(tagline, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
  const metas = qa('[data-hero-meta] .label');
  const buttons = qa('[data-hero-btn]');
  const scrollCue = q('[data-hero-scroll]');

  gsap.set(chars, { yPercent: 118, rotateX: -75, opacity: 0, transformOrigin: '50% 100%' });
  gsap.set(taglineSplit.lines, { yPercent: 110 });
  gsap.set(metas, { opacity: 0, y: 10 });
  gsap.set(buttons, { opacity: 0, scale: 0.6, y: 24 });
  gsap.set(scrollCue, { opacity: 0 });

  // pointer "gravity": letters near the cursor lift and lean toward it
  let active = 1;
  const lifts = glyphs.map((g) => ({
    y: gsap.quickTo(g, 'y', { duration: 0.9, ease: 'power3.out' }),
    r: gsap.quickTo(g, 'rotationY', { duration: 0.9, ease: 'power3.out' }),
  }));
  let rects = [];
  const measure = () => (rects = glyphs.map((g) => g.getBoundingClientRect()));
  if (!state.isTouch) {
    window.addEventListener('resize', measure);
    gsap.ticker.add(() => {
      if (!state.introDone || active <= 0.01) return;
      if (!rects.length) measure();
      const px = state.pointer.x;
      const py = state.pointer.y;
      rects.forEach((r, i) => {
        const cx = r.left + r.width / 2;
        const dx = (px - cx) / (r.width * 1.3);
        const vy = Math.max(0, 1 - Math.abs(py - (r.top + r.height * 0.5)) / (window.innerHeight * 0.75));
        const f = Math.exp(-dx * dx) * vy * active;
        lifts[i].y(-f * r.height * 0.09);
        lifts[i].r(Math.max(-1, Math.min(1, dx)) * -14 * f);
      });
    });
  }

  // scroll-out: letters drift apart and rise at different speeds
  const mid = (chars.length - 1) / 2;
  const out = gsap.timeline({
    scrollTrigger: {
      trigger: '#top',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => (active = 1 - self.progress * 3),
      onRefresh: measure,
    },
  });
  out
    .to(chars, { y: (i) => -(window.innerHeight * (0.16 + Math.abs(i - mid) * 0.05)), x: (i) => (i - mid) * window.innerWidth * 0.035, rotation: (i) => (i - mid) * 3, ease: 'none' }, 0)
    .to(chars, { opacity: 0, ease: 'power1.in', duration: 0.42, stagger: { each: 0.02, from: 'center' } }, 0.08)
    .to([tagline, ...metas], { y: -90, opacity: 0, ease: 'power1.in', duration: 0.24 }, 0)
    .to('.hero__actions', { y: -120, ease: 'none' }, 0)
    .to(buttons, { opacity: 0, ease: 'power2.in', duration: 0.22 }, 0)
    .to(scrollCue, { opacity: 0, ease: 'none', duration: 0.12 }, 0);

  // intro (played after the bang)
  return function playHero() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to(chars, { yPercent: 0, rotateX: 0, opacity: 1, duration: 1.9, stagger: 0.075 }, 0.15)
      .to(taglineSplit.lines, { yPercent: 0, duration: 1.4, stagger: 0.09 }, 0.75)
      .to(metas, { opacity: 1, y: 0, duration: 1.2, stagger: 0.06 }, 0.8)
      .to(buttons, { opacity: 1, scale: 1, y: 0, duration: 1.6, stagger: 0.12, ease: 'elastic.out(1, 0.55)' }, 1.05)
      .to(scrollCue, { opacity: 1, duration: 1 }, 1.6)
      .add(() => measure(), 2.2);
    return tl;
  };
}

function introChrome() {
  const brand = q('.brand');
  const nav = q('[data-nav]');
  const actions = qa('.header__actions > *');
  gsap.set([brand, nav, ...actions], { opacity: 0, y: -24 });
  return () =>
    gsap
      .timeline({ defaults: { ease: 'expo.out', duration: 1.4 } })
      .to(brand, { opacity: 1, y: 0 }, 0.5)
      .to(nav, { opacity: 1, y: 0 }, 0.62)
      .to(actions, { opacity: 1, y: 0, stagger: 0.08 }, 0.7);
}

/* ── shared reveals ──────────────────────────────────────────────────── */
function revealHead(head, trigger) {
  const line = q('.section-head__line', head);
  const parts = qa('.section-head__index, .section-head__label', head);
  gsap.set(line, { scaleX: 0 });
  gsap.set(parts, { opacity: 0, y: 8 });
  gsap
    .timeline({ scrollTrigger: { trigger: trigger || head, start: 'top 82%', toggleActions: 'play none none reverse' } })
    .to(line, { scaleX: 1, duration: 1.2, ease: 'expo.out' }, 0)
    .to(parts, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, 0.1);
}

function revealTitle(el, start = 'top 80%') {
  const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
  gsap.set(split.lines, { yPercent: 105 });
  gsap.to(split.lines, {
    yPercent: 0,
    duration: 1.4,
    stagger: 0.1,
    ease: 'expo.out',
    scrollTrigger: { trigger: el, start, toggleActions: 'play none none reverse' },
  });
  return split;
}

/* ── about ───────────────────────────────────────────────────────────── */
function initAbout() {
  revealHead(q('#about [data-section-head]'), '#about');
  const statement = q('[data-reveal-words]');
  const split = SplitText.create(statement, { type: 'words', wordsClass: 'word' });
  gsap.set(split.words, { opacity: 0.13 });
  gsap
    .timeline({ scrollTrigger: { trigger: '#about', start: 'top 35%', end: 'bottom 135%', scrub: true } })
    .to(split.words, { opacity: 1, stagger: 0.1, ease: 'none', duration: 0.5 });

  const bio = q('[data-about-bio]');
  const stats = qa('[data-stat]');
  const btn = q('[data-about-btn]');
  gsap.set([bio, ...stats], { opacity: 0, y: 26 });
  gsap.set(btn, { opacity: 0, scale: 0.7 });
  const counters = qa('[data-count]');
  ScrollTrigger.create({
    trigger: '#about',
    start: 'top -25%',
    onEnter: () => {
      gsap.to(bio, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out' });
      gsap.to(stats, { opacity: 1, y: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out', delay: 0.1 });
      gsap.to(btn, { opacity: 1, scale: 1, duration: 1.5, ease: 'elastic.out(1, 0.5)', delay: 0.3 });
      counters.forEach((c) => {
        const o = { v: 0 };
        gsap.to(o, {
          v: Number(c.dataset.count),
          duration: 2,
          ease: 'power3.out',
          delay: 0.2,
          onUpdate: () => (c.textContent = String(Math.round(o.v)).padStart(2, '0')),
        });
      });
    },
    onLeaveBack: () => {
      gsap.to([bio, ...stats], { opacity: 0, y: 26, duration: 0.5 });
      gsap.to(btn, { opacity: 0, scale: 0.7, duration: 0.5 });
    },
  });
}

/* ── work ────────────────────────────────────────────────────────────── */
function initWork(experience) {
  revealHead(q('#work [data-section-head]'), '#work');
  revealTitle(q('#work-title'), 'top 72%');

  const panels = qa('[data-work-panel]');
  const indexItems = qa('[data-work-index-item]');
  const current = q('[data-work-current]');
  const fill = q('[data-work-fill]');
  gsap.set(indexItems, { opacity: 0, x: -14 });
  gsap.to(indexItems, {
    opacity: 1,
    x: 0,
    stagger: 0.07,
    duration: 1,
    ease: 'expo.out',
    scrollTrigger: { trigger: '#work', start: 'top 40%', toggleActions: 'play none none reverse' },
  });

  // long project names shrink to fit the panel instead of wrapping mid-word
  const names = qa('[data-wp-name]');
  const fitNames = () => {
    const avail = q('[data-work-panels]').clientWidth;
    names.forEach((n) => {
      n.style.fontSize = '';
      const w = n.scrollWidth;
      if (w > avail) n.style.fontSize = `${((parseFloat(getComputedStyle(n).fontSize) * avail) / w) * 0.98}px`;
    });
  };
  fitNames();
  window.addEventListener('resize', fitNames);

  const parts = panels.map((p) => {
    const name = q('[data-wp-name]', p);
    const split = SplitText.create(name, { type: 'chars,lines', mask: 'lines', linesClass: 'split-line' });
    return {
      el: p,
      chars: split.chars,
      fades: qa('[data-wp-fade]', p),
      chips: qa('[data-wp-chip]', p),
      btn: q('[data-wp-btn]', p),
    };
  });
  parts.forEach((p, i) => {
    if (i === 0) return;
    gsap.set(p.chars, { yPercent: 110 });
    gsap.set(p.fades, { opacity: 0, y: 24 });
    gsap.set(p.chips, { opacity: 0, y: 12 });
    gsap.set(p.btn, { opacity: 0, scale: 0.8 });
  });
  // first panel enters with the section
  const first = parts[0];
  gsap.set(first.chars, { yPercent: 110 });
  gsap.set(first.fades, { opacity: 0, y: 24 });
  gsap.set(first.chips, { opacity: 0, y: 12 });
  gsap.set(first.btn, { opacity: 0, scale: 0.8 });
  const showPanel = (p, dir = 1) =>
    gsap
      .timeline()
      .fromTo(p.chars, { yPercent: 110 * dir }, { yPercent: 0, duration: 1.1, stagger: 0.035, ease: 'expo.out', overwrite: true }, 0)
      .fromTo(p.fades, { opacity: 0, y: 24 * dir }, { opacity: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out', overwrite: true }, 0.12)
      .fromTo(p.chips, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.04, ease: 'power3.out', overwrite: true }, 0.25)
      .fromTo(p.btn, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 1.3, ease: 'elastic.out(1, 0.5)', overwrite: true }, 0.35);
  const hidePanel = (p, dir = 1) =>
    gsap
      .timeline({ onComplete: () => p.el.classList.remove('is-active') })
      .to(p.chars, { yPercent: -110 * dir, duration: 0.55, stagger: 0.02, ease: 'power3.in', overwrite: true }, 0)
      .to(p.fades, { opacity: 0, y: -18 * dir, duration: 0.4, ease: 'power2.in', overwrite: true }, 0)
      .to(p.chips, { opacity: 0, duration: 0.3, overwrite: true }, 0)
      .to(p.btn, { opacity: 0, scale: 0.85, duration: 0.35, overwrite: true }, 0);

  let shown = false;
  ScrollTrigger.create({
    trigger: '#work',
    start: 'top 35%',
    onEnter: () => {
      if (shown) return;
      shown = true;
      const p = parts[experience.workIndex] || first;
      p.el.classList.add('is-active');
      showPanel(p);
    },
    onLeaveBack: () => {
      shown = false;
      parts.forEach((p) => hidePanel(p));
    },
  });

  experience.onWorkIndex((idx, prev) => {
    const dir = idx > prev ? 1 : -1;
    indexItems.forEach((it, i) => it.classList.toggle('is-active', i === idx));
    current.textContent = String(idx + 1).padStart(2, '0');
    gsap.fromTo(current, { yPercent: 60 * dir, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out' });
    parts.forEach((p, i) => {
      const isActive = i === idx;
      p.el.setAttribute('aria-hidden', String(!isActive));
      if (p.btn) p.btn.tabIndex = isActive ? 0 : -1;
    });
    if (!shown) return;
    if (parts[prev]) hidePanel(parts[prev], dir);
    const next = parts[idx];
    if (next) {
      next.el.classList.add('is-active');
      showPanel(next, dir).delay(0.18);
    }
  });

  gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#work', start: 'top top', end: 'bottom bottom', scrub: true } });

  // index → fly the orbit to that project (the moon carousel follows the scroll)
  const work = q('#work');
  qa('[data-work-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.workGoto);
      const n = Math.max(panels.length - 1, 1);
      const top = work.getBoundingClientRect().top + window.scrollY;
      const span = work.offsetHeight - window.innerHeight;
      scrollToTarget(top + span * (i / n), { duration: 1.6 });
    })
  );
}

/* ── skills ──────────────────────────────────────────────────────────── */
function initSkills(experience) {
  revealHead(q('#skills [data-section-head]'), '#skills');
  revealTitle(q('#skills-title'), 'top 72%');
  const titles = qa('[data-skill-fade]');
  const chips = qa('[data-skill-chip]');
  gsap.set(titles, { opacity: 0, y: 10 });
  gsap.set(chips, { opacity: 0, y: 14, scale: 0.9 });
  gsap
    .timeline({ scrollTrigger: { trigger: '#skills', start: 'top 25%', toggleActions: 'play none none reverse' } })
    .to(titles, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' }, 0)
    .to(chips, { opacity: 1, y: 0, scale: 1, duration: 1.1, stagger: 0.035, ease: 'elastic.out(1, 0.6)' }, 0.1);

  chips.forEach((c) => {
    const i = Number(c.dataset.starChip);
    c.addEventListener('pointerenter', () => experience.setSkillHover(i));
    c.addEventListener('pointerleave', () => experience.setSkillHover(-1));
  });
  experience.bindStarLabels(qa('[data-star-label]'), chips);
}

/* ── journey ─────────────────────────────────────────────────────────── */
function initJourney() {
  revealHead(q('#journey [data-section-head]'), '#journey');
  revealTitle(q('#journey-title'), 'top 75%');
  const line = q('[data-journey-line]');
  gsap.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.journey__track', start: 'top 62%', end: 'bottom 62%', scrub: true } });
  qa('[data-journey-item]').forEach((item) => {
    const kids = qa('.journey__period, .journey__body, .journey__summary', item);
    gsap.set(kids, { opacity: 0, y: 34 });
    gsap.to(kids, {
      opacity: 1,
      y: 0,
      duration: 1.2,
      stagger: 0.08,
      ease: 'expo.out',
      scrollTrigger: { trigger: item, start: 'top 82%', toggleActions: 'play none none reverse' },
    });
    ScrollTrigger.create({ trigger: item, start: 'top 62%', toggleClass: { targets: item, className: 'is-lit' } });
  });
}

/* ── contact ─────────────────────────────────────────────────────────── */
function initContact() {
  revealHead(q('#contact [data-section-head]'), '#contact');
  const headline = q('[data-contact-headline]');
  const split = SplitText.create(headline, { type: 'chars', charsClass: 'char' });
  const n = split.chars.length;
  // letters fall in along an accretion spiral, scrubbed by the approach
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#contact', start: 'top 95%', end: 'top 5%', scrub: true } });
  split.chars.forEach((c, i) => {
    const a = (i / n) * Math.PI * 2 + 0.6;
    const r = window.innerWidth * (0.42 + (i % 3) * 0.08);
    tl.fromTo(
      c,
      { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, rotation: (a * 180) / Math.PI + 90, scale: 0.25, opacity: 0 },
      { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, ease: 'power3.out', duration: 1 },
      i * 0.04
    );
  });

  const kicker = q('[data-contact-kicker]');
  const email = q('[data-contact-email]');
  const fades = qa('[data-contact-fade]');
  gsap.set([kicker, ...fades], { opacity: 0, y: 18 });
  gsap.set(email, { opacity: 0, scale: 0.7 });
  gsap
    .timeline({ scrollTrigger: { trigger: '#contact', start: 'top 18%', toggleActions: 'play none none reverse' } })
    .to(kicker, { opacity: 1, y: 0, duration: 1, ease: 'expo.out' }, 0)
    .to(email, { opacity: 1, scale: 1, duration: 1.6, ease: 'elastic.out(1, 0.5)' }, 0.15)
    .to(fades, { opacity: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.3);

  // local clock
  const clock = q('[data-clock]');
  const tz = profile.timezone || undefined;
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz });
  const tick = () => (clock.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 1000);

  q('[data-back-top]')?.addEventListener('click', () => scrollToTarget(0, { duration: 4.2 }));
}

/* ── entry ───────────────────────────────────────────────────────────── */
export function initSections({ experience }) {
  const playHero = prepareHero();
  const playChrome = introChrome();
  initAbout();
  initWork(experience);
  initSkills(experience);
  initJourney();
  initContact();
  return {
    playIntro() {
      playChrome();
      return playHero();
    },
  };
}
