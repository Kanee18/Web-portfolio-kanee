/**
 * Display-referred finishing pass (runs after OutputPass):
 * radial zoom-blur + barrel warp during hyperspace, chromatic aberration,
 * vignette, animated film grain and a flash for the opening "big bang".
 */
export const FinalShader = {
  name: 'CosmosFinal',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: null },
    uTime: { value: 0 },
    uWarp: { value: 0 },
    uAberration: { value: 0.0012 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.55 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uWarp;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uFlash;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float aspect = uResolution.x / uResolution.y;
      vec2 ca = c * vec2(aspect, 1.0);
      float r2 = dot(ca, ca);

      // barrel warp while travelling fast
      vec2 dir = c * (1.0 - uWarp * 0.07 * r2);
      float ab = (uAberration + uWarp * 0.012) * (0.35 + r2 * 2.2);

      vec3 col;
      if (uWarp > 0.02) {
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float s = 1.0 - t * uWarp * 0.06;
          float w = 1.0 - t * 0.7;
          vec2 d = dir * s;
          acc.r += texture2D(tDiffuse, 0.5 + d * (1.0 + ab)).r * w;
          acc.g += texture2D(tDiffuse, 0.5 + d).g * w;
          acc.b += texture2D(tDiffuse, 0.5 + d * (1.0 - ab)).b * w;
          wsum += w;
        }
        col = acc / wsum;
      } else {
        col.r = texture2D(tDiffuse, 0.5 + dir * (1.0 + ab)).r;
        col.g = texture2D(tDiffuse, 0.5 + dir).g;
        col.b = texture2D(tDiffuse, 0.5 + dir * (1.0 - ab)).b;
      }

      // vignette
      float vig = smoothstep(1.05, 0.18, length(ca * vec2(0.82, 1.0)));
      col *= mix(1.0, vig, uVignette);

      // flash (opening sequence)
      col = mix(col, vec3(1.0, 0.97, 0.92), uFlash * exp(-r2 * 1.5));

      // film grain (display space, luminance-aware)
      float g = hash12(vUv * uResolution + fract(uTime * 13.7) * 1000.0) - 0.5;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * (0.6 + 0.4 * (1.0 - luma));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
