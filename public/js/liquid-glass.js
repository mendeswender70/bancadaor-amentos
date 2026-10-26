// Refraction of a known image, not a screenshot of the DOM. One shared canvas.
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUV;
void main() { vUV = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
`;
const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uImage;
uniform vec2 uViewport;
uniform vec2 uImageSize;
uniform vec2 uLight;
uniform vec4 uRects[8];
uniform vec4 uMaterials[8];
uniform int uCount;

float distanceToGlass(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
}
vec3 backgroundAt(vec2 p) {
  float scale = max(uViewport.x / uImageSize.x, uViewport.y / uImageSize.y);
  vec2 uv = ((p - uViewport * .5) / scale + uImageSize * .5) / uImageSize;
  vec3 wood = texture2D(uImage, vec2(uv.x, 1. - uv.y)).rgb;
  float shade = .82 - .16 * clamp(p.x / uViewport.x, 0., 1.) - .09 * clamp(p.y / uViewport.y, 0., 1.);
  return wood * shade;
}
vec3 scatteredBackground(vec2 p, float spread) {
  return backgroundAt(p) * .4
    + backgroundAt(p + vec2(spread, 0.)) * .15
    + backgroundAt(p - vec2(spread, 0.)) * .15
    + backgroundAt(p + vec2(0., spread)) * .15
    + backgroundAt(p - vec2(0., spread)) * .15;
}
void main() {
  vec2 p = vec2(vUV.x, 1. - vUV.y) * uViewport;
  vec3 color = backgroundAt(p);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    if (p.y < uMaterials[i].z || p.y > uMaterials[i].w) continue;
    vec4 rect = uRects[i];
    vec2 halfSize = rect.zw * .5;
    vec2 center = rect.xy + halfSize;
    vec2 local = p - center;
    float radius = min(uMaterials[i].x, min(halfSize.x, halfSize.y));
    float d = distanceToGlass(local, halfSize, radius);
    float tint = uMaterials[i].y;
    if (d > 0. && d < 32.) {
      // A grounded shadow, strongest immediately outside the lens.
      float shadow = exp(-d * .12) * .20;
      color *= 1. - shadow;
    }
    if (d <= 0.) {
      float depth = -d;
      float thickness = clamp(radius * .7, 9., 24.);
      float edge = 1. - smoothstep(0., thickness, depth);
      vec2 gradient = vec2(
        distanceToGlass(local + vec2(.5, 0.), halfSize, radius) - distanceToGlass(local - vec2(.5, 0.), halfSize, radius),
        distanceToGlass(local + vec2(0., .5), halfSize, radius) - distanceToGlass(local - vec2(0., .5), halfSize, radius)
      );
      vec2 normal = gradient / max(length(gradient), .001);
      // A convex rim bends the wood inward; the center stays almost undistorted.
      float bend = pow(edge, 1.65) * min(thickness * .9, 18.);
      vec2 refracted = p - normal * bend - local * .009;
      vec3 glass = scatteredBackground(refracted, 1.4 + (1. - edge) * 1.5);
      glass = mix(glass, vec3(.105, .09, .075), .18);
      glass = mix(glass, vec3(.40, .28, .15), tint * .28);
      vec2 lightVector = uLight - center + vec2(-100., -160.);
      vec2 lightDirection = lightVector / max(length(lightVector), .001);
      float specular = pow(max(dot(normal, lightDirection), 0.), 6.);
      float rim = 1. - smoothstep(.2, 1.5, depth);
      float innerRim = exp(-pow((depth - 3.) / 2., 2.));
      glass += vec3(1., .96, .88) * rim * (.10 + .53 * specular);
      glass += vec3(.82, .87, .92) * innerRim * specular * .075;
      glass += vec3(.90, .94, 1.) * edge * edge * specular * .07;
      // Gentle light on the surface, without an opaque white border.
      float surface = exp(-dot((p - uLight) / 290., (p - uLight) / 290.));
      glass += vec3(1., .96, .89) * surface * .025;
      color = mix(glass, color, smoothstep(-.8, 0., d));
    }
  }
  gl_FragColor = vec4(color, 1.);
}
`;

export class WoodGlassRenderer {
  constructor(canvas, { imageURL, elements }) {
    this.canvas = canvas;
    this.elements = [...elements];
    this.enabled = true;
    this.light = { x: innerWidth * .25, y: innerHeight * .15 };
    this.target = { ...this.light };
    this.velocity = { x: 0, y: 0 };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.contrast = matchMedia('(prefers-contrast: more)');
    this.reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    this.image = new Image();
    this.image.onload = () => {
      try { this.initialize(); } catch { this.fallback(); }
    };
    this.image.onerror = () => this.fallback();
    this.image.src = imageURL;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); this.fallback();
    }, options);
    canvas.addEventListener('webglcontextrestored', () => {
      try { this.initialize(); } catch { this.fallback(); }
    }, options);
    addEventListener('resize', () => this.requestRender(), options);
    addEventListener('scroll', () => this.requestRender(), { ...options, passive: true, capture: true });
    visualViewport?.addEventListener('resize', () => this.requestRender(), options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; }
      else this.requestRender();
    }, options);
    for (const media of [this.reducedMotion, this.contrast, this.reducedTransparency]) {
      media.addEventListener('change', () => this.requestRender(), options);
    }
    this.observer = new ResizeObserver(() => this.requestRender());
    this.observer.observe(document.body);
    this.elements.forEach(element => this.observer.observe(element));
    document.fonts.ready.then(() => this.requestRender());
  }

  initialize() {
    const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) return this.fallback();
    this.gl = gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.image);
    this.uniforms = Object.fromEntries(['uImage', 'uViewport', 'uImageSize', 'uLight', 'uRects[0]', 'uMaterials[0]', 'uCount'].map(name => [name, gl.getUniformLocation(this.program, name)]));
    gl.uniform1i(this.uniforms.uImage, 0);
    gl.uniform2f(this.uniforms.uImageSize, this.image.naturalWidth, this.image.naturalHeight);
    this.ready = true;
    this.requestRender();
  }

  fallback() {
    this.ready = false;
    cancelAnimationFrame(this.frame); this.frame = 0;
    document.documentElement.classList.remove('glass-ready');
    this.canvas.dispatchEvent(new Event('glassfallback'));
  }

  setLight(x, y) {
    this.target = { x, y };
    this.requestRender();
  }

  requestRender(duration = 0) {
    if (duration) this.animateUntil = performance.now() + duration;
    if (!this.ready || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(time => this.draw(time));
  }

  draw(time) {
    this.frame = 0;
    if (!this.ready) return;
    const gl = this.gl;
    const view = this.canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1500000 / (view.width * view.height)));
    const width = Math.max(1, Math.round(view.width * ratio));
    const height = Math.max(1, Math.round(view.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    const delta = Math.min((time - (this.lastTime || time - 16)) / 1000, .032);
    this.lastTime = time;
    let moving = false;
    for (const axis of ['x', 'y']) {
      if (this.reducedMotion.matches) { this.light[axis] = this.target[axis]; this.velocity[axis] = 0; }
      else {
        const gap = this.target[axis] - this.light[axis];
        this.velocity[axis] += (gap * 130 - this.velocity[axis] * 23) * delta;
        this.light[axis] += this.velocity[axis] * delta;
        if (Math.abs(gap) > .1 || Math.abs(this.velocity[axis]) > .1) moving = true;
      }
    }
    const rects = new Float32Array(32), materials = new Float32Array(32);
    let count = 0;
    if (this.enabled && !this.contrast.matches && !this.reducedTransparency.matches) {
      for (const element of this.elements) {
        if (count === 8 || !element.getClientRects().length || element.hidden) continue;
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > view.height) continue;
        rects.set([rect.left - view.left, rect.top - view.top, rect.width, rect.height], count * 4);
        const scrollParent = element.closest('main');
        const clip = scrollParent && getComputedStyle(scrollParent).overflowY !== 'visible' ? scrollParent.getBoundingClientRect() : view;
        materials.set([Number(element.dataset.radius) || 24, element.dataset.tint === 'gold' ? 1 : 0, clip.top - view.top, clip.bottom - view.top], count * 4);
        count++;
      }
    }
    gl.uniform2f(this.uniforms.uViewport, view.width, view.height);
    gl.uniform2f(this.uniforms.uLight, this.light.x, this.light.y);
    gl.uniform4fv(this.uniforms['uRects[0]'], rects);
    gl.uniform4fv(this.uniforms['uMaterials[0]'], materials);
    gl.uniform1i(this.uniforms.uCount, count);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    document.documentElement.classList.add('glass-ready');
    if (moving || (!this.reducedMotion.matches && time < this.animateUntil)) this.requestRender();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.abort.abort(); this.observer.disconnect();
    if (this.gl) {
      this.gl.deleteTexture(this.texture); this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program);
    }
  }
}
