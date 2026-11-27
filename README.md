# KANEE — a portfolio in orbit

A scroll-driven journey through space: press **Start** and the music begins as a galaxy is born in a
big bang. You dive through its arms, hyperspace to a ringed gas giant (eclipse included), watch your
projects get captured into orbit as moons, see your skills draw themselves into a constellation, fly
through an asteroid belt that falls into place around you, and end at a ray-marched black hole whose
shadow frames the contact call-to-action. Distant galaxies fill the sky the whole way, and the black
hole lenses one of them.

**Stack:** [Lenis](https://github.com/darkroomengineering/lenis) (smooth scroll) ·
GSAP 3 (ScrollTrigger, SplitText, timelines that drive the 3D) · Three.js (custom GLSL) · Vite.
No 3D model files and no image assets: every surface is procedural, and the HD ones are baked on
the GPU while the loader runs.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve dist/ at http://localhost:4173
```

`dist/` is a static site that you can host anywhere (Vercel, Netlify, GitHub Pages, S3…). `base: './'`
is set, so it also works from a sub-folder.

## Make it yours

**Everything you'd edit is in [`src/content.js`](src/content.js)**: name/wordmark, role, email,
socials, hero tagline, about statement and stats, projects, skills and experience. The page markup
and the 3D scenes read from it:

| Content | Becomes |
| --- | --- |
| `projects[]` | one procedural moon each. `world: 'lava' \| 'ice' \| 'terra' \| 'gas'` and a 4-colour `palette` define its surface |
| `skills.groups[].items` | one star each in the constellation (10–14 reads best) |
| `*asterisks*` in copy | the italic serif accent |
| `profile.timezone` | the footer clock (e.g. `'Asia/Jakarta'`); empty = visitor's zone |

All copy, names, companies and the email (`hello@example.com`) are **placeholders**. Replace them
before you publish.

Design tokens (colours, fonts, easing) live at the top of `src/styles/base.css`.

### Music
The site plays **`src/BGM/cosmos-bgm.mp3`**, a 4 MB web version of your track. The source file was a
1-hour loop of a 186.06 s piece. I measured the exact cycle by cross-correlating the audio and cut one
cycle with 0.5 s of identical margin on each side, so it loops sample-accurately: no gap, no click.
It's encoded at 44.1 kHz VBR (~176 kbps) and normalised to sit under the visuals.

- The full-length original stays in `src/BGM/` for your archive. Nothing imports it, so it is **not**
  shipped, and it's git-ignored (148 MB is over GitHub's file limit).
- Music starts when the visitor presses **Start the journey** at 100 %. Browsers only allow audio
  after a click, so that button doubles as the unlock. **Enter without sound** skips it; the header
  button toggles it any time. The music opens up from a muffled sound at the bang, and fast scrolling
  adds a soft hyperspace whoosh.
- To use different music, replace `cosmos-bgm.mp3` (keep the name). Any other file simply loops
  from start to end.
- Before publishing, make sure you have the rights to the track. Music taken from YouTube uploads or
  film scores usually needs a licence for use on a public site.

## How it's built

```
src/
  main.js              boot: loader → code-split WebGL chunk → staged shader warm-up → bang
  content.js           ← your content
  render.js            builds the DOM from content.js
  sections.js          all DOM scroll choreography (GSAP + SplitText)
  core/
    scroll.js          Lenis ⇄ GSAP ticker ⇄ ScrollTrigger sync, smooth anchor flights
    journey.js         page scroll → "journey time" T ∈ [0, 10]
    state.js           pointer, device, quality tiers
  webgl/
    Experience.js      renderer, post-processing, camera rig, adaptive resolution, frame loop
    Director.js        one paused GSAP master timeline that owns every 3D property
    bake.js            bakes procedural surfaces into HD cube maps at load time
    objects/           Galaxy · Starfield · Sky (+black hole, distant galaxies) · Planet · Sun ·
                       Moons · Constellation · Asteroids
    post/              MSAA scene pass · FinalPass (warp blur, aberration, grain, vignette, flash)
    shaders/chunks.js  shared GLSL (simplex/fbm, worley, ring density, bump)
  ui/
    liquidGlass.js     the liquid-glass engine (refraction maps + spring physics)
    audio.js           soundtrack: gapless loop, Start-gate unlock, scroll-reactive tone
    preloader.js · cursor.js · nav.js · hud.js
  BGM/cosmos-bgm.mp3   the music
```

### Scroll sync, in one sentence
Lenis runs on GSAP's ticker (`lenis.raf` first), emits `scroll` → `ScrollTrigger.update`, and the WebGL
frame runs next in the same tick. It reads Lenis' smoothed position, converts it to journey time `T` and
seeks the 3D master timeline to it. DOM and canvas move from the same number in the same frame, with no
double smoothing (every scrubbed tween uses `scrub: true`).

### The 3D, briefly
- **Galaxy** — 170k particles: bar, bulge, log-spiral arms with spurs, pink HII knots and a halo, plus a
  *subtractive* dust-lane layer and a soft "unresolved starlight" glow that follows the same spiral.
  Differential rotation; the cursor acts as a gravity well; `uIntro` drives the big-bang formation.
- **Deep sky** — a dozen distant galaxies (inclined and face-on spirals, edge-on discs with dust lanes,
  ellipticals) plus a field of tiny faint ones, all placed where the journey's camera looks.
- **Starfield** — instanced screen-space capsules stretched by the camera's real velocity, so hyperspace
  streaks only appear when you actually move fast, and point the right way when you scroll back up.
- **Black hole** — Schwarzschild photon paths integrated per pixel (`a = −1.5·h²·x/r⁵`), a relativistic
  accretion disk (Doppler beaming, gravitational redshift, Keplerian shear with a flow-map cross-fade)
  and analytic weak-field lensing outside the integration bound, so there is no seam while you approach.
  A spiral galaxy sits right behind it and gets lensed.
- **Gas giant (HD)** — the surface is baked into a 1024² × 6 cube map: jet streams with turbulent belt
  edges, eddies, a great oval storm and a chain of white ovals, all drifting with latitude-dependent
  wind. Rings come from a 4096-sample radial profile (C/B/A rings, Cassini division, Encke and Keeler
  gaps, F ring) with angle-dependent opacity and transmission on the unlit face. Ring shadows, planet
  shadow, ring-shine and an eclipse halo. It emerges out of the distance during the dive.
- **Moons (HD)** — each world is baked to a cube map (colour + relief) and lit with per-pixel normals:
  lava plates with glowing fissures, Europa-style ice lineae, an Earth-like world with drifting clouds,
  a banded gas dwarf. **Entrance:** they're captured from deep space, each swooping in on a curved
  path and slowing into its orbital slot.
- **Asteroids** — noise-sculpted rocks (hero rocks ~20k triangles) with crater bowls, raised rims and
  baked crevice shading. Dark regolith shading (like Bennu and Ryugu), a warm rim light from the
  accretion disk, and distance haze so far rocks melt into space. **Entrance:** they fall into the belt
  from above and the sides, accelerating like they're under gravity, then settling softly. It reverses
  exactly when you scroll back up.
- **Post** — 4× MSAA scene pass (clean planet limbs, ring edges and rock silhouettes) → UnrealBloom →
  ACES tone mapping → a finishing pass (warp blur, aberration, grain, vignette).

### Liquid glass
Each glass element gets its own displacement map, computed from the signed-distance field of its
rounded shape. The bezel follows a convex squircle profile, and each pixel's offset comes from
Snell's law (n = 1.5), so light bends hardest at the rim, plus a gentle overall magnification. The
map feeds an SVG filter applied through `backdrop-filter: url(#…)`, with three displacement passes
(one per RGB channel) for chromatic dispersion. Rim light rotates toward the cursor; springs handle
magnetism, squash & stretch, press squish and the jelly release.

> Real refraction uses `backdrop-filter: url()`, which only Chromium supports (Chrome, Edge, Brave,
> Arc, Opera). Safari and Firefox get a tuned frosted-glass fallback with the same light and physics.
> Add `?glass=flat` to the URL to preview the fallback.

### Performance & robustness
- WebGL is a separate chunk, so the loader paints immediately. Shaders are warmed and the HD surfaces
  baked one stage per frame, while the counter reports real progress.
- Baking moves the expensive noise out of the frame loop: the planet and moons cost a few texture
  fetches per pixel at runtime.
- The heavy full-screen pass (sky / black hole) samples a 64³ noise volume instead of analytic noise:
  one texture fetch per octave, and its shader compiles ~4× faster.
- Quality tiers (high / medium / low) by device + GPU control anti-aliasing (4× / 2× / off), bake
  resolution, rock count and mesh detail. Dynamic resolution then keeps the frame budget.
  Force a tier with `?quality=low|medium|high`.
- `prefers-reduced-motion` is respected: Lenis goes 1:1, the big bang is skipped and CSS motion stops.
- If WebGL is unavailable, the site still works without the 3D layer.

### Handy URL flags
`?quality=low` · `?glass=flat` · `?reduced` · `?fast` (short loader, skips the Start gate, no
music) · `?debug` (exposes `window.__cosmos` and `window.__soundtrack`) · `?t=5.4` (jump to a
journey time after load).

## Browser support
Latest Chrome / Edge / Firefox / Safari (desktop & mobile). WebGL 2 is required for the 3D layer.

## Credits
Simplex noise by Ashima Arts / Stefan Gustavson (MIT) and the hash functions by Dave Hoskins (MIT),
both adapted in `src/webgl/shaders/chunks.js`. Fonts: Archivo, Instrument Serif and JetBrains Mono
(SIL OFL, self-hosted via Fontsource).
