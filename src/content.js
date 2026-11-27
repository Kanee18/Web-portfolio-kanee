/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PORTFOLIO CONTENT — edit this file to make the site yours.
 *  Everything rendered on the page (and the 3D moons + constellation) is driven
 *  from here, so you never have to touch the markup or the WebGL code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const profile = {
  /** Big wordmark in the hero. Short, uppercase names (4–7 letters) look best. */
  wordmark: 'KANEE',
  name: 'Kanee',
  role: 'Creative Developer',
  discipline: 'WebGL · Motion · Interface',
  /** Shown in the hero meta row & footer. */
  basedIn: 'Orion Arm, Milky Way',
  /** IANA zone for the "local time" readout, e.g. 'Asia/Jakarta'. Leave empty to use the visitor's zone. */
  timezone: '',
  email: 'Kanee@gmail.com',
  availability: 'Accepting new missions — Q1 2027',
  socials: [
    { label: 'GitHub', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'Dribbble', href: '#' },
    { label: 'X / Twitter', href: '#' },
  ],
  resume: '#',
};

export const hero = {
  eyebrow: 'Portfolio — Edition 2026',
  // Words wrapped in *asterisks* render in the italic serif accent.
  tagline: 'I build *gravitational* digital experiences — where code, motion and light collide.',
};

export const about = {
  index: '01',
  label: 'Origin',
  // The statement lights up word-by-word as you scroll. *Asterisks* = serif accent.
  statement:
    'I treat the browser like a telescope — pointing it at the *unknown* and shaping whatever comes back into interfaces that feel *alive*. Engineering rigour, cinematic motion, and an obsession with the last *1%*.',
  bio: 'Seven years crafting immersive products for studios, startups and cultural institutions. I lead projects from first sketch to shipped shader — art direction, interaction design and production-grade front-end engineering under one roof.',
  stats: [
    { value: 7, suffix: '+', label: 'Years in orbit' },
    { value: 64, suffix: '', label: 'Launches shipped' },
    { value: 18, suffix: '', label: 'Awards & mentions' },
  ],
};

/**
 * Each project becomes a moon in the "Orbits" section.
 * `world` picks the procedural surface: 'lava' | 'ice' | 'terra' | 'gas'
 * `palette` = 4 colours from deep → bright used by the moon shader.
 */
export const projects = [
  {
    name: 'Helios',
    kind: 'Real-time solar weather observatory',
    year: '2026',
    role: 'Lead creative developer',
    stack: ['WebGL', 'GLSL', 'D3', 'WebSockets'],
    description:
      'A live telescope feed turned into an explorable sun. 40k data points per second rendered as plasma, flares and magnetic loops — at 120fps.',
    href: '#',
    world: 'lava',
    palette: ['#1a0602', '#6b1a06', '#ff6a1a', '#ffd38a'],
  },
  {
    name: 'Aurora OS',
    kind: 'Design system & motion language',
    year: '2025',
    role: 'Design engineer',
    stack: ['React', 'TypeScript', 'Figma', 'GSAP'],
    description:
      'A component library and choreography spec for a fintech super-app. 140 components, one motion grammar, zero dropped frames.',
    href: '#',
    world: 'ice',
    palette: ['#06121f', '#1d4f73', '#7cc8e8', '#eaf8ff'],
  },
  {
    name: 'Driftwood',
    kind: 'Immersive 3D product configurator',
    year: '2025',
    role: 'Creative technologist',
    stack: ['Three.js', 'R3F', 'Blender', 'Shopify'],
    description:
      'Configure an e-bike in a living diorama. Physically based materials, baked lighting and a 38% lift in conversion after launch.',
    href: '#',
    world: 'terra',
    palette: ['#04142a', '#0f5a6e', '#6e8b3d', '#e9dcc0'],
  },
  {
    name: 'Resonance',
    kind: 'Generative audio-visual installation',
    year: '2024',
    role: 'Concept & code',
    stack: ['WebAudio', 'TouchDesigner', 'GLSL', 'Node'],
    description:
      'A 12-metre LED wall that listens. Visitors’ voices bend a field of light in real time — exhibited in three cities.',
    href: '#',
    world: 'gas',
    palette: ['#0d0620', '#3b1a6e', '#b45cff', '#ffc6f1'],
  },
];

/** Each skill becomes a star in the constellation. Keep it around 10–14 items. */
export const skills = {
  index: '03',
  label: 'Capabilities',
  groups: [
    { title: 'Motion & 3D', items: ['Three.js', 'WebGL / GLSL', 'GSAP', 'Lenis', 'Blender'] },
    { title: 'Engineering', items: ['TypeScript', 'React / Next', 'Node.js', 'Performance'] },
    { title: 'Design', items: ['Art direction', 'Interaction', 'Figma'] },
  ],
};

export const experience = {
  index: '04',
  label: 'Trajectory',
  items: [
    {
      period: '2025 — Now',
      role: 'Senior Creative Developer',
      company: 'Meridian Studio',
      summary: 'Leading WebGL and motion for award-winning brand launches.',
    },
    {
      period: '2023 — 2025',
      role: 'Creative Developer',
      company: 'Parsec Interactive',
      summary: 'Built immersive campaigns and real-time 3D product experiences.',
    },
    {
      period: '2021 — 2023',
      role: 'Front-end Engineer',
      company: 'Quasar Labs',
      summary: 'Shipped a design system and data-viz suite used by 2M people.',
    },
    {
      period: '2019 — 2021',
      role: 'Independent',
      company: 'Freelance',
      summary: 'Websites, identities and motion for early-stage founders.',
    },
  ],
};

export const contact = {
  index: '05',
  label: 'Event horizon',
  kicker: 'Got an idea with its own gravity?',
  headline: "Let's talk",
};
