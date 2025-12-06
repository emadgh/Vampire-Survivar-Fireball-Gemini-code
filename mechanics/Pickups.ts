
import { Pickup, Player, Weapon, FluidType, Particle, Enemy } from '../types';
import { WEAPON_DEFINITIONS } from '../config/content';
import { triggerNuke } from './Effects';
import { FluidSolver } from '../services/FluidSolver';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../config/game';

export const spawnPickup = (x: number, y: number, pickups: Pickup[]) => {
    const rand = Math.random();
    
    // 5% chance to spawn a pickup on enemy death
    // if (rand > 0.05) return;

    const typeRoll = Math.random();
    let pickup: Pickup = {
        id: Math.random().toString(),
        x, y, radius: 15,
        color: '#fff',
        type: 'health', // Default
        markedForDeletion: false,
        icon: '♥'
    };

    if (typeRoll < 0.4) {
        // Health (40%)
        pickup.type = 'health';
        pickup.value = 30;
        pickup.color = '#ef4444';
        pickup.icon = '♥';
    } else if (typeRoll < 0.6) {
        // Big XP (20%)
        pickup.type = 'xp_big';
        pickup.value = 50;
        pickup.color = '#3b82f6';
        pickup.icon = '★';
    } else if (typeRoll < 0.75) {
        // Flamethrower (15%)
        pickup.type = 'weapon';
        pickup.subType = 'flamethrower';
        pickup.duration = 5; // seconds
        pickup.color = '#f97316';
        pickup.icon = '🔥';
    } else if (typeRoll < 0.85) {
        // Cluster Bomb (15%)
        pickup.type = 'weapon';
        pickup.subType = 'cluster_bomb';
        pickup.duration = 8; // seconds
        pickup.color = '#10b981';
        pickup.icon = '💣';
    } else {
        // Nuke (10%)
        pickup.type = 'nuke';
        pickup.color = '#fbbf24';
        pickup.icon = '☢';
    }

    pickups.push(pickup);
};

export const checkPickupCollisions = (
    player: Player, 
    pickups: Pickup[], 
    gameTime: number,
    enemies: Enemy[],
    fluidSolver: FluidSolver | null,
    particles: Particle[]
) => {
    for (const p of pickups) {
        if (p.markedForDeletion) continue;

        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist < player.radius + p.radius) {
            applyPickup(player, p, gameTime, enemies, fluidSolver, particles);
            p.markedForDeletion = true;
        }
    }
};

const applyPickup = (
    player: Player, 
    pickup: Pickup, 
    gameTime: number,
    enemies: Enemy[],
    fluidSolver: FluidSolver | null,
    particles: Particle[]
) => {
    switch (pickup.type) {
        case 'health':
            player.hp = Math.min(player.maxHp, player.hp + (pickup.value || 20));
            break;
        case 'xp_big':
            player.xp += (pickup.value || 100);
            break;
        case 'nuke':
            // Kill enemies within range
            const NUKE_RANGE = 300;
            enemies.forEach(e => {
                const dist = Math.hypot(e.x - player.x, e.y - player.y);
                if (dist <= NUKE_RANGE) {
                    e.hp = -999;
                }
            });
            triggerNuke(player.x, player.y, fluidSolver, particles);
            break;
        case 'weapon':
            if (pickup.subType && WEAPON_DEFINITIONS[pickup.subType]) {
                const baseWeapon = WEAPON_DEFINITIONS[pickup.subType];
                
                // Check if player already has this temp weapon
                const existing = player.weapons.find(w => w.id === baseWeapon.id && w.isTemp);
                if (existing) {
                    // Extend duration
                    existing.expiresAt = gameTime + (pickup.duration || 5);
                } else {
                    const newWeapon: Weapon = {
                        ...baseWeapon,
                        isTemp: true,
                        expiresAt: gameTime + (pickup.duration || 5),
                        currentCooldown: 0
                    };
                    player.weapons.push(newWeapon);
                }
            }
            break;
    }
};
