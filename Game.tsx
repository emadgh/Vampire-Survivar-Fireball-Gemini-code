
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FluidSolver } from './services/FluidSolver';
import { Player, Enemy, Projectile, XPGem, Particle, FluidType, Vector2, Pickup, WaveState } from './types';
import { WORLD_WIDTH, WORLD_HEIGHT, INITIAL_PLAYER_STATS, WEAPON_DEFINITIONS, AVAILABLE_UPGRADES } from './constants';
import { UpgradeModal } from './components/UpgradeModal';
import { HUD } from './components/HUD';
import { manageEnemySpawning } from './mechanics/Enemies';
import { fireWeapon } from './mechanics/Weapons';
import { createExplosion } from './mechanics/Effects';
import { spawnPickup, checkPickupCollisions } from './mechanics/Pickups';

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
  const pickupsRef = useRef<Pickup[]>([]);
  
  // Wave State
  const waveStateRef = useRef<WaveState>({
      active: false,
      waveNumber: 0,
      nextWaveTime: 30, // First wave starts at 30s
      endTime: 0,
      type: 'normal'
  });
  
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
      weapons: [] as Player['weapons'],
      wave: 0,
      isWaveActive: false,
      boss: null as Enemy | null
  });

  const spawnGem = (x: number, y: number, value: number) => {
      gemsRef.current.push({
          id: Math.random().toString(),
          x, y, radius: 4,
          color: '#60a5fa', // Blue-400
          value,
          markedForDeletion: false
      });
  };

  const checkLevelUp = () => {
    const p = playerRef.current;
    if (p.xp >= p.nextLevelXp) {
        p.xp -= p.nextLevelXp;
        p.level++;
        p.nextLevelXp = Math.floor(p.nextLevelXp * 1.35);
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
    const tick = dt * 60; // Normalize to 60 FPS (1.0 = 60fps)
    
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
        player.x += (dx / len) * player.speed * tick;
        player.y += (dy / len) * player.speed * tick;
        
        player.x = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.y));

        if (solver) {
            solver.splat(
                player.x, 
                player.y, 
                dx * 100 * tick, 
                dy * 100 * tick, 
                {r: 0.1 * tick, g: 0.1 * tick, b: 0.1 * tick}
            );
        }
    }

    // Filter out expired temp weapons
    player.weapons = player.weapons.filter(w => !w.expiresAt || w.expiresAt > gameTimeRef.current);

    player.weapons.forEach(w => {
        if (w.currentCooldown > 0) w.currentCooldown -= tick;
        fireWeapon(
            w, player, projectilesRef.current, enemiesRef.current, 
            solver, particlesRef.current, mouseRef.current, gameTimeRef.current, tick
        );
    });

    // Handle Void Orbs cleanup (remove projectiles if weapon gone)
    if (!player.weapons.find(w => w.type === 'void_orb')) {
        projectilesRef.current = projectilesRef.current.filter(p => !p.id.startsWith('orb_'));
    }

    // --- 2. Enemy Spawning & Logic (New Wave System) ---
    manageEnemySpawning(enemiesRef.current, player, gameTimeRef.current, waveStateRef.current);

    enemiesRef.current.forEach(e => {
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(angle) * e.speed * tick;
        e.y += Math.sin(angle) * e.speed * tick;

        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        if (dist < player.radius + e.radius) {
            player.hp -= (e.type === 'boss' ? 0.8 : 0.5);
        }
    });

    if (player.hp <= 0) {
        setGameOver(true);
    }

    // --- 3. Projectile Logic ---
    projectilesRef.current.forEach(p => {
        const isOrb = p.id.startsWith('orb_');

        if (!isOrb) {
            p.x += p.vx * tick;
            p.y += p.vy * tick;
            p.duration -= tick;
            if (p.duration <= 0) p.markedForDeletion = true;
            
            if (solver) {
                if (p.fluidType === FluidType.FIRE) {
                    // Fireball head (Bright Orange)
                    solver.splat(
                        p.x, p.y, 
                        p.vx * 20 * tick, 
                        p.vy * 20 * tick, 
                        {r: 2.0 * tick, g: 0.4 * tick, b: 0.05 * tick}
                    );
                    
                    // Smoke trail (Grey, slightly behind)
                    const smokeX = p.x - p.vx * 3;
                    const smokeY = p.y - p.vy * 3;
                    
                    if (Math.random() < 0.3 * tick) { // Scaled probability
                         solver.splat(
                             smokeX + (Math.random()-0.5)*10, 
                             smokeY + (Math.random()-0.5)*10, 
                             p.vx * 5 * tick, 
                             p.vy * 5 * tick, 
                             {r: 0.2 * tick, g: 0.2 * tick, b: 0.25 * tick}
                        );
                    }
                } else if (p.fluidType === FluidType.SMOKE) {
                    // For bombs
                     solver.splat(
                         p.x, p.y, 
                         p.vx * 5 * tick, 
                         p.vy * 5 * tick, 
                         {r: 0.3 * tick, g: 0.3 * tick, b: 0.3 * tick}
                    );
                } else if (p.fluidType === FluidType.MAGIC) {
                    solver.splat(
                        p.x, p.y, 
                        p.vx * 15 * tick, 
                        p.vy * 15 * tick, 
                        {r: 0.1 * tick, g: 0.0, b: 2.0 * tick}
                    );
                }
            }
        }

        for (const e of enemiesRef.current) {
            if (p.markedForDeletion) break;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < p.radius + e.radius) {
                if (p.hitMap && p.hitMap[e.id] && gameTimeRef.current < p.hitMap[e.id]) continue;
                
                e.hp -= p.damage;
                if (!p.hitMap) p.hitMap = {};
                p.hitMap[e.id] = gameTimeRef.current + (isOrb ? 0.4 : 0.2); // cooldown per hit
                
                if (!isOrb) {
                    p.penetration--;
                    if (p.penetration <= 0) {
                        p.markedForDeletion = true;
                        createExplosion(p.x, p.y, 40, p.fluidType, solver, particlesRef.current);
                    }
                    
                    // Knockback (Bosses resist it)
                    if (e.type !== 'boss') {
                        e.x += p.vx * 1.5; // Impulse knockback is distance based, mostly ok without tick for immediate impact
                        e.y += p.vy * 1.5;
                    }
                }
            }
        }
    });

    // --- 4. Cleanup & XP & Pickups ---
    enemiesRef.current = enemiesRef.current.filter(e => {
        if (e.hp <= 0) {
            const isBoss = e.type === 'boss';
            const xpValue = isBoss ? 500 : 10;
            const pickupChance = isBoss ? 1.0 : 0.05; // Boss guarantees pickup

            spawnGem(e.x, e.y, xpValue);
            if (Math.random() <= pickupChance || isBoss) {
                 spawnPickup(e.x, e.y, pickupsRef.current); 
            }
            
            createExplosion(e.x, e.y, e.radius * 2, FluidType.SMOKE, solver, particlesRef.current); 
            scoreRef.current += 1;
            return false;
        }
        return true;
    });

    projectilesRef.current = projectilesRef.current.filter(p => !p.markedForDeletion && 
        p.x > -100 && p.x < WORLD_WIDTH + 100 && p.y > -100 && p.y < WORLD_HEIGHT + 100);

    // Pickups collision
    checkPickupCollisions(player, pickupsRef.current, gameTimeRef.current, enemiesRef.current, solver, particlesRef.current);
    pickupsRef.current = pickupsRef.current.filter(p => !p.markedForDeletion);

    // XP Gems
    gemsRef.current.forEach(g => {
        const dist = Math.hypot(player.x - g.x, player.y - g.y);
        if (dist < 150) {
            g.x += (player.x - g.x) * 0.15 * tick;
            g.y += (player.y - g.y) * 0.15 * tick;
        }
        if (dist < player.radius + g.radius) {
            player.xp += g.value;
            g.markedForDeletion = true;
            checkLevelUp();
        }
    });
    gemsRef.current = gemsRef.current.filter(g => !g.markedForDeletion);

    particlesRef.current.forEach(p => {
        p.x += p.vx * tick;
        p.y += p.vy * tick;
        p.life -= 0.03 * tick;
        p.vx *= (1 - 0.08 * tick); // Drag
        p.vy *= (1 - 0.08 * tick);
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // --- 5. Fluid Update ---
    if (solver) {
        // Step physics with real time delta for speed independence
        solver.update(dt); 
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

        // Draw Pickups
        pickupsRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            // Pulse effect
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + Math.sin(gameTimeRef.current * 10) * 4, 0, Math.PI * 2);
            ctx.stroke();
            
            // Icon
            ctx.fillStyle = 'black';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.icon || '?', p.x, p.y);
        });

        // Draw Enemies
        enemiesRef.current.forEach(e => {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fill();
            
            if (e.type === 'boss') {
                 // Boss Glow
                 ctx.shadowBlur = 30;
                 ctx.shadowColor = '#a855f7';
                 ctx.strokeStyle = '#fff';
                 ctx.lineWidth = 2;
                 ctx.stroke();
                 ctx.shadowBlur = 0;
            }

            // Eyes
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(gameTimeRef.current)*e.radius*0.2, e.y + Math.sin(gameTimeRef.current)*e.radius*0.2, e.radius * 0.3, 0, Math.PI * 2);
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
        // Find Boss
        const activeBoss = enemiesRef.current.find(e => e.type === 'boss') || null;

        setUiState({
            hp: player.hp,
            maxHp: player.maxHp,
            xp: player.xp,
            nextLevelXp: player.nextLevelXp,
            level: player.level,
            time: gameTimeRef.current,
            score: scoreRef.current,
            weapons: [...player.weapons],
            wave: waveStateRef.current.waveNumber,
            isWaveActive: waveStateRef.current.active,
            boss: activeBoss
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
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none cursor-crosshair">
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

      <HUD 
        player={uiState} 
        time={uiState.time} 
        score={uiState.score} 
        wave={uiState.wave}
        isWaveActive={uiState.isWaveActive}
        boss={uiState.boss}
      />

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
              <p className="text-sm mt-2">Kill enemies for pickups & upgrades!</p>
          </div>
      )}
    </div>
  );
};
