import { FluidType } from '../types';

export class FluidSolver {
  size: number;
  dt: number;
  diff: number;
  visc: number;
  
  // Density fields for different fluid channels (R, G, B) to support color mixing
  s: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;
  
  Vx: Float32Array;
  Vy: Float32Array;
  
  Vx0: Float32Array;
  Vy0: Float32Array;

  constructor(size: number, diffusion: number, viscosity: number, dt: number) {
    this.size = size;
    this.dt = dt;
    this.diff = diffusion;
    this.visc = viscosity;
    
    const count = size * size;
    this.s = new Float32Array(count);
    this.densityR = new Float32Array(count);
    this.densityG = new Float32Array(count);
    this.densityB = new Float32Array(count);
    this.Vx = new Float32Array(count);
    this.Vy = new Float32Array(count);
    this.Vx0 = new Float32Array(count);
    this.Vy0 = new Float32Array(count);
  }

  addDensity(x: number, y: number, amount: number, type: FluidType) {
    const index = this.IX(x, y);
    if (index < 0 || index >= this.densityR.length) return;

    let r = 0, g = 0, b = 0;

    switch (type) {
        case FluidType.FIRE:
            r = amount;
            g = amount * 0.4; // Slightly less green for deeper orange initially
            b = amount * 0.05;
            break;
        case FluidType.SMOKE:
            r = amount * 0.7;
            g = amount * 0.7;
            b = amount * 0.7;
            break;
        case FluidType.MAGIC:
            r = amount * 0.1;
            g = amount * 0.2;
            b = amount;
            break;
        case FluidType.POISON:
            r = amount * 0.1;
            g = amount;
            b = amount * 0.2;
            break;
    }

    this.densityR[index] += r;
    this.densityG[index] += g;
    this.densityB[index] += b;
  }

  addVelocity(x: number, y: number, amountX: number, amountY: number) {
    const index = this.IX(x, y);
    if (index < 0 || index >= this.Vx.length) return;

    this.Vx[index] += amountX;
    this.Vy[index] += amountY;
  }

  step() {
    const N = this.size;
    
    // Diffuse velocity
    this.diffuse(1, this.Vx0, this.Vx, this.visc);
    this.diffuse(2, this.Vy0, this.Vy, this.visc);
    
    // Project velocity (mass conservation)
    this.project(this.Vx0, this.Vy0, this.Vx, this.Vy);
    
    // Advect velocity
    this.advect(1, this.Vx, this.Vx0, this.Vx0, this.Vy0);
    this.advect(2, this.Vy, this.Vy0, this.Vx0, this.Vy0);
    
    // Project again
    this.project(this.Vx, this.Vy, this.Vx0, this.Vy0);
    
    // Diffuse & Advect Density for each color channel
    this.diffuse(0, this.s, this.densityR, this.diff);
    this.advect(0, this.densityR, this.s, this.Vx, this.Vy);
    
    this.diffuse(0, this.s, this.densityG, this.diff);
    this.advect(0, this.densityG, this.s, this.Vx, this.Vy);

    this.diffuse(0, this.s, this.densityB, this.diff);
    this.advect(0, this.densityB, this.s, this.Vx, this.Vy);
    
    // Decay and Transitions
    this.decay();
  }
  
  decay() {
      // Very slow decay to make fluid stay longer (was 0.992)
      const fadeRate = 0.995; 
      // Rate at which fire turns into smoke
      const fireToSmokeRate = 0.015;

      for (let i = 0; i < this.densityR.length; i++) {
          let r = this.densityR[i];
          let g = this.densityG[i];
          let b = this.densityB[i];
          
          // Fire -> Smoke Transition Logic
          // Fire is characterized by high Red and low Blue relative to Red.
          // Smoke is grey/white (R approx equal to G approx equal to B).
          
          if (r > 0.1 && b < r * 0.4) {
              // This is "Fire". Convert it to "Smoke".
              // To make smoke, we increase G and B to match R (making it grey).
              
              const smokeFormation = fireToSmokeRate;
              
              // Increase G and B towards R
              g = Math.min(r, g + smokeFormation);
              b = Math.min(r, b + smokeFormation * 2.5); // Blue needs to catch up more
              
              // Fire "burns out" - Red reduces slightly but is maintained by the smoke color
              // We don't reduce R too much because smoke needs density
              r -= 0.002; 
          }
          
          // Apply global slow fade
          r *= fadeRate;
          g *= fadeRate;
          b *= fadeRate;
          
          this.densityR[i] = r;
          this.densityG[i] = g;
          this.densityB[i] = b;

          // Velocity decay (damping)
          this.Vx[i] *= 0.99;
          this.Vy[i] *= 0.99;
      }
  }

