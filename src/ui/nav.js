import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { lenis, scrollToTarget } from '../core/scroll.js';

/**
 * Liquid nav: a glass lens travels between links, stretching mid-flight and
 * wobbling as it lands. The active link follows the section in view.
 */
export function initNav() {
  const wrap = document.querySelector('[data-nav-wrap]');
  const nav = document.querySelector('[data-nav]');
  const blob = document.querySelector('[data-nav-blob]');
  const links = [...document.querySelectorAll('[data-nav-link]')];
  if (!nav || !blob || !links.length) return {};

  let current = null;
  const place = (link, animate = true) => {
    const wr = wrap.getBoundingClientRect();
    const lr = link.getBoundingClientRect();
    const x = lr.left - wr.left;
    if (!animate) {
      gsap.set(blob, { x, width: lr.width });
      return;
    }
    const from = gsap.getProperty(blob, 'x');
    const dist = Math.abs(x - from);
    const stretch = Math.min(dist / 260, 0.45);
    gsap.killTweensOf(blob, 'x,scaleX,scaleY');
    gsap.to(blob, { x, width: lr.width, duration: 0.85, ease: 'expo.out' });
    gsap
      .timeline()
      .to(blob, { scaleX: 1 + stretch, scaleY: 1 - stretch * 0.35, duration: 0.22, ease: 'power2.out' })
      .to(blob, { scaleX: 1, scaleY: 1, duration: 1.1, ease: 'elastic.out(1.1, 0.32)' });
  };

  const setActive = (id) => {
    const link = links.find((l) => l.dataset.navLink === id) || null;
    if (link === current) return;
    current = link;
    links.forEach((l) => l.classList.toggle('is-active', l === link));
    if (!link) {
      gsap.to(blob, { opacity: 0, scale: 0.85, duration: 0.5, ease: 'power3.out' });
      return;
    }
    const wasHidden = gsap.getProperty(blob, 'opacity') < 0.5;
    if (wasHidden) {
      place(link, false);
      gsap.fromTo(blob, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.45)' });
    } else place(link, true);
  };

  ['about', 'work', 'skills', 'journey', 'contact'].forEach((id) => {
    ScrollTrigger.create({
      trigger: `#${id}`,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => self.isActive && setActive(id),
    });
  });
  ScrollTrigger.create({
    trigger: '#top',
    start: 'top top',
    end: 'bottom 55%',
    onToggle: (self) => self.isActive && setActive(null),
  });

  // hover preview: the lens leans toward the hovered link
  links.forEach((l) => {
    l.addEventListener('pointerenter', () => {
      if (!current || l === current) return;
      const wr = wrap.getBoundingClientRect();
      const cr = current.getBoundingClientRect();
      const lr = l.getBoundingClientRect();
      const lean = (lr.left - cr.left) * 0.12;
      gsap.to(blob, { x: cr.left - wr.left + lean, duration: 0.6, ease: 'power3.out' });
    });
    l.addEventListener('pointerleave', () => current && place(current, true));
  });

  window.addEventListener('resize', () => current && place(current, false));

  // mobile menu
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    const items = menu.querySelectorAll('a');
    const open = () => {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.querySelector('.lg-btn__label').textContent = 'Close';
      lenis.stop();
      gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      gsap.fromTo(items, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'expo.out' });
    };
    const close = (then) => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.querySelector('.lg-btn__label').textContent = 'Menu';
      gsap.to(menu, {
        opacity: 0,
        duration: 0.35,
        onComplete: () => {
          menu.hidden = true;
          lenis.start();
          then?.();
        },
      });
    };
    toggle.addEventListener('click', () => (menu.hidden ? open() : close()));
    items.forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const href = a.getAttribute('href');
        close(() => scrollToTarget(href));
      })
    );
  }

  return { setActive };
}
