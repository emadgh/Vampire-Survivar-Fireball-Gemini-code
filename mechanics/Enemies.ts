
import { Enemy, Player, WaveState } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../config/game';

// Configuration
const WAVE_INTERVAL = 45; // Seconds between wave checks/starts
const WAVE_DURATION = 20; // How long a wave lasts

export const spawnEnemy = (
    enemies: Enemy[], 
    player: Player,
    gameTime: number, 
    forcedType?: Enemy['type'],
    forcedSide?: number // 0-3
) => {
    // Determine Spawn Side
    // 0: Top, 1: Right, 2: Bottom, 3: Left
    const edge = forcedSide !== undefined ? forcedSide : Math.floor(Math.random() * 4);
    
    let x = 0, y = 0;
    const padding = 80;
    
    // Randomize position along the chosen edge
    switch(edge) {
        case 0: // Top
            x = Math.random() * WORLD_WIDTH; 
            y = -padding; 
            break;
        case 1: // Right
            x = WORLD_WIDTH + padding; 
            y = Math.random() * WORLD_HEIGHT; 
            break;
        case 2: // Bottom
            x = Math.random() * WORLD_WIDTH; 
            y = WORLD_HEIGHT + padding; 
            break;
        case 3: // Left
            x = -padding; 
            y = Math.random() * WORLD_HEIGHT; 
            break;
    }

    // Scaling Factor based on Time and Level
    // Enemy strength increases by ~10% per minute and ~5% per player level
    const difficultyScale = 1 + (gameTime / 60) * 0.5 + (player.level * 0.1);

    // Determine Enemy Type
    // As game progresses, higher chance for tougher enemies
    const typeRoll = Math.random();
    let type: Enemy['type'] = forcedType || 'chaser';
    
    // Default stats
    let hp = 15 * difficultyScale;
    let speed = (2.2 + (gameTime / 400)) * (0.9 + Math.random() * 0.2); // Random variance
    let radius = 12;
    let color = '#f87171'; // Red-400
    let damage = 10;

    // Type Logic
    if (type === 'boss') {
        hp = 2500 * difficultyScale; // Massive HP
        speed = 1.2; // Slow
        radius = 45; // Big
        color = '#7e22ce'; // Purple-700
        damage = 50;
    } else if (type === 'tank' || (!forcedType && gameTime > 60 && typeRoll > 0.85)) {
        type = 'tank';
        hp *= 4.0;
        speed *= 0.6; 
        radius = 22;
        color = '#991b1b'; // Red-800
        damage *= 2;
    } else if (type === 'shooter' || (!forcedType && gameTime > 30 && typeRoll > 0.70)) {
        type = 'shooter';
        hp *= 0.8;
        speed *= 1.4; // Fast but stops to shoot (shooting logic implemented elsewhere ideally, or they just ram fast)
        radius = 10;
        color = '#fda4af'; // Rose-300
    }

    enemies.push({
        id: Math.random().toString(36),
        x, y, radius, color,
        hp, maxHp: hp, speed, damage, type,
        markedForDeletion: false
    });
};

export const manageEnemySpawning = (
    enemies: Enemy[],
    player: Player,
    gameTime: number,
    waveState: WaveState
) => {
    // 1. Difficulty Caps
    // Cap increases with time and level
    const maxEnemies = 80 + (player.level * 4) + (gameTime / 3);
    
    // Allow going over cap slightly for bosses or forced spawns, but generally hold back
    if (enemies.length >= Math.min(maxEnemies, 350)) return;

    // 2. Wave Management Logic
    if (!waveState.active) {
        // Check if it's time to start a wave
        if (gameTime >= waveState.nextWaveTime) {
            startWave(waveState, gameTime);
        } else {
            // NORMAL PHASE
            // Spawn rate increases slowly
            const spawnChance = 0.04 + (gameTime * 0.0008) + (player.level * 0.003);
            if (Math.random() < spawnChance) {
                spawnEnemy(enemies, player, gameTime);
            }
        }
    } else {
        // WAVE PHASE
        // Check if wave is over
        if (gameTime >= waveState.endTime && waveState.type !== 'boss') {
            // End wave normally
            waveState.active = false;
            waveState.nextWaveTime = gameTime + WAVE_INTERVAL;
            waveState.type = 'normal';
        } else if (waveState.type === 'boss' && !enemies.some(e => e.type === 'boss') && waveState.bossSpawned) {
             // Boss died, end wave
             waveState.active = false;
             waveState.nextWaveTime = gameTime + WAVE_INTERVAL;
             waveState.type = 'normal';
        } else {
            // Execute Wave Spawning Logic
            executeWaveLogic(enemies, player, gameTime, waveState);
        }
    }
};

const startWave = (wave: WaveState, time: number) => {
    wave.active = true;
    wave.waveNumber++;
    wave.endTime = time + WAVE_DURATION;
    wave.bossSpawned = false;
    
    // Determine Wave Type
    // Every 5th wave is a Boss fight
    if (wave.waveNumber % 2 === 0) {
        wave.type = 'boss';
    } else {
        // Cycle: Swarm -> Siege -> Elite -> Swarm...
        const cycle = wave.waveNumber % 3;
        
        if (cycle === 1) {
            wave.type = 'swarm';
        } else if (cycle === 2) {
            wave.type = 'siege';
            wave.siegeSide = Math.floor(Math.random() * 4); // Pick a random side
        } else {
            wave.type = 'elite';
        }
    }
};

const executeWaveLogic = (
    enemies: Enemy[], 
    player: Player, 
    gameTime: number, 
    wave: WaveState
) => {
    
    if (wave.type === 'boss') {
        // Spawn Boss ONCE
        if (!wave.bossSpawned) {
            spawnEnemy(enemies, player, gameTime, 'boss');
            wave.bossSpawned = true;
        }
        // Spawn some minions occasionally during boss fight
        if (Math.random() < 0.02) {
            spawnEnemy(enemies, player, gameTime, 'chaser');
        }
    }
    else if (wave.type === 'swarm') {
        // Spawns from everywhere, lots of weaklings
        if (Math.random() < 0.15) { // High frequency
            spawnEnemy(enemies, player, gameTime, 'chaser');
        }
    } 
    else if (wave.type === 'siege') {
        // Spawns heavily from ONE side
        if (Math.random() < 0.2) { // Very high frequency
            spawnEnemy(enemies, player, gameTime, undefined, wave.siegeSide);
        }
    }
    else if (wave.type === 'elite') {
        // Spawns Tanks
        if (Math.random() < 0.05) {
            spawnEnemy(enemies, player, gameTime, 'tank');
        }
    }
};
