import { gsap } from 'gsap';

/**
 * The opening sequence.
 *   1. Instrument boot — the counter reports *real* progress (module load,
 *      scene build, staged shader warm-up) while the dial keeps spinning on
 *      the compositor thread.
 *   2. Collapse — the ring implodes into a singularity.
 *   3. Bang — white-out flash; the galaxy is born behind it (WebGL).
 */
const STATUS = ['Aligning telescopes', 'Compiling shaders', 'Seeding 170,000 stars', 'Folding spacetime', 'Ignition'];
const SVGNS = 'http://www.w3.org/2000/svg';

export function createPreloader({ reduced = false } = {}) {
  const root = document.querySelector('.loader');
  const num = root.querySelector('[data-loader-num]');
  const status = root.querySelector('[data-loader-status]');
  const ring = root.querySelector('.loader__ring');
  const spin = root.querySelector('.loader__spin');
  const progress = root.querySelector('.loader__ring-progress');
  const ticks = root.querySelector('.loader__ticks');
  const singularity = root.querySelector('.loader__singularity');
  const flash = root.querySelector('.loader__flash');
  const grid = root.querySelector('.loader__grid');
  const metas = root.querySelectorAll('.loader__meta');
  const ra = root.querySelector('[data-loader-ra]');
  const dec = root.querySelector('[data-loader-dec]');

  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const r2 = major ? 120 : 116;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', 120 + Math.cos(a) * 112);
    line.setAttribute('y1', 120 + Math.sin(a) * 112);
    line.setAttribute('x2', 120 + Math.cos(a) * r2);
    line.setAttribute('y2', 120 + Math.sin(a) * r2);
    if (major) line.setAttribute('class', 'is-major');
    ticks.appendChild(line);
  }
  const CIRC = 2 * Math.PI * 104;
  progress.style.strokeDasharray = String(CIRC);
  progress.style.strokeDashoffset = String(CIRC);

  gsap.from(metas, { opacity: 0, y: 8, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
  gsap.from([ring, spin], { scale: 0.86, opacity: 0, duration: 1.2, ease: 'expo.out' });

  let statusIndex = 0;
  const setStatus = (i) => {
    if (i === statusIndex) return;
    statusIndex = i;
    gsap
      .timeline()
      .to(status, { opacity: 0, y: -6, duration: 0.16, ease: 'power2.in' })
      .add(() => (status.textContent = STATUS[i]))
      .fromTo(status, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' });
  };

  // the shown value eases toward the reported target, never faster than it can be read
  const counter = { shown: 0, target: 0 };
  const render = () => {
    const v = counter.shown;
    num.textContent = String(Math.round(v)).padStart(3, '0');
    progress.style.strokeDashoffset = String(CIRC * (1 - v / 100));
    setStatus(Math.min(STATUS.length - 1, Math.floor((v / 100) * STATUS.length)));
    ra.textContent = `05h 35m ${(17.3 + v * 0.037).toFixed(1)}s`;
    dec.textContent = `−05° 23′ ${String(28 + Math.round(v * 0.11)).padStart(2, '0')}″`;
  };
  const tick = (time, deltaMs) => {
    const dt = Math.min(deltaMs, 100) / 1000;
    const gap = counter.target - counter.shown;
    if (gap > 0.01) {
      counter.shown += Math.min(gap, Math.max(gap * (1 - Math.exp(-dt * 4)), dt * (reduced ? 240 : 28)));
      render();
    }
  };
  gsap.ticker.add(tick);

  return {
    /** p ∈ [0, 1] — the dial holds at 96 until finish() */
    setProgress(p) {
      counter.target = Math.max(counter.target, Math.min(p, 1) * 96);
    },

    /**
     * Run to 100 → (optionally) wait for "Start" → collapse → bang.
     * onStart(withSound) is called synchronously inside the click, so audio can unlock.
     * Resolves when the overlay is gone.
     */
    finish({ onStart, onBang, gate = true } = {}) {
      counter.target = 100;
      return new Promise((resolve) => {
        const wait = () => {
          if (counter.shown < 99.5) return;
          gsap.ticker.remove(wait);
          gsap.ticker.remove(tick);
          counter.shown = 100;
          render();
          if (!gate) {
            onStart?.(false);
            exit(onBang, resolve);
            return;
          }
          awaitStart((withSound) => {
            onStart?.(withSound);
            exit(onBang, resolve);
          });
        };
        gsap.ticker.add(wait);
      });
    },
  };

  function awaitStart(go) {
    const box = root.querySelector('[data-loader-start]');
    const btn = box.querySelector('[data-start]');
    const wrap = box.querySelector('[data-start-wrap]');
    const silent = box.querySelector('[data-start-silent]');
    status.textContent = 'Systems nominal';
    box.classList.add('is-ready');
    // animate the wrapper: the button's own transform belongs to its glass physics
    gsap.fromTo(wrap, { opacity: 0, scale: 0.6, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 1.5, ease: 'elastic.out(1, 0.55)' });
    gsap.fromTo(silent, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.9, delay: 0.25, ease: 'power3.out' });
    // the dial "breathes" while it waits
    const breathe = gsap.to(ring, { scale: 1.035, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    // keyboard: Enter / Space starts (with sound) without forcing a focus ring on the button
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (document.activeElement === silent) return; // let the silent option handle itself
      e.preventDefault();
      fire(true);
    };
    document.addEventListener('keydown', onKey);
    let done = false;
    const fire = (withSound) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      breathe.kill();
      gsap.to(ring, { scale: 1, duration: 0.3 });
      gsap.to([wrap, silent], {
        opacity: 0,
        y: -10,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: () => box.classList.remove('is-ready'),
      });
      go(withSound);
    };
    btn.addEventListener('click', () => fire(true));
    silent.addEventListener('click', () => fire(false));
  }

  function exit(onBang, resolve) {
    const tl = gsap.timeline({
      onComplete: () => {
        root.style.display = 'none';
        root.setAttribute('aria-hidden', 'true');
        resolve();
      },
    });
    if (reduced) {
      tl.add(() => onBang?.(), 0).to(root, { opacity: 0, duration: 0.5 }, 0);
      return;
    }
    tl.to([num.parentElement, status], { y: -14, opacity: 0, duration: 0.45, ease: 'power3.in' }, 0.15)
      .to(metas, { opacity: 0, duration: 0.4, stagger: 0.04 }, '<')
      .to(grid, { opacity: 0, duration: 0.6 }, '<')
      .to([ring, spin], { scale: 0.04, rotation: 220, duration: 0.95, ease: 'expo.in' }, '<0.1')
      .to(singularity, { scale: 1.6, duration: 0.55, ease: 'expo.in' }, '-=0.45')
      .to(singularity, { scale: 0, duration: 0.2, ease: 'power2.in' })
      .addLabel('bang')
      .add(() => onBang?.(), 'bang')
      .set([ring, spin], { opacity: 0 }, 'bang')
      .fromTo(flash, { scale: 0.02, opacity: 1 }, { scale: 1, duration: 0.5, ease: 'expo.out' }, 'bang')
      .to(root, { backgroundColor: 'rgba(3,4,9,0)', duration: 0.25, ease: 'none' }, 'bang+=0.05')
      .to(flash, { opacity: 0, duration: 1.5, ease: 'power2.out' }, 'bang+=0.18')
      .add(() => (root.style.pointerEvents = 'none'), 'bang+=0.3');
  }
}