  IX(x: number, y: number) {
    return Math.floor(x) + Math.floor(y) * this.size;
  }

  lin_solve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
    // Reduced from 20 to 8 for performance optimization
    const iter = 8; 
    const N = this.size;

    for (let k = 0; k < iter; k++) {
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          x[this.IX(i, j)] =
            (x0[this.IX(i, j)] +
              a *
                (x[this.IX(i + 1, j)] +
                  x[this.IX(i - 1, j)] +
                  x[this.IX(i, j + 1)] +
                  x[this.IX(i, j - 1)])) /
            c;
        }
      }
      this.set_bnd(b, x);
    }
  }

  diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number) {
    const a = this.dt * diff * (this.size - 2) * (this.size - 2);
    this.lin_solve(b, x, x0, a, 1 + 6 * a);
  }

  project(velocX: Float32Array, velocY: Float32Array, p: Float32Array, div: Float32Array) {
    const N = this.size;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        div[this.IX(i, j)] =
          (-0.5 *
            (velocX[this.IX(i + 1, j)] -
              velocX[this.IX(i - 1, j)] +
              velocY[this.IX(i, j + 1)] -
              velocY[this.IX(i, j - 1)])) /
          N;
        p[this.IX(i, j)] = 0;
      }
    }
    this.set_bnd(0, div);
    this.set_bnd(0, p);
    this.lin_solve(0, p, div, 1, 6);

    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        velocX[this.IX(i, j)] -= 0.5 * N * (p[this.IX(i + 1, j)] - p[this.IX(i - 1, j)]);
        velocY[this.IX(i, j)] -= 0.5 * N * (p[this.IX(i, j + 1)] - p[this.IX(i, j - 1)]);
      }
    }
    this.set_bnd(1, velocX);
    this.set_bnd(2, velocY);
  }

  advect(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array) {
    const N = this.size;
    let i0, i1, j0, j1;
    let x, y, s0, t0, s1, t1, dt0;

    dt0 = this.dt * (N - 2);

    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        x = i - dt0 * velocX[this.IX(i, j)];
        y = j - dt0 * velocY[this.IX(i, j)];
        
        if (x < 0.5) x = 0.5;
        if (x > N - 1.5) x = N - 1.5;
        i0 = Math.floor(x);
        i1 = i0 + 1;
        
        if (y < 0.5) y = 0.5;
        if (y > N - 1.5) y = N - 1.5;
        j0 = Math.floor(y);
        j1 = j0 + 1;

        s1 = x - i0;
        s0 = 1.0 - s1;
        t1 = y - j0;
        t0 = 1.0 - t1;

        d[this.IX(i, j)] =
          s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
          s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
      }
    }
    this.set_bnd(b, d);
  }

  set_bnd(b: number, x: Float32Array) {
    const N = this.size;
    for (let i = 1; i < N - 1; i++) {
      x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
      x[this.IX(i, N - 1)] = b === 2 ? -x[this.IX(i, N - 2)] : x[this.IX(i, N - 2)];
    }
    for (let j = 1; j < N - 1; j++) {
      x[this.IX(0, j)] = b === 1 ? -x[this.IX(1, j)] : x[this.IX(1, j)];
      x[this.IX(N - 1, j)] = b === 1 ? -x[this.IX(N - 2, j)] : x[this.IX(N - 2, j)];
    }

    x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
    x[this.IX(0, N - 1)] = 0.5 * (x[this.IX(1, N - 1)] + x[this.IX(0, N - 2)]);
    x[this.IX(N - 1, 0)] = 0.5 * (x[this.IX(N - 2, 0)] + x[this.IX(N - 1, 1)]);
    x[this.IX(N - 1, N - 1)] = 0.5 * (x[this.IX(N - 2, N - 1)] + x[this.IX(N - 1, N - 2)]);
  }
}