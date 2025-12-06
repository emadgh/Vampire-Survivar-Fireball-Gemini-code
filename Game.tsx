import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FluidSolver } from './services/FluidSolver';
import { Player, Enemy, Projectile, XPGem, Particle, FluidType, Vector2 } from './types';
import { WORLD_WIDTH, WORLD_HEIGHT, INITIAL_PLAYER_STATS, WEAPON_DEFINITIONS, AVAILABLE_UPGRADES } from './constants';
import { UpgradeModal } from './components/UpgradeModal';
import { HUD } from './components/HUD';
import { GoogleGenAI } from "@google/genai";

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
  
  // Fluid solver is now nullable until init
  const fluidSolverRef = useRef<FluidSolver | null>(null);
  
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
    const edge = Math.floor(Math.random() * 4);
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
    let hp = 20 + gameTimeRef.current * 0.8; 
    let speed = 2.5; 
    let radius = 10;
    let color = '#f87171'; 

    if (gameTimeRef.current > 60 && typeRoll > 0.8) {
        type = 'tank';
        hp *= 3;
        speed = 2.0; 
        radius = 18;
        color = '#ef4444'; 
    } else if (gameTimeRef.current > 30 && typeRoll > 0.6) {
        type = 'shooter';
        hp *= 0.8;
        speed = 4.5;
        radius = 8;
        color = '#fca5a5'; 
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
      if (!fluidSolverRef.current) return;

      const intensity = type === FluidType.FIRE ? 1.0 : 0.8;
      const color = type === FluidType.FIRE ? {r: 2.0, g: 0.5, b: 0.1} : {r: 0.5, g: 0.1, b: 0.8};
      
      // Multi-splat for bigger boom
      for (let i=0; i<5; i++) {
          const dx = (Math.random() - 0.5) * 50;
          const dy = (Math.random() - 0.5) * 50;
          fluidSolverRef.current.splat(x + dx*0.5, y + dy*0.5, dx*10, dy*10, color);
      }

      // Add particles
      for(let i = 0; i < 15; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 5 + 3;
          particlesRef.current.push({
              id: Math.random().toString(),
              x, y, radius: Math.random() * 3 + 2,
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
      if (!fluidSolverRef.current) return;

      if (weapon.type === 'fireball') {
          // Target closest enemy
          let target = { x: mouseRef.current.x, y: mouseRef.current.y };
          let closestDist = 600; 
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
          const speed = 16; 
          
          projectilesRef.current.push({
              id: Math.random().toString(),
              x: player.x,
              y: player.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 8,
              color: '#f59e0b',
              damage: weapon.damage,
              duration: 180,
              fluidType: FluidType.FIRE,
              fluidIntensity: .1, 
              penetration: 1,
              markedForDeletion: false
          });
          weapon.currentCooldown = weapon.cooldown;
      } 
      else if (weapon.type === 'flamethrower') {
          const angle = Math.atan2(mouseRef.current.y - player.y, mouseRef.current.x - player.x);
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          
          // Fluid Stream
          fluidSolverRef.current.splat(
              player.x + dirX * 20, 
              player.y + dirY * 20, 
              dirX * 500, // High velocity
              dirY * 500, 
              {r: 2.0, g: 0.3, b: 0.1} // Bright Orange
          );
          
          projectilesRef.current.push({
              id: Math.random().toString(),
              x: player.x,
              y: player.y,
              vx: Math.cos(angle) * 14,
              vy: Math.sin(angle) * 14,
              radius: 20, 
              color: 'transparent',
              damage: weapon.damage,
              duration: 15,
              fluidType: FluidType.FIRE,
              fluidIntensity: 0,
              penetration: 999,
              markedForDeletion: false
          });
          weapon.currentCooldown = weapon.cooldown;
      }
      else if (weapon.type === 'nova') {
          createExplosion(player.x, player.y, 150, FluidType.MAGIC);
          for(let i=0; i<16; i++) {
              const angle = (i / 16) * Math.PI * 2;
               projectilesRef.current.push({
                  id: Math.random().toString(),
                  x: player.x,
                  y: player.y,
                  vx: Math.cos(angle) * 10,
                  vy: Math.sin(angle) * 10,
                  radius: 6,
                  color: '#a78bfa',
                  damage: weapon.damage,
                  duration: 60,
                  fluidType: FluidType.MAGIC,
                  fluidIntensity: 1,
                  penetration: 8,
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

    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05); // Cap dt
    lastTimeRef.current = time;
    
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
        
        player.x = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.y));

        if (solver) {
            solver.splat(player.x, player.y, dx * 100, dy * 100, {r: 0.1, g: 0.1, b: 0.1});
        }
    }

    player.weapons.forEach(w => {
        if (w.currentCooldown > 0) w.currentCooldown -= 1;
        fireWeapon(w, player);
    });

    // --- 2. Enemy Spawning & Logic ---
    const spawnRate = Math.max(0.01, 0.05 - (enemiesRef.current.length * 0.0002)); 
    if (Math.random() < spawnRate && enemiesRef.current.length < 200) spawnEnemy();

    enemiesRef.current.forEach(e => {
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed;
        e.y += Math.sin(angle) * e.speed;

        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        if (dist < player.radius + e.radius) {
            player.hp -= 0.5;
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
        
        if (solver) {
            if (p.fluidType === FluidType.FIRE) {
                // Fireball head (Bright Orange)
                solver.splat(p.x, p.y, p.vx * 20, p.vy * 20, {r: 2.0, g: 0.4, b: 0.05});
                
                // Smoke trail (Grey, slightly behind)
                // Offset the smoke slightly opposite to velocity
                const smokeX = p.x - p.vx * 3;
                const smokeY = p.y - p.vy * 3;
                
                // Splat smoke with less velocity inheritance so it "drags" behind
                if (Math.random() > 0.3) {
                     solver.splat(smokeX + (Math.random()-0.5)*10, smokeY + (Math.random()-0.5)*10, p.vx * 5, p.vy * 5, {r: 0.2, g: 0.2, b: 0.25});
                }
            } else if (p.fluidType === FluidType.MAGIC) {
                solver.splat(p.x, p.y, p.vx * 15, p.vy * 15, {r: 0.1, g: 0.0, b: 2.0});
            }
        }

        for (const e of enemiesRef.current) {
            if (p.markedForDeletion) break;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < p.radius + e.radius) {
                e.hp -= p.damage;
                p.penetration--;
                if (p.penetration <= 0) {
                    p.markedForDeletion = true;
                    createExplosion(p.x, p.y, 40, p.fluidType);
                }
                e.x += p.vx * 1.5;
                e.y += p.vy * 1.5;
            }
        }
    });

    // --- 4. Cleanup & XP ---
    enemiesRef.current = enemiesRef.current.filter(e => {
        if (e.hp <= 0) {
            spawnGem(e.x, e.y, 10);
            createExplosion(e.x, e.y, 30, FluidType.SMOKE); 
            scoreRef.current += 1;
            return false;
        }
        return true;
    });

    projectilesRef.current = projectilesRef.current.filter(p => !p.markedForDeletion && 
        p.x > -100 && p.x < WORLD_WIDTH + 100 && p.y > -100 && p.y < WORLD_HEIGHT + 100);

    gemsRef.current.forEach(g => {
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < 150) {
            g.x += (player.x - g.x) * 0.15;
            g.y += (player.y - g.y) * 0.15;
        }
        if (dist < player.radius + g.radius) {
            player.xp += g.value;
            g.markedForDeletion = true;
            checkLevelUp();
        }
    });
    gemsRef.current = gemsRef.current.filter(g => !g.markedForDeletion);

    particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        p.vx *= 0.92;
        p.vy *= 0.92;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // --- 5. Fluid Update ---
    if (solver) {
        // Step physics
        solver.update(0.016); // Fixed dt for stability
    }

    // --- 6. Game Rendering ---
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Draw Gems
        ctx.fillStyle = '#60a5fa';
        gemsRef.current.forEach(g => {
            ctx.beginPath();
            ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#60a5fa';
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Draw Enemies
        enemiesRef.current.forEach(e => {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fill();
            // Eyes
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(gameTimeRef.current)*2, e.y + Math.sin(gameTimeRef.current)*2, e.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Projectiles
        projectilesRef.current.forEach(p => {
            if(p.color === 'transparent') return;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0;
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
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'white';
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Gun
        const angle = Math.atan2(mouseRef.current.y - player.y, mouseRef.current.x - player.x);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(angle)*25, player.y + Math.sin(angle)*25);
        ctx.stroke();
    }

    gameTimeRef.current += dt;
    if (frameIdRef.current % 4 === 0) {
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

  // Init Fluid Solver
  useEffect(() => {
    if (fluidCanvasRef.current) {
        try {
            fluidSolverRef.current = new FluidSolver(fluidCanvasRef.current);
            console.log("WebGL Fluid Solver Initialized");
        } catch (e) {
            console.error("Failed to init WebGL Fluid Solver", e);
        }
    }
  }, []);

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
      <canvas 
        ref={fluidCanvasRef} 
        width={WORLD_WIDTH} 
        height={WORLD_HEIGHT} 
        className="absolute inset-0 w-full h-full"
      />
      
      <canvas 
        ref={canvasRef} 
        width={WORLD_WIDTH} 
        height={WORLD_HEIGHT}
        className="absolute inset-0 block"
      />

      <HUD player={uiState} time={uiState.time} score={uiState.score} />

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
      
      {uiState.time < 5 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-center pointer-events-none z-10">
              <p className="text-xl">WASD to Move</p>
              <p className="text-xl">Mouse to Aim</p>
              <p className="text-sm mt-2">Collect Blue Gems to Level Up</p>
          </div>
      )}
    </div>
  );
};