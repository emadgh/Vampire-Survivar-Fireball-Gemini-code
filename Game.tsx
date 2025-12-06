import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FluidSolver } from './services/FluidSolver';
import { Player, Enemy, Projectile, XPGem, Particle, FluidType, Vector2 } from './types';
import { FLUID_SIZE, FLUID_SCALE, WORLD_WIDTH, WORLD_HEIGHT, INITIAL_PLAYER_STATS, WEAPON_DEFINITIONS, AVAILABLE_UPGRADES } from './constants';
import { UpgradeModal } from './components/UpgradeModal';
import { HUD } from './components/HUD';
import { GoogleGenAI } from "@google/genai";

// We use refs for game state to avoid React re-render loops in the main loop
export const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State Refs
  const playerRef = useRef<Player>({
    id: 'player',
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    radius: 12,
    color: '#fff',
    hp: INITIAL_PLAYER_STATS.hp,
    maxHp: INITIAL_PLAYER_STATS.maxHp,
    speed: INITIAL_PLAYER_STATS.speed,
    xp: 0,
    level: 1,
    nextLevelXp: 100,
    weapons: [{ ...WEAPON_DEFINITIONS.fireball }],
    markedForDeletion: false
  });
  
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const gemsRef = useRef<XPGem[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const fluidSolverRef = useRef<FluidSolver>(new FluidSolver(FLUID_SIZE, 0.0001, 0.0001, 0.1));
  const frameIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const gameTimeRef = useRef<number>(0);
  
  const mouseRef = useRef<Vector2>({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});

  // React State for UI
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [levelUpOptions, setLevelUpOptions] = useState<any[]>([]);
  const [uiState, setUiState] = useState({
      hp: 100,
      maxHp: 100,
      xp: 0,
      nextLevelXp: 100,
      level: 1,
      time: 0,
      score: 0,
      weapons: [] as Player['weapons']
  });

  // Helpers
  const spawnEnemy = () => {
    const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
    let x = 0, y = 0;
    const padding = 50;
    
    switch(edge) {
        case 0: x = Math.random() * WORLD_WIDTH; y = -padding; break;
        case 1: x = WORLD_WIDTH + padding; y = Math.random() * WORLD_HEIGHT; break;
        case 2: x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT + padding; break;
        case 3: x = -padding; y = Math.random() * WORLD_HEIGHT; break;
    }

    const typeRoll = Math.random();
    let type: Enemy['type'] = 'chaser';
    let hp = 20 + gameTimeRef.current * 0.5; // Scaling difficulty
    let speed = 1; // Faster base speed
    let radius = 10;
    let color = '#f87171'; // Red-400

    if (gameTimeRef.current > 60 && typeRoll > 0.8) {
        type = 'tank';
        hp *= 3;
        speed = 1.5; // Faster tank
        radius = 18;
        color = '#ef4444'; // Red-500
    } else if (gameTimeRef.current > 30 && typeRoll > 0.6) {
        type = 'shooter';
        hp *= 0.8;
        speed = 3.5; // Faster shooter
        radius = 8;
        color = '#fca5a5'; // Red-300
    }

    enemiesRef.current.push({
        id: Math.random().toString(36),
        x, y, radius, color,
        hp, speed, damage: 10, type,
        markedForDeletion: false
    });
  };

  const spawnGem = (x: number, y: number, value: number) => {
      gemsRef.current.push({
          id: Math.random().toString(),
          x, y, radius: 4,
          color: '#60a5fa', // Blue-400
          value,
          markedForDeletion: false
      });
  };

  const createExplosion = (x: number, y: number, radius: number, type: FluidType) => {
      // Add fluid
      const gridX = Math.floor((x / WORLD_WIDTH) * FLUID_SIZE);
      const gridY = Math.floor((y / WORLD_HEIGHT) * FLUID_SIZE);
      const intensity = 2000; 
      
      const solver = fluidSolverRef.current;
      // Adjusted radius for lower resolution grid (was 8, now 5)
      const range = 5; 
      for(let i = -range; i <= range; i++) {
          for(let j = -range; j <= range; j++) {
              if (i*i + j*j > range*range) continue;
              
              // Scale down intensity slightly as we cover more cells
              solver.addDensity(gridX + i, gridY + j, intensity / (1 + (i*i + j*j)*0.5), type);
              // Explode outwards velocity
              solver.addVelocity(gridX + i, gridY + j, i * 40, j * 40);
          }
      }

      // Add particles
      for(let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 2 + 1;
          particlesRef.current.push({
              id: Math.random().toString(),
              x, y, radius: Math.random() * 3 + 1,
              color: type === FluidType.FIRE ? '#fbbf24' : '#a78bfa',
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1.0,
              maxLife: 1.0,
              markedForDeletion: false
          });
      }
  };

  const fireWeapon = (weapon: any, player: Player) => {
      if (weapon.currentCooldown > 0) return;

      const solver = fluidSolverRef.current;

      if (weapon.type === 'fireball') {
          // Find closest enemy or mouse
          let target = { x: mouseRef.current.x, y: mouseRef.current.y };
          // For auto-aim:
          let closestDist = 400; // range
          let closestEnemy = null;
          for (const e of enemiesRef.current) {
              const d = Math.hypot(e.x - player.x, e.y - player.y);
              if (d < closestDist) {
                  closestDist = d;
                  closestEnemy = e;
              }
          }
          if (closestEnemy) target = { x: closestEnemy.x, y: closestEnemy.y };

          const angle = Math.atan2(target.y - player.y, target.x - player.x);
          const speed = 11; // Increased projectile speed
          
          projectilesRef.current.push({
              id: Math.random().toString(),
              x: player.x,
              y: player.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 6,
              color: '#f59e0b',
              damage: weapon.damage,
              duration: 100,
              fluidType: FluidType.FIRE,
              fluidIntensity: 150,
              penetration: 1,
              markedForDeletion: false
          });
          weapon.currentCooldown = weapon.cooldown;
      } 
      else if (weapon.type === 'flamethrower') {
          const angle = Math.atan2(mouseRef.current.y - player.y, mouseRef.current.x - player.x);
          
          // Inject Fluid Velocity directly in front of player
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          
          // Multiple injection points for cone effect
          for(let i=1; i<=3; i++) {
              const scatter = (Math.random() - 0.5) * 0.5;
              const cellX = Math.floor(((player.x + dirX * 25) / WORLD_WIDTH) * FLUID_SIZE);
              const cellY = Math.floor(((player.y + dirY * 25) / WORLD_HEIGHT) * FLUID_SIZE);
              
              // Adjusted injection for lower quality grid
              for(let fx=-1; fx<=1; fx++) {
                  for(let fy=-1; fy<=1; fy++) {
                    if (Math.abs(fx) + Math.abs(fy) > 2) continue;
                    solver.addDensity(cellX + fx, cellY + fy, 250, FluidType.FIRE);
                    solver.addVelocity(cellX + fx, cellY + fy, (dirX + scatter) * 60, (dirY + scatter) * 60);
                  }
              }
          }
          
          // Create invisible damage hitbox
          projectilesRef.current.push({
              id: Math.random().toString(),
              x: player.x,
              y: player.y,
              vx: Math.cos(angle) * 10,
              vy: Math.sin(angle) * 10,
              radius: 15, // larger hitbox
              color: 'transparent',
              damage: weapon.damage,
              duration: 15, // short lived
              fluidType: FluidType.FIRE,
              fluidIntensity: 0,
              penetration: 999, // passes through
              markedForDeletion: false
          });
          weapon.currentCooldown = weapon.cooldown;
      }
      else if (weapon.type === 'nova') {
          createExplosion(player.x, player.y, 100, FluidType.MAGIC);
          // 360 projectiles
          for(let i=0; i<8; i++) {
              const angle = (i / 8) * Math.PI * 2;
               projectilesRef.current.push({
                  id: Math.random().toString(),
                  x: player.x,
                  y: player.y,
                  vx: Math.cos(angle) * 7,
                  vy: Math.sin(angle) * 7,
                  radius: 5,
                  color: '#a78bfa',
                  damage: weapon.damage,
                  duration: 60,
                  fluidType: FluidType.MAGIC,
                  fluidIntensity: 50,
                  penetration: 5,
                  markedForDeletion: false
              });
          }
          weapon.currentCooldown = weapon.cooldown;
      }
  };

  const checkLevelUp = () => {
    const p = playerRef.current;
    if (p.xp >= p.nextLevelXp) {
        p.xp -= p.nextLevelXp;
        p.level++;
        p.nextLevelXp = Math.floor(p.nextLevelXp * 1.2);
        setPaused(true);
        
        // Pick 3 random upgrades
        const shuffled = [...AVAILABLE_UPGRADES].sort(() => 0.5 - Math.random());
        setLevelUpOptions(shuffled.slice(0, 3));
    }
  };

  const handleUpgradeSelect = (upgrade: any) => {
      upgrade.apply(playerRef.current);
      setPaused(false);
      setLevelUpOptions([]);
  };

  // Main Loop
  const loop = useCallback((time: number) => {
    if (paused || gameOver) {
        frameIdRef.current = requestAnimationFrame(loop);
        return;
    }

    const dt = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;
    
    // Limits
    if (dt > 0.1) { frameIdRef.current = requestAnimationFrame(loop); return; } // Skip large lag spikes

    const player = playerRef.current;
    const solver = fluidSolverRef.current;

    // --- 1. Player Logic ---
    let dx = 0;
    let dy = 0;
    if (keysRef.current['w'] || keysRef.current['arrowup']) dy -= 1;
    if (keysRef.current['s'] || keysRef.current['arrowdown']) dy += 1;
    if (keysRef.current['a'] || keysRef.current['arrowleft']) dx -= 1;
    if (keysRef.current['d'] || keysRef.current['arrowright']) dx += 1;

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        player.x += (dx / len) * player.speed;
        player.y += (dy / len) * player.speed;
        
        // Bounds
        player.x = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.y));

        // Player movement affects fluid (trail)
        const cellX = Math.floor((player.x / WORLD_WIDTH) * FLUID_SIZE);
        const cellY = Math.floor((player.y / WORLD_HEIGHT) * FLUID_SIZE);
        // Inject into smaller area for better trail in low res
        solver.addVelocity(cellX, cellY, dx * 5, dy * 5); 
    }

    // Weapons
    player.weapons.forEach(w => {
        if (w.currentCooldown > 0) w.currentCooldown -= 1;
        fireWeapon(w, player);
    });

    // --- 2. Enemy Spawning & Logic ---
    // Spawn rate increases with time
    const spawnRate = Math.max(0.01, 0.05 - (enemiesRef.current.length * 0.001)); 
    if (Math.random() < spawnRate && enemiesRef.current.length < 100) spawnEnemy();

    enemiesRef.current.forEach(e => {
        // Move towards player
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        // Collision with player
        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        if (dist < player.radius + e.radius) {
            player.hp -= 0.5; // Damage per frame overlap
        }

        // Fluid interaction (optional: enemies disturb smoke)
        if (Math.random() < 0.1) {
            const cx = Math.floor((e.x / WORLD_WIDTH) * FLUID_SIZE);
            const cy = Math.floor((e.y / WORLD_HEIGHT) * FLUID_SIZE);
            solver.addVelocity(cx, cy, Math.cos(angle)*2, Math.sin(angle)*2);
        }
    });

    if (player.hp <= 0) {
        setGameOver(true);
    }

    // --- 3. Projectile Logic ---
    projectilesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.duration -= 1;
        if (p.duration <= 0) p.markedForDeletion = true;
        
        // Fluid Trail
        const cellX = Math.floor((p.x / WORLD_WIDTH) * FLUID_SIZE);
        const cellY = Math.floor((p.y / WORLD_HEIGHT) * FLUID_SIZE);
        if (Math.random() > 0.3) {
            // Add density for trail (FIRE)
            // The solver will handle the Fire -> Smoke transition
            solver.addDensity(cellX, cellY, p.fluidIntensity, p.fluidType);
        }
        solver.addVelocity(cellX, cellY, p.vx * 2, p.vy * 2);

        // Enemy Hit
        for (const e of enemiesRef.current) {
            if (p.markedForDeletion) break;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < p.radius + e.radius) {
                e.hp -= p.damage;
                p.penetration--;
                if (p.penetration <= 0) {
                    p.markedForDeletion = true;
                    // Impact fluid effect
                    createExplosion(p.x, p.y, 25, p.fluidType);
                }
                
                // Knockback enemy
                e.x += p.vx * 1.5;
                e.y += p.vy * 1.5;
            }
        }
    });

    // --- 4. Cleanup & XP ---
    // Dead Enemies
    enemiesRef.current = enemiesRef.current.filter(e => {
        if (e.hp <= 0) {
            spawnGem(e.x, e.y, 10); // Standard XP
            createExplosion(e.x, e.y, 35, FluidType.SMOKE); // Death poof (bigger)
            scoreRef.current += 1;
            return false;
        }
        return true;
    });

    // Projectiles
    projectilesRef.current = projectilesRef.current.filter(p => !p.markedForDeletion && 
        p.x > -50 && p.x < WORLD_WIDTH + 50 && p.y > -50 && p.y < WORLD_HEIGHT + 50);

    // Gems
    gemsRef.current.forEach(g => {
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < 100) { // Magnet range
            g.x += (player.x - g.x) * 0.1;
            g.y += (player.y - g.y) * 0.1;
        }
        if (dist < player.radius + g.radius) {
            player.xp += g.value;
            g.markedForDeletion = true;
            checkLevelUp();
        }
    });
    gemsRef.current = gemsRef.current.filter(g => !g.markedForDeletion);

    // Particles
    particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        p.vx *= 0.95;
        p.vy *= 0.95;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);


    // --- 5. Step Fluid ---
    solver.step();

    // --- 6. Rendering ---
    const ctx = canvasRef.current?.getContext('2d');
    const fluidCtx = fluidCanvasRef.current?.getContext('2d');

    if (ctx && fluidCtx) {
        // Clear main canvas
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Draw Fluid
        const imgData = fluidCtx.createImageData(FLUID_SIZE, FLUID_SIZE);
        const data = imgData.data;
        for (let i = 0; i < FLUID_SIZE * FLUID_SIZE; i++) {
            // Visualize density
            const r = Math.min(255, solver.densityR[i] * 255);
            const g = Math.min(255, solver.densityG[i] * 255);
            const b = Math.min(255, solver.densityB[i] * 255);
            
            // Adjust alpha logic for better visibility of smoke
            const maxVal = Math.max(r, g, b);
            const a = Math.min(255, maxVal * 1.5); // Boost opacity
            
            data[i * 4] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
            data[i * 4 + 3] = a; 
        }
        fluidCtx.putImageData(imgData, 0, 0);
        
        // Draw fluid scaled up to main canvas
        ctx.save();
        ctx.globalCompositeOperation = 'screen'; // Additive blending
        ctx.filter = 'blur(4px)'; // Smooth out pixels
        ctx.drawImage(fluidCanvasRef.current!, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        ctx.restore();

        // Draw Gems
        ctx.fillStyle = '#60a5fa';
        gemsRef.current.forEach(g => {
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Enemies
        enemiesRef.current.forEach(e => {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fill();
            // Enemy outline
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw Projectiles
        projectilesRef.current.forEach(p => {
            if(p.color === 'transparent') return;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Particles
        particlesRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        });

        // Draw Player
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
        // Direction Indicator
        const angle = Math.atan2(mouseRef.current.y - player.y, mouseRef.current.x - player.x);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(angle)*20, player.y + Math.sin(angle)*20);
        ctx.stroke();
    }

    // --- 7. Update UI State (throttled/every frame) ---
    gameTimeRef.current += dt;
    if (frameIdRef.current % 5 === 0) { // Update UI less frequently
        setUiState({
            hp: player.hp,
            maxHp: player.maxHp,
            xp: player.xp,
            nextLevelXp: player.nextLevelXp,
            level: player.level,
            time: gameTimeRef.current,
            score: scoreRef.current,
            weapons: [...player.weapons]
        });
    }

    frameIdRef.current = requestAnimationFrame(loop);
  }, [paused, gameOver]);

  // Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current[e.key.toLowerCase()] = true;
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key.toLowerCase()] = false;
    const handleMouseMove = (e: MouseEvent) => {
        mouseRef.current.x = e.clientX;
        mouseRef.current.y = e.clientY;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    // Start Loop
    lastTimeRef.current = performance.now();
    frameIdRef.current = requestAnimationFrame(loop);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('mousemove', handleMouseMove);
        cancelAnimationFrame(frameIdRef.current);
    };
  }, [loop]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* Hidden canvas for fluid simulation */}
      <canvas 
        ref={fluidCanvasRef} 
        width={FLUID_SIZE} 
        height={FLUID_SIZE} 
        className="hidden"
      />
      
      {/* Main Game Canvas */}
      <canvas 
        ref={canvasRef} 
        width={WORLD_WIDTH} 
        height={WORLD_HEIGHT}
        className="block"
      />

      {/* UI Overlay */}
      <HUD player={uiState} time={uiState.time} score={uiState.score} />

      {/* Menus */}
      {paused && levelUpOptions.length > 0 && (
          <UpgradeModal upgrades={levelUpOptions} onSelect={handleUpgradeSelect} />
      )}

      {gameOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur">
              <h1 className="text-6xl font-black text-white mb-4">YOU DIED</h1>
              <p className="text-2xl mb-8">Survived for {Math.floor(uiState.time)} seconds</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-white text-red-900 font-bold rounded hover:scale-105 transition-transform"
              >
                  TRY AGAIN
              </button>
          </div>
      )}
      
      {/* Start Hint */}
      {uiState.time < 5 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-center pointer-events-none">
              <p className="text-xl">WASD to Move</p>
              <p className="text-xl">Mouse to Aim</p>
              <p className="text-sm mt-2">Collect Blue Gems to Level Up</p>
          </div>
      )}
    </div>
  );
};