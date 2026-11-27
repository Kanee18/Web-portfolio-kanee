import { profile, hero, about, projects, skills, experience, contact } from './content.js';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "*word*" → <em>word</em> (serif accent), everything else escaped. */
const accent = (s = '') => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
const plain = (s = '') => String(s).replace(/\*/g, '');
const pad = (n) => String(n).padStart(2, '0');

const sectionHead = (index, label, extra = '') => `
  <header class="section-head ${extra}" data-section-head>
    <span class="section-head__index">(${esc(index)})</span>
    <span class="section-head__line" aria-hidden="true"></span>
    <span class="section-head__label">${esc(label)}</span>
  </header>`;

const arrow = `<svg class="lg-btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>`;

/* ── sections ────────────────────────────────────────────────────────────── */
const heroSection = () => `
<section class="hero" id="top" data-section="hero" aria-label="Introduction">
  <div class="hero__meta container">
    <div class="hero__meta-col" data-hero-meta>
      <span class="label">(00)</span>
      <span class="label">${esc(hero.eyebrow)}</span>
    </div>
    <div class="hero__meta-col hero__meta-col--right" data-hero-meta>
      <span class="label">${esc(profile.role)}</span>
      <span class="label label--dim">${esc(profile.discipline)}</span>
    </div>
  </div>

  <div class="hero__bottom container">
    <p class="hero__tagline" data-hero-tagline>${accent(hero.tagline)}</p>
    <div class="hero__actions">
      <a class="lg lg-btn lg-btn--primary" href="#work" data-scroll-to data-magnetic data-hero-btn>
        <span class="lg-btn__label">Explore the work</span>${arrow}
      </a>
      <a class="lg lg-btn" href="#contact" data-scroll-to data-magnetic data-hero-btn>
        <span class="lg-btn__label">Get in touch</span>
      </a>
    </div>
  </div>

  <h1 class="hero__title" data-hero-title>
    <span class="sr-only">${esc(profile.name)} — ${esc(profile.role)}</span>
    <span class="hero__word" aria-hidden="true" data-hero-word>${esc(profile.wordmark)}</span>
  </h1>

  <div class="hero__scroll" data-hero-scroll aria-hidden="true">
    <span class="label">Scroll to launch</span>
    <span class="hero__scroll-track"><span class="hero__scroll-dot"></span></span>
  </div>
</section>`;

const aboutSection = () => `
<section class="about section" id="about" data-section="about" aria-labelledby="about-title">
  <div class="sticky about__sticky">
    <div class="container about__grid">
      ${sectionHead(about.index, about.label)}
      <h2 class="sr-only" id="about-title">About</h2>
      <p class="about__statement" data-reveal-words>${accent(about.statement)}</p>
      <div class="about__aside">
        <p class="about__bio" data-about-bio>${esc(about.bio)}</p>
        <ul class="about__stats" role="list">
          ${about.stats
            .map(
              (s) => `
            <li class="stat" data-stat>
              <span class="stat__value"><span data-count="${Number(s.value) || 0}">00</span>${esc(s.suffix)}</span>
              <span class="stat__label">${esc(s.label)}</span>
            </li>`
            )
            .join('')}
        </ul>
        <a class="lg lg-btn" href="${esc(profile.resume)}" data-magnetic data-about-btn>
          <span class="lg-btn__label">Download résumé</span>${arrow}
        </a>
      </div>
    </div>
  </div>
</section>`;

const workSection = () => `
<section class="work section" id="work" data-section="work" style="--count:${projects.length}" aria-labelledby="work-title">
  <div class="sticky work__sticky">
    <div class="container work__layout">
      <div class="work__head">
        ${sectionHead('02', 'Selected orbits')}
        <h2 class="work__title" id="work-title">Work in <em>orbit</em></h2>
      </div>

      <ol class="work__index" role="list" data-work-index>
        ${projects
          .map(
            (p, i) => `
          <li class="work__index-item${i === 0 ? ' is-active' : ''}" data-work-index-item="${i}">
            <button type="button" class="work__index-btn" data-work-goto="${i}" aria-label="Show project ${esc(p.name)}">
              <span class="work__index-num">${pad(i + 1)}</span>
              <span class="work__index-name">${esc(p.name)}</span>
            </button>
          </li>`
          )
          .join('')}
      </ol>

      <div class="work__panels" data-work-panels>
        ${projects
          .map(
            (p, i) => `
          <article class="work__panel${i === 0 ? ' is-active' : ''}" data-work-panel="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
            <div class="work__panel-top" data-wp-fade>
              <span class="work__num">${pad(i + 1)} / ${pad(projects.length)}</span>
              <span class="work__kind">${esc(p.kind)}</span>
            </div>
            <h3 class="work__name" data-wp-name>${esc(p.name)}</h3>
            <p class="work__desc" data-wp-fade>${esc(p.description)}</p>
            <dl class="work__meta" data-wp-fade>
              <div><dt>Year</dt><dd>${esc(p.year)}</dd></div>
              <div><dt>Role</dt><dd>${esc(p.role)}</dd></div>
            </dl>
            <ul class="work__stack" role="list">
              ${p.stack.map((s) => `<li class="lg chip" data-wp-chip>${esc(s)}</li>`).join('')}
            </ul>
            <a class="lg lg-btn" href="${esc(p.href)}" data-magnetic data-wp-btn data-cursor="View" tabindex="${i === 0 ? '0' : '-1'}">
              <span class="lg-btn__label">View case study</span>${arrow}
            </a>
          </article>`
          )
          .join('')}
      </div>

      <div class="work__progress" aria-hidden="true">
        <span class="work__counter"><span data-work-current>01</span><span class="work__counter-total"> / ${pad(projects.length)}</span></span>
        <span class="work__rail"><span class="work__rail-fill" data-work-fill></span></span>
      </div>
    </div>
  </div>
</section>`;

const skillsSection = () => {
  let n = 0;
  const all = skills.groups.flatMap((g) => g.items);
  return `
<section class="skills section" id="skills" data-section="skills" aria-labelledby="skills-title">
  <div class="sticky skills__sticky">
    <div class="skills__labels" aria-hidden="true" data-star-labels>
      ${all.map((s, i) => `<span class="star-label" data-star-label="${i}"><i>${pad(i + 1)}</i>${esc(s)}</span>`).join('')}
    </div>
    <div class="container skills__layout">
      <div class="skills__head">
        ${sectionHead(skills.index, skills.label)}
        <h2 class="skills__title" id="skills-title" data-split-title>A constellation of <em>crafts</em></h2>
      </div>
      <div class="skills__groups">
        ${skills.groups
          .map(
            (g) => `
          <div class="skills__group">
            <h3 class="skills__group-title" data-skill-fade>${esc(g.title)}</h3>
            <ul class="skills__list" role="list">
              ${g.items.map((s) => `<li class="lg chip" data-skill-chip data-star-chip="${n++}">${esc(s)}</li>`).join('')}
            </ul>
          </div>`
          )
          .join('')}
      </div>
    </div>
  </div>
</section>`;
};

const journeySection = () => `
<section class="journey section" id="journey" data-section="journey" aria-labelledby="journey-title">
  <div class="container journey__layout">
    <div class="journey__head">
      ${sectionHead(experience.index, experience.label)}
      <h2 class="journey__title" id="journey-title" data-split-title>Seven years,<br />one <em>trajectory</em></h2>
    </div>
    <div class="journey__track">
    <span class="journey__line" aria-hidden="true"><span class="journey__line-fill" data-journey-line></span></span>
    <ol class="journey__list" role="list">
      ${experience.items
        .map(
          (e) => `
        <li class="journey__item" data-journey-item>
          <span class="journey__dot" aria-hidden="true"></span>
          <span class="journey__period">${esc(e.period)}</span>
          <div class="journey__body">
            <h3 class="journey__role">${esc(e.role)}</h3>
            <span class="journey__company">${esc(e.company)}</span>
          </div>
          <p class="journey__summary">${esc(e.summary)}</p>
        </li>`
        )
        .join('')}
    </ol>
    </div>
  </div>
</section>`;

const contactSection = () => `
<section class="contact section" id="contact" data-section="contact" aria-labelledby="contact-title">
  <div class="contact__sticky">
  <div class="contact__inner">
    ${sectionHead(contact.index, contact.label, 'section-head--center')}
    <p class="contact__kicker" data-contact-kicker>${esc(contact.kicker)}</p>
    <h2 class="contact__headline" id="contact-title" data-contact-headline>${esc(contact.headline)}</h2>
    <a class="lg lg-btn lg-btn--xl contact__email" href="mailto:${esc(profile.email)}" data-magnetic data-contact-email data-cursor="Write">
      <span class="lg-btn__label">${esc(profile.email)}</span>${arrow}
    </a>
    <p class="contact__availability label" data-contact-fade><span class="pulse-dot" aria-hidden="true"></span>${esc(profile.availability)}</p>
    <ul class="contact__socials" role="list">
      ${profile.socials.map((s) => `<li data-contact-fade><a class="link-underline" href="${esc(s.href)}">${esc(s.label)}</a></li>`).join('')}
    </ul>
  </div>

  <footer class="footer container">
    <span class="label">© ${new Date().getFullYear()} ${esc(profile.name)}</span>
    <span class="label">${esc(profile.basedIn)} · <time data-clock>--:--:--</time></span>
    <span class="label footer__credit">Hand-built with Three.js, GSAP &amp; Lenis</span>
    <button class="lg lg-btn lg-btn--sm" type="button" data-back-top data-magnetic>
      <span class="lg-btn__label">Back to top</span>
      <svg class="lg-btn__icon lg-btn__icon--up" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 12l6-6 6 6" /></svg>
    </button>
  </footer>
  </div>
</section>`;

export function renderContent(root) {
  root.innerHTML = [heroSection(), aboutSection(), workSection(), skillsSection(), journeySection(), contactSection()].join('');
  document.querySelectorAll('[data-brand-name]').forEach((el) => (el.textContent = profile.wordmark));
  document.title = `${plain(profile.name)} — ${profile.role} · A portfolio in orbit`;
}

export const skillList = skills.groups.flatMap((g) => g.items);
