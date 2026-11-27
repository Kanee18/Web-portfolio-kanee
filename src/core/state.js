/** Tiny shared runtime state (pointer, device, flags). */
const coarse = window.matchMedia('(pointer: coarse)').matches;

export const state = {
  pointer: { x: window.innerWidth / 2, y: window.innerHeight / 2, nx: 0, ny: 0, speed: 0, moved: false },
  viewport: { width: window.innerWidth, height: window.innerHeight },
  isTouch: coarse || 'ontouchstart' in window,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  introDone: false,
  journeyT: 0,
};

let lastX = state.pointer.x;
let lastY = state.pointer.y;
let lastT = performance.now();

window.addEventListener(
  'pointermove',
  (e) => {
    const p = state.pointer;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    p.speed = Math.min(p.speed * 0.7 + (d / dt) * 0.3, 6);
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    p.x = e.clientX;
    p.y = e.clientY;
    p.nx = (e.clientX / state.viewport.width) * 2 - 1;
    p.ny = -((e.clientY / state.viewport.height) * 2 - 1);
    p.moved = true;
  },
  { passive: true }
);

window.addEventListener(
  'resize',
  () => {
    state.viewport.width = window.innerWidth;
    state.viewport.height = window.innerHeight;
  },
  { passive: true }
);

export function detectQuality() {
  const ua = navigator.userAgent;
  const mobile = coarse || /Android|iPhone|iPad|iPod/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  const dpr = window.devicePixelRatio || 1;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* ignore */
  }
  const integrated = /Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe/i.test(gpu);
  const strongGPU = /RTX|GTX|Radeon RX|RX \d|Apple M\d (Pro|Max|Ultra)/i.test(gpu);
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');

  let tier = 'high';
  if (mobile) tier = 'low';
  else if (integrated && !strongGPU) tier = 'medium';
  else if (cores < 6 || mem < 6) tier = 'medium';
  if (forced === 'low' || forced === 'medium' || forced === 'high') tier = forced;

  // msaa: scene samples · planetBake / moonBake: cube-map face size of the HD surfaces
  const presets = {
    high: { tier, pixelRatio: Math.min(dpr, 1.75), galaxy: 170000, stars: 7600, skySteps: 150, skyScale: dpr > 1.4 ? 0.72 : 1, bloomScale: 0.5, segments: 256, msaa: 4, planetBake: 1024, moonBake: 512, rocks: 320, heroRocks: 18, rockDetail: 1 },
    medium: { tier, pixelRatio: Math.min(dpr, 1.25), galaxy: 110000, stars: 5200, skySteps: 115, skyScale: 0.6, bloomScale: 0.45, segments: 192, msaa: 2, planetBake: 1024, moonBake: 512, rocks: 240, heroRocks: 14, rockDetail: 1 },
    low: { tier, pixelRatio: Math.min(dpr, 1.5), galaxy: 65000, stars: 3200, skySteps: 90, skyScale: 0.5, bloomScale: 0.4, segments: 128, msaa: 0, planetBake: 512, moonBake: 256, rocks: 140, heroRocks: 10, rockDetail: 0 },
  };
  return { ...presets[tier], gpu };
}
