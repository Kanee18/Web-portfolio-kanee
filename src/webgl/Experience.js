import * as THREE from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import './shaders/chunks.js';
import { Galaxy } from './objects/Galaxy.js';
import { Starfield } from './objects/Starfield.js';
import { Sky } from './objects/Sky.js';
import { Planet } from './objects/Planet.js';
import { Sun } from './objects/Sun.js';
import { Moons } from './objects/Moons.js';
import { Constellation } from './objects/Constellation.js';
import { Asteroids } from './objects/Asteroids.js';
import { FinalShader } from './post/FinalPass.js';
import { MSAARenderPass } from './post/MSAARenderPass.js';
import { Director, STATIONS } from './Director.js';
import { state } from '../core/state.js';

export class Experience {
  constructor(canvas, { quality, projects, skills }) {
    this.canvas = canvas;
    this.quality = quality;
    this.pixelRatio = quality.pixelRatio;
    this.maxPixelRatio = quality.pixelRatio;
    this.minPixelRatio = Math.min(0.75, quality.pixelRatio);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x020308, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 3200);
    this.camera.position.set(0, 2.4, 23);
    this.scene.add(this.camera);

    // ── objects ──
    this.sky = new Sky({ steps: quality.skySteps, scale: quality.skyScale });
    this.scene.add(this.sky.background);

    this.starfield = new Starfield({ count: quality.stars, pixelRatio: this.pixelRatio });
    this.scene.add(this.starfield.mesh);

    this.galaxy = new Galaxy({ count: quality.galaxy, pixelRatio: this.pixelRatio });
    this.galaxy.group.position.copy(STATIONS.galaxy);
    this.scene.add(this.galaxy.group);

    const noise = this.sky.uniforms.uNoise.value; // shared 64³ noise volume

    this.planet = new Planet({ radius: 6, segments: quality.segments, bakeSize: quality.planetBake });
    this.planet.group.position.copy(STATIONS.planet);
    this.scene.add(this.planet.group);

    this.sun = new Sun();
    this.scene.add(this.sun.mesh);

    this.moons = new Moons(projects, { segments: Math.round(quality.segments * 0.66), bakeSize: quality.moonBake, noise });
    this.scene.add(this.moons.group);

    this.constellation = new Constellation(skills, { pixelRatio: this.pixelRatio });
    this.constellation.group.position.copy(STATIONS.constellation).add(new THREE.Vector3(5.2, 0.6, 0));
    this.scene.add(this.constellation.group);

    this.asteroids = new Asteroids({ count: quality.rocks, heroCount: quality.heroRocks, detail: quality.rockDetail, noise });
    this.asteroids.uniforms.uRimPos.value.copy(STATIONS.blackhole);
    this.scene.add(this.asteroids.group);

    this.director = new Director({
      moons: this.moons,
      planet: this.planet,
      constellation: this.constellation,
      asteroids: this.asteroids,
      sky: this.sky,
      starfield: this.starfield,
      sun: this.sun,
      projectsCount: projects.length,
    });
    this.sky.uniforms.uBhPos.value.copy(STATIONS.blackhole);
    this.sky.uniforms.uBhScale.value = 2.6;

    // ── post ──
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(this.pixelRatio);
    // multisampled scene pass where the GPU supports float MSAA targets
    const canMSAA = quality.msaa > 0 && renderer.capabilities.isWebGL2 !== false && renderer.extensions.has('EXT_color_buffer_float');
    this.renderPass = canMSAA ? new MSAARenderPass(this.scene, this.camera, quality.msaa) : new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.5, 0.55);
    const bloomSetSize = this.bloom.setSize.bind(this.bloom);
    const bs = quality.bloomScale / 0.5; // UnrealBloom already halves internally
    this.bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * bs)), Math.max(2, Math.round(h * bs)));
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.final.uniforms.uResolution.value = new THREE.Vector2(1, 1);
    composer.addPass(this.final);
    this.composer = composer;
    this.baseBloom = 0.85;

    // ── camera rig state ──
    this.intro = { dolly: 0, roll: 0, flash: 0, bloom: 0 };
    this._pos = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this._prevCam = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._velView = new THREE.Vector3();
    this._invQ = new THREE.Quaternion();
    this._parallax = new THREE.Vector2();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._bhScreen = new THREE.Vector3();
    this.warp = 0;
    this.speed = 0;
    this.distance = 0;
    this.fovKick = 0;
    this.time = 0;
    this.listeners = { workIndex: [] };
    this.workIndex = 0;
    this._frames = [];
    this._lastResize = 0;
    this.T = 0;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  onWorkIndex(cb) {
    this.listeners.workIndex.push(cb);
  }

  bindStarLabels(labels, chips) {
    this.constellation.bindLabels(labels, chips);
  }

  setSkillHover(i) {
    this.constellation.setHover(i);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.sky.setSize(w, h, pr);
    this.starfield.setSize(w, h, pr);
    this.constellation.setSize(w, h, pr);
    this.galaxy.setPixelRatio(pr);
    this.final.uniforms.uResolution.value.set(w * pr, h * pr);
    this.viewport = { width: w, height: h };
    // portrait screens: pull the camera back a little so objects still fit
    const aspect = w / h;
    this.aspectDolly = THREE.MathUtils.clamp((1.25 - aspect) * 0.55, 0, 0.6);
    // …and fold the (wide) constellation into the frame
    const cs = THREE.MathUtils.clamp(aspect / 1.45, 0.52, 1);
    this.constellation.group.scale.setScalar(cs);
    this.constellation.group.position
      .copy(STATIONS.constellation)
      .add(new THREE.Vector3(5.2 * THREE.MathUtils.clamp((aspect - 0.8) / 0.8, 0, 1), 0.6 + (1 - cs) * 3.5, 0));
  }

  /**
   * Warm every GPU program and buffer before the show starts, one stage per
   * frame. Shader compilation blocks the main thread on most drivers, so
   * staging it keeps the loader responsive and lets it report real progress.
   */
  async compileStaged(onProgress = () => {}) {
    const r = this.renderer;
    const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const warm = new THREE.WebGLRenderTarget(32, 32, { type: THREE.HalfFloatType });
    const top = [this.galaxy.group, this.starfield.mesh, this.planet.group, this.sun.mesh, this.moons.group, this.constellation.group, this.asteroids.group];
    const prev = top.map((o) => o.visible);
    const only = (...objs) => {
      top.forEach((o) => (o.visible = false));
      objs.forEach((o) => (o.visible = true));
    };
    const renderWarm = (scene, camera) => {
      r.setRenderTarget(warm);
      r.render(scene, camera);
      r.setRenderTarget(null);
    };

    const stages = [
      () => (only(this.galaxy.group, this.starfield.mesh), renderWarm(this.scene, this.camera)),
      () => this.planet.bake(r), // HD gas-giant surface (cube map)
      () => (only(this.planet.group, this.sun.mesh), renderWarm(this.scene, this.camera)),
      () => this.moons.bake(r), // HD moon surfaces
      ...this.moons.items.map((m) => () => {
        only(this.moons.group);
        this.moons.items.forEach((x) => (x.visible = x === m));
        renderWarm(this.scene, this.camera);
      }),
      () => (only(this.constellation.group, this.asteroids.group), renderWarm(this.scene, this.camera)),
      () => {
        this.sky.uniforms.uBhOn.value = 1;
        renderWarm(this.sky.scene, this.sky.camera);
        this.sky.uniforms.uBhOn.value = 0;
      },
      () => (only(), this.renderFrame(0)), // post-processing programs + targets
    ];
    for (let i = 0; i < stages.length; i++) {
      try {
        stages[i]();
      } catch (e) {
        console.warn('[cosmos] warm-up stage failed', i, e);
      }
      onProgress((i + 1) / stages.length);
      await frame();
    }
    top.forEach((o, i) => (o.visible = prev[i]));
    this.moons.items.forEach((m) => (m.visible = true));
    warm.dispose();
  }

  /** The big bang. Returns the GSAP timeline. */
  playIntro(reduced = false) {
    const g = this.galaxy.uniforms;
    if (reduced) {
      g.uIntro.value = 1;
      return gsap.timeline();
    }
    const tl = gsap.timeline();
    tl.fromTo(g.uIntro, { value: 0 }, { value: 1, duration: 4.6, ease: 'power2.out' }, 0)
      .fromTo(this.intro, { dolly: 1 }, { dolly: 0, duration: 4.2, ease: 'expo.out' }, 0)
      .fromTo(this.intro, { roll: 0.55 }, { roll: 0, duration: 4.4, ease: 'power3.out' }, 0)
      .fromTo(this.intro, { bloom: 2.8 }, { bloom: 0, duration: 3.0, ease: 'power3.out' }, 0)
      .fromTo(this.intro, { flash: 1 }, { flash: 0, duration: 1.5, ease: 'power2.out' }, 0);
    return tl;
  }

  /** Hold the singularity (before the bang). */
  holdIntro() {
    this.galaxy.uniforms.uIntro.value = 0;
    this.intro.dolly = 1;
    this.intro.roll = 0.55;
  }

  update(time, dt, T) {
    this.time = time;
    this.T = T;
    const d = this.director;
    d.seek(T);

    // ── camera from the spline ──
    const { fov, roll } = d.sample(this._pos, this._tgt);
    const cam = this.camera;

    // intro dolly: start right at the singularity, looking at it
    if (this.intro.dolly > 0) {
      const gc = STATIONS.galaxy;
      const start = this._fwd.copy(this._pos).sub(gc).multiplyScalar(0.3).add(gc);
      this._pos.lerp(start, this.intro.dolly);
      this._tgt.lerp(gc, this.intro.dolly);
    }
    if (this.aspectDolly > 0) {
      // portrait screens: back away from the subject (bounded, so far targets don't explode it)
      this._fwd.copy(this._pos).sub(this._tgt);
      const d = this._fwd.length();
      this._pos.addScaledVector(this._fwd.normalize(), Math.min(d, 40) * this.aspectDolly);
    }

    // pointer parallax (in camera space), stronger at the black hole to show off lensing
    const bhFactor = THREE.MathUtils.smoothstep(T, 8.2, 9.2);
    const amp = state.isTouch ? 0 : 1;
    this._parallax.x += (state.pointer.nx * amp - this._parallax.x) * 0.045;
    this._parallax.y += (state.pointer.ny * amp - this._parallax.y) * 0.045;
    this._fwd.copy(this._tgt).sub(this._pos).normalize();
    this._right.crossVectors(this._fwd, cam.up.set(0, 1, 0)).normalize();
    this._up.crossVectors(this._right, this._fwd).normalize();
    const pAmt = 0.75 + bhFactor * 2.4;
    this._pos.addScaledVector(this._right, this._parallax.x * pAmt).addScaledVector(this._up, this._parallax.y * pAmt * 0.6);
    this._tgt.addScaledVector(this._right, this._parallax.x * 0.25).addScaledVector(this._up, this._parallax.y * 0.15);

    cam.position.copy(this._pos);
    cam.lookAt(this._tgt);
    cam.rotateZ(roll + this.intro.roll + this._parallax.x * -0.015);

    // ── velocity → hyperspace ──
    const safeDt = Math.max(dt, 1 / 240);
    this._vel.copy(cam.position).sub(this._prevCam).divideScalar(safeDt);
    if (this._prevCam.lengthSq() === 0 || dt > 0.25) this._vel.set(0, 0, 0);
    this.distance += this._prevCam.lengthSq() === 0 ? 0 : cam.position.distanceTo(this._prevCam);
    this._prevCam.copy(cam.position);
    const speed = this._vel.length();
    this.speed += (speed - this.speed) * 0.2;
    const targetWarp = 1 - Math.exp(-this.speed / 260);
    this.warp += (targetWarp - this.warp) * 0.12;

    // velocity in view space for the star streaks
    this._invQ.copy(cam.quaternion).invert();
    this._velView.copy(this._vel).applyQuaternion(this._invQ);
    this.starfield.uniforms.uVelView.value.lerp(this._velView, 0.35);

    this.fovKick += (this.warp * 16 - this.fovKick) * 0.1;
    const targetFov = fov + this.fovKick + this.aspectDolly * 8;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov = targetFov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // ── stations: visibility & per-object updates ──
    const camZ = cam.position.z;
    this.galaxy.group.visible = camZ > -80;
    if (this.galaxy.group.visible) {
      let ray = null;
      if (state.pointer.moved && !state.isTouch) {
        this._ndc.set(state.pointer.nx, state.pointer.ny);
        this._ray.setFromCamera(this._ndc, cam);
        ray = this._ray.ray;
      }
      this.galaxy.update(time, ray, T < 0.35 && state.introDone, state.pointer.speed, cam.position);
    }

    // The giant emerges out of the distance while you dive through the galaxy
    // (opacity, never a pop); the moons manage their own capture entrance.
    const planetFade = THREE.MathUtils.smoothstep(T, 0.42, 0.8);
    const planetOn = planetFade > 0.001 && T < 4.9;
    this.planet.group.visible = planetOn;
    this.planet.setFade(planetFade);
    this.moons.group.visible = T > 1.5 && T < 4.9;
    if (planetOn) this.planet.update(time);
    if (this.moons.group.visible) this.moons.update(time);

    // sun billboard placed along the light direction from the planet
    this.sun.mesh.visible = planetOn;
    if (planetOn) {
      this.sun.mesh.position.copy(STATIONS.planet).addScaledVector(this.planet.sunDir, 900);
      this.sun.uniforms.uTime.value = time;
      this.sun.uniforms.uIntensity.value = planetFade;
    }

    const constOn = T > 3.9 && T < 6.85 && camZ > STATIONS.constellation.z - 4;
    this.constellation.group.visible = constOn;
    // lines are screen-space: fade them out before any node can fall behind the camera
    const lineFade = THREE.MathUtils.smoothstep(camZ, STATIONS.constellation.z + 8, STATIONS.constellation.z + 18);
    this.constellation.lines.visible = lineFade > 0.001;
    this.constellation.uniforms.uLineAlpha.value = lineFade;
    const labelAlpha = THREE.MathUtils.smoothstep(T, 4.55, 4.95) * (1 - THREE.MathUtils.smoothstep(T, 6.0, 6.3));
    this.constellation.update(time, cam, this.viewport, constOn, labelAlpha);

    // rocks are invisible until they start falling in (state.enter), so no pop
    this.asteroids.group.visible = T > 5.5 && T < 9.3;
    this.asteroids.update(time, this.sky.uniforms.uBhOn.value);

    // starfield: fade near the black hole so unlensed stars never cross the shadow
    const su = this.starfield.uniforms;
    su.uTime.value = time;
    if (su.uFadeCenter.value > 0) {
      this._bhScreen.copy(STATIONS.blackhole).project(cam);
      su.uFadePoint.value.set((this._bhScreen.x * 0.5 + 0.5) * this.viewport.width * this.pixelRatio, (this._bhScreen.y * 0.5 + 0.5) * this.viewport.height * this.pixelRatio);
      const dist = cam.position.distanceTo(STATIONS.blackhole);
      su.uFadeRadius.value = THREE.MathUtils.clamp((28 * 2.6) / dist, 0.05, 1.2);
    }
    su.uOpacity.value = 1 - this.director.world.starFade * 0.55;

    // ── work index (DOM sync) ──
    const idx = Math.round(this.moons.state.orbit);
    if (idx !== this.workIndex) {
      const prev = this.workIndex;
      this.workIndex = idx;
      this.listeners.workIndex.forEach((cb) => cb(idx, prev));
    }

    // ── post ──
    this.bloom.strength = this.baseBloom + this.director.world.bloom + this.intro.bloom + bhFactor * 0.15;
    const f = this.final.uniforms;
    f.uTime.value = time;
    f.uWarp.value = this.warp;
    f.uFlash.value = this.intro.flash;

    this.renderFrame(time, dt);
    this.adapt(dt);
  }

  renderFrame(time) {
    this.sky.render(this.renderer, this.camera, time);
    this.composer.render();
  }

  /** Dynamic resolution: keep frame-time under budget. */
  adapt(dt) {
    if (dt <= 0 || dt > 0.25) return;
    this._frames.push(dt);
    if (this._frames.length < 90) return;
    const avg = this._frames.reduce((a, b) => a + b, 0) / this._frames.length;
    this._frames.length = 0;
    const now = performance.now();
    if (now - this._lastResize < 2500) return;
    if (avg > 1 / 42 && this.pixelRatio > this.minPixelRatio) {
      this.pixelRatio = Math.max(this.minPixelRatio, this.pixelRatio - 0.2);
      this._lastResize = now;
      this.resize();
    } else if (avg < 1 / 75 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
      this._lastResize = now;
      this.resize();
    }
  }

  /** Data for the HUD. */
  telemetry() {
    return {
      speed: this.speed,
      warp: this.warp,
      distance: this.distance,
      position: this.camera.position,
      T: this.T,
    };
  }
}
