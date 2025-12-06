
import { FLUID_CONFIG } from '../config/fluid';

export class FluidSolver {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | WebGLRenderingContext;
  
  // Configuration from FLUID_CONFIG
  simRes: number = FLUID_CONFIG.SIM_RESOLUTION;
  dyeRes: number = FLUID_CONFIG.DYE_RESOLUTION;
  densityDissipation: number = FLUID_CONFIG.DENSITY_DISSIPATION;
  velocityDissipation: number = FLUID_CONFIG.VELOCITY_DISSIPATION;
  pressure: number = FLUID_CONFIG.PRESSURE;
  curl: number = FLUID_CONFIG.CURL;
  splatRadius: number = FLUID_CONFIG.SPLAT_RADIUS;

  // GL Objects
  programs: Record<string, WebGLProgram> = {};
  fbo: any = {}; // Framebuffers
  
  // State
  lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // 1. Setup Context
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2', params) as WebGL2RenderingContext | null;
    const isWebGL2 = !!gl;
    if (!isWebGL2) {
        gl = (canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params)) as WebGLRenderingContext | null;
    }
    if (!gl) {
        throw new Error('WebGL not supported');
    }
    this.gl = gl;

    // 2. Extensions
    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    // 3. Shaders
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;
        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `);

    // --- Fragment Shaders ---
    const splatShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `);

    const advectionShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;
        void main () {
            vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
            vec4 result = texture2D(uSource, coord);
            float decay = 1.0 + dissipation * dt;
            gl_FragColor = result / decay;
        }
    `);

    const divergenceShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;
            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `);

    const curlShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
    `);

    const vorticityShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            gl_FragColor = vec4(velocity + force * dt, 0.0, 1.0);
        }
    `);

    const pressureShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float C = texture2D(uPressure, vUv).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `);

    const gradientSubtractShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity.xy -= vec2(R - L, T - B);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `);

    // Standard texture display
    const displayShader = this.compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        void main () {
            vec3 C = texture2D(uTexture, vUv).rgb;
            float a = max(C.r, max(C.g, C.b));
            gl_FragColor = vec4(C, a);
        }
    `);

    // 4. Create Programs
    this.programs.splat = this.createProgram(vertexShader, splatShader);
    this.programs.advection = this.createProgram(vertexShader, advectionShader);
    this.programs.divergence = this.createProgram(vertexShader, divergenceShader);
    this.programs.curl = this.createProgram(vertexShader, curlShader);
    this.programs.vorticity = this.createProgram(vertexShader, vorticityShader);
    this.programs.pressure = this.createProgram(vertexShader, pressureShader);
    this.programs.gradientSubtract = this.createProgram(vertexShader, gradientSubtractShader);
    this.programs.display = this.createProgram(vertexShader, displayShader);

    // 5. Init Framebuffers
    this.initFramebuffers();
    this.resize();
  }

  compileShader(type: number, source: string) {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        throw new Error('Shader compile failed');
    }
    return shader;
  }

  createProgram(vs: WebGLShader, fs: WebGLShader) {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        throw new Error('Program link failed');
    }
    return program;
  }

  getTextureType() {
      const gl = this.gl;
      if (gl instanceof WebGL2RenderingContext) {
          // Use 16-bit float for better performance on mobile/mid-range, usually sufficient
          return { internalFormat: (gl as any).RGBA16F, format: gl.RGBA, type: (gl as any).HALF_FLOAT };
      }
      return { internalFormat: gl.RGBA, format: gl.RGBA, type: (gl as any).FLOAT || (gl as any).HALF_FLOAT_OES };
  }

  createFBO(w: number, h: number) {
    const gl = this.gl;
    const { internalFormat, format, type } = this.getTextureType();
    
    // Create Texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    // Create FBO
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    // Viewport
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
        texture,
        fbo,
        width: w,
        height: h,
        attach: (id: number) => {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
  }

  createDoubleFBO(w: number, h: number) {
      let fbo1 = this.createFBO(w, h);
      let fbo2 = this.createFBO(w, h);
      return {
          read: fbo1,
          write: fbo2,
          swap: function() {
              let temp = this.read;
              this.read = this.write;
              this.write = temp;
          }
      };
  }

  initFramebuffers() {
      // Simulation resolution (physics)
      const simRes = this.getResolution(this.simRes);
      // Dye resolution (visuals)
      const dyeRes = this.getResolution(this.dyeRes);

      this.fbo.velocity = this.createDoubleFBO(simRes.width, simRes.height);
      this.fbo.density = this.createDoubleFBO(dyeRes.width, dyeRes.height);
      this.fbo.divergence = this.createFBO(simRes.width, simRes.height);
      this.fbo.curl = this.createFBO(simRes.width, simRes.height);
      this.fbo.pressure = this.createDoubleFBO(simRes.width, simRes.height);
  }

  getResolution(resolution: number) {
      let aspectRatio = this.canvas.width / this.canvas.height;
      if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

      const min = resolution;
      const max = resolution * aspectRatio;
      
      const width = Math.round(this.canvas.width > this.canvas.height ? max : min);
      const height = Math.round(this.canvas.width > this.canvas.height ? min : max);
      return { width, height };
  }

  resize() {
      this.initFramebuffers();
  }

  splat(x: number, y: number, dx: number, dy: number, color: {r: number, g: number, b: number}) {
    const gl = this.gl;
    // Map screen coords to 0-1
    const u = x / this.canvas.width;
    const v = 1.0 - (y / this.canvas.height); // Flip Y
    
    // Splat Velocity
    gl.viewport(0, 0, this.fbo.velocity.read.width, this.fbo.velocity.read.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.velocity.write.fbo);
    gl.useProgram(this.programs.splat);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uTarget'), this.fbo.velocity.read.attach(0));
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'aspectRatio'), this.canvas.width / this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.programs.splat, 'point'), u, v);
    gl.uniform3f(gl.getUniformLocation(this.programs.splat, 'color'), dx, -dy, 0.0); // Flip velocity Y
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'radius'), this.splatRadius / 100.0);
    this.blit(this.fbo.velocity.write.fbo);
    this.fbo.velocity.swap();

    // Splat Density
    gl.viewport(0, 0, this.fbo.density.read.width, this.fbo.density.read.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.density.write.fbo);
    gl.useProgram(this.programs.splat);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uTarget'), this.fbo.density.read.attach(0));
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'aspectRatio'), this.canvas.width / this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.programs.splat, 'point'), u, v);
    gl.uniform3f(gl.getUniformLocation(this.programs.splat, 'color'), color.r, color.g, color.b);
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'radius'), this.splatRadius / 100.0);
    this.blit(this.fbo.density.write.fbo);
    this.fbo.density.swap();
  }

  update(dt: number) {
      const gl = this.gl;
      
      // Bind shared vertex attributes for quad
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      const simW = this.fbo.velocity.read.width;
      const simH = this.fbo.velocity.read.height;
      const dyeW = this.fbo.density.read.width;
      const dyeH = this.fbo.density.read.height;

      // 1. Curl
      gl.viewport(0, 0, simW, simH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.curl.fbo);
      gl.useProgram(this.programs.curl);
      gl.uniform2f(gl.getUniformLocation(this.programs.curl, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.curl, 'uVelocity'), this.fbo.velocity.read.attach(0));
      this.blit(this.fbo.curl.fbo);

      // 2. Vorticity
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.velocity.write.fbo);
      gl.useProgram(this.programs.vorticity);
      gl.uniform2f(gl.getUniformLocation(this.programs.vorticity, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.vorticity, 'uVelocity'), this.fbo.velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(this.programs.vorticity, 'uCurl'), this.fbo.curl.attach(1));
      gl.uniform1f(gl.getUniformLocation(this.programs.vorticity, 'curl'), this.curl);
      gl.uniform1f(gl.getUniformLocation(this.programs.vorticity, 'dt'), dt);
      this.blit(this.fbo.velocity.write.fbo);
      this.fbo.velocity.swap();

      // 3. Divergence
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.divergence.fbo);
      gl.useProgram(this.programs.divergence);
      gl.uniform2f(gl.getUniformLocation(this.programs.divergence, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.divergence, 'uVelocity'), this.fbo.velocity.read.attach(0));
      this.blit(this.fbo.divergence.fbo);

      // 4. Pressure
      gl.useProgram(this.programs.pressure);
      gl.uniform2f(gl.getUniformLocation(this.programs.pressure, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.pressure, 'uDivergence'), this.fbo.divergence.attach(0));
      for (let i = 0; i < 20; i++) { // Jacobi iterations
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.pressure.write.fbo);
          gl.uniform1i(gl.getUniformLocation(this.programs.pressure, 'uPressure'), this.fbo.pressure.read.attach(1));
          this.blit(this.fbo.pressure.write.fbo);
          this.fbo.pressure.swap();
      }

      // 5. Gradient Subtract (Velocity Update)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.velocity.write.fbo);
      gl.useProgram(this.programs.gradientSubtract);
      gl.uniform2f(gl.getUniformLocation(this.programs.gradientSubtract, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uPressure'), this.fbo.pressure.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uVelocity'), this.fbo.velocity.read.attach(1));
      this.blit(this.fbo.velocity.write.fbo);
      this.fbo.velocity.swap();

      // 6. Advection (Velocity)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.velocity.write.fbo);
      gl.useProgram(this.programs.advection);
      gl.uniform2f(gl.getUniformLocation(this.programs.advection, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform1i(gl.getUniformLocation(this.programs.advection, 'uVelocity'), this.fbo.velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(this.programs.advection, 'uSource'), this.fbo.velocity.read.attach(0));
      gl.uniform1f(gl.getUniformLocation(this.programs.advection, 'dt'), dt);
      gl.uniform1f(gl.getUniformLocation(this.programs.advection, 'dissipation'), this.velocityDissipation);
      this.blit(this.fbo.velocity.write.fbo);
      this.fbo.velocity.swap();

      // 7. Advection (Dye/Density)
      gl.viewport(0, 0, dyeW, dyeH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.density.write.fbo);
      gl.useProgram(this.programs.advection);
      gl.uniform2f(gl.getUniformLocation(this.programs.advection, 'texelSize'), 1.0 / simW, 1.0 / simH);
      gl.uniform2f(gl.getUniformLocation(this.programs.advection, 'dyeTexelSize'), 1.0 / dyeW, 1.0 / dyeH);
      gl.uniform1i(gl.getUniformLocation(this.programs.advection, 'uVelocity'), this.fbo.velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(this.programs.advection, 'uSource'), this.fbo.density.read.attach(1));
      gl.uniform1f(gl.getUniformLocation(this.programs.advection, 'dt'), dt);
      gl.uniform1f(gl.getUniformLocation(this.programs.advection, 'dissipation'), this.densityDissipation); 
      this.blit(this.fbo.density.write.fbo);
      this.fbo.density.swap();

      // 8. Display
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.programs.display);
      gl.uniform1i(gl.getUniformLocation(this.programs.display, 'uTexture'), this.fbo.density.read.attach(0));
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  blit(dest: WebGLFramebuffer | null) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, dest);
      this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
  }
}
