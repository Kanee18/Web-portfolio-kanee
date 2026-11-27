import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * THE CHOREOGRAPHY
 * ────────────────
 * One paused GSAP master timeline owns every 3D property. Its playhead is the
 * "journey time" T (0 → 10), computed each frame from Lenis' smoothed scroll
 * position and the page's section boundaries (see core/journey.js). One unit
 * of timeline = one scroll segment, so the 3D world and the DOM are driven by
 * the exact same number, in the same frame.
 *
 *   seg 0  hero → about      dive through the galaxy, hyperspace to the giant
 *   seg 1  about (pinned)    orbit the planet; the sun slips behind it (eclipse)
 *   seg 2  about → work      sweep across the planet; moons fade into orbit
 *   seg 3  work (pinned)     moons swing through the focal point, one per project
 *   seg 4  work → skills     jump to the constellation
 *   seg 5  skills (pinned)   constellation draws itself
 *   seg 6  skills → journey  fly through the constellation; black hole appears
 *   seg 7  journey           drift through the asteroid belt
 *   seg 8  journey → contact final approach to the event horizon
 *   seg 9  contact (pinned)  settle into orbit, the disk spins up
 */

export const STATIONS = {
  galaxy: new THREE.Vector3(0, 0, 0),
  planet: new THREE.Vector3(0, 0, -320),
  constellation: new THREE.Vector3(0, 0, -660),
  blackhole: new THREE.Vector3(0, 0, -1150),
};

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export class Director {
  constructor({ moons, planet, constellation, asteroids, sky, starfield, sun, projectsCount }) {
    this.moons = moons;
    this.planet = planet;
    this.sky = sky;
    this.starfield = starfield;
    this.constellation = constellation;
    this.sun = sun;

    const P = STATIONS.planet;
    const C = STATIONS.constellation;
    const B = STATIONS.blackhole;

    // work framing: the giant sits right of centre; the moons ride a polar orbit
    // whose front point (the active project) hangs in front of its lower limb
    const up = v(0, 1, 0);
    const workCam = P.clone().add(v(-12.5, 0.8, 19.0));
    const toCam = workCam.clone().sub(P).normalize();
    moons.group.position.copy(P);
    moons.setBasis(toCam.clone().addScaledVector(up, -0.16), up);
    const F = moons.computeFocus().clone();
    const viewDir = P.clone().sub(workCam).normalize();
    const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();
    const workTgt = P.clone().lerp(F, 0.5).addScaledVector(right, -5.0).addScaledVector(up, -0.4);

    // ── camera shots: [position, target, fov, roll] ──
    this.shots = [
      [v(0, 2.4, 23), v(0, -1.7, 0), 42, 0], // 0 hero
      [v(5.0, 0.45, 0.6), v(6.4, 0.1, -40), 60, -0.22], // 1 galaxy pass
      [P.clone().add(v(-8.0, 1.6, 17.5)), P.clone().add(v(-5.4, 0.3, 0)), 42, 0.02], // 2 about
      [P.clone().add(v(-11.2, 2.7, 15.2)), P.clone().add(v(-5.9, 0.6, 0)), 42, 0.05], // 3 about end
      [workCam.clone(), workTgt.clone(), 40, 0], // 4 work
      [workCam.clone().add(v(0.8, 0.6, -0.8)), workTgt.clone().add(v(0, 0.25, 0)), 40, -0.02], // 5 work end
      [C.clone().add(v(-3.0, 0.8, 35)), C.clone().add(v(3.2, 0.3, 0)), 42, 0], // 6 skills
      [C.clone().add(v(4.2, 2.4, 31.5)), C.clone().add(v(3.6, 0.2, 0)), 42, 0.03], // 7 skills end
      [C.clone().add(v(0.5, 0.8, -46)), B.clone().add(v(0, 2.5, 0)), 46, 0], // 8 journey
      [B.clone().add(v(-1.5, 6.5, 205)), B.clone().add(v(0, 2.0, 0)), 44, 0], // 9 journey end
      [B.clone().add(v(0, 6.4, 60)), B.clone().add(v(0, -6.8, 0)), 40, 0], // 10 contact
      [B.clone().add(v(0, 5.2, 52)), B.clone().add(v(0, -6.4, 0)), 40, 0.015], // 11 contact end
    ];
    this.posCurve = new THREE.CatmullRomCurve3(this.shots.map((s) => s[0]), false, 'centripetal');
    this.tgtCurve = new THREE.CatmullRomCurve3(this.shots.map((s) => s[1]), false, 'centripetal');

    // ── animated state (all owned by the master timeline) ──
    this.rig = { u: 0 };
    this.world = {
      sunX: -0.72,
      sunY: 0.3,
      sunZ: 0.62,
      planetSpin: 0,
      nebula: 1,
      bloom: 0,
      starFade: 0,
    };

    const N = Math.max(projectsCount, 1);
    const stepEase = (x) => {
      if (N <= 1) return 0;
      const s = x * (N - 1);
      const i = Math.min(Math.floor(s), N - 2);
      const f = s - i;
      const k = THREE.MathUtils.smoothstep(f, 0.16, 0.84);
      return (i + k) / (N - 1);
    };

    const sunA = { sunX: -0.72, sunY: 0.3, sunZ: 0.62 }; // front-left key light
    const sunB = { sunX: 0.47, sunY: -0.02, sunZ: -0.88 }; // behind the planet → eclipse
    const sunC = { sunX: -0.55, sunY: 0.38, sunZ: 0.74 }; // light the moons

    const tl = gsap.timeline({ paused: true, defaults: { duration: 1, ease: 'none' } });
    // camera path
    tl.to(this.rig, { u: 2, ease: 'power2.inOut' }, 0)
      .to(this.rig, { u: 3 }, 1)
      .to(this.rig, { u: 4, ease: 'power2.inOut' }, 2)
      .to(this.rig, { u: 5 }, 3)
      .to(this.rig, { u: 6, ease: 'power2.inOut' }, 4)
      .to(this.rig, { u: 7 }, 5)
      .to(this.rig, { u: 8, ease: 'power2.inOut' }, 6)
      .to(this.rig, { u: 9, ease: 'sine.inOut' }, 7)
      .to(this.rig, { u: 10, ease: 'power3.inOut' }, 8)
      .to(this.rig, { u: 11, ease: 'power1.out' }, 9);

    // light & planet
    tl.fromTo(this.world, sunA, { ...sunB, ease: 'sine.inOut' }, 1)
      .to(this.world, { ...sunC, ease: 'power2.inOut' }, 2)
      .fromTo(this.world, { planetSpin: 0 }, { planetSpin: 0.9, duration: 3 }, 1)
      .fromTo(this.world, { bloom: 0 }, { bloom: 0.35, ease: 'sine.inOut', duration: 0.5 }, 1.5)
      .to(this.world, { bloom: 0, ease: 'sine.inOut', duration: 0.5 }, 2.0);

    // moons: captured from deep space during the about → work flight
    tl.fromTo(moons.state, { reveal: 0 }, { reveal: 1, ease: 'none', duration: 1.05 }, 1.9)
      .fromTo(moons.state, { orbit: 0 }, { orbit: N - 1, ease: stepEase }, 3);

    // asteroids: fall into the belt from above / the sides as the journey begins
    if (asteroids) tl.fromTo(asteroids.state, { enter: 0 }, { enter: 1, ease: 'none', duration: 1.6 }, 5.7);

    // constellation
    tl.fromTo(constellation.state, { draw: 0 }, { draw: 1, ease: 'power1.inOut', duration: 0.92 }, 5);

    // black hole and the sky
    tl.fromTo(sky.uniforms.uBhOn, { value: 0 }, { value: 1, ease: 'power1.in', duration: 0.6 }, 6.3)
      .fromTo(this.world, { nebula: 1 }, { nebula: 1.35, duration: 2 }, 4)
      .to(this.world, { nebula: 0.9, duration: 2 }, 7)
      .fromTo(this.world, { starFade: 0 }, { starFade: 1, ease: 'power2.in' }, 8)
      .fromTo(sky.uniforms.uDiskSpeed, { value: 1 }, { value: 2.6, ease: 'power2.in' }, 9)
      .fromTo(sky.uniforms.uDiskGain, { value: 1 }, { value: 1.3 }, 9);

    this.timeline = tl;
    this.duration = tl.duration();

    this._pos = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
  }

  /** Seek the whole universe to journey time T. */
  seek(T) {
    this.timeline.seek(Math.min(Math.max(T, 0), this.duration), true);
    const w = this.world;
    this.planet.sunDir.set(w.sunX, w.sunY, w.sunZ).normalize();
    this.moons.sunDir.copy(this.planet.sunDir);
    this.planet.spin.rotation.y = w.planetSpin;
    this.sky.uniforms.uNebula.value = w.nebula;
    this.starfield.uniforms.uFadeCenter.value = w.starFade;
  }

  /** Sample camera pose for the current rig.u */
  sample(outPos, outTgt) {
    const n = this.shots.length - 1;
    const t = Math.min(Math.max(this.rig.u / n, 0), 1);
    this.posCurve.getPoint(t, outPos);
    this.tgtCurve.getPoint(t, outTgt);
    const i = Math.min(Math.floor(this.rig.u), n - 1);
    const f = this.rig.u - i;
    const e = f * f * (3 - 2 * f);
    const fov = THREE.MathUtils.lerp(this.shots[i][2], this.shots[i + 1][2], e);
    const roll = THREE.MathUtils.lerp(this.shots[i][3], this.shots[i + 1][3], e);
    return { fov, roll };
  }
}
