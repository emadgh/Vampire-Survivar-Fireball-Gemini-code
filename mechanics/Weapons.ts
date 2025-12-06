
import { Weapon, Player, Projectile, Enemy, FluidType, Vector2, Particle } from '../types';
import { FluidSolver } from '../services/FluidSolver';
import { createExplosion } from './Effects';

export const fireWeapon = (
    weapon: Weapon,
    player: Player,
    projectiles: Projectile[],
    enemies: Enemy[],
    fluidSolver: FluidSolver | null,
    particles: Particle[],
    mousePos: Vector2,
    gameTime: number
) => {
    // Void Orb is passive, handles its own rotation logic inside Game loop rendering really, 
    // but here we can manage collision or projectile spawning if they shoot.
    // For this implementation, Void Orbs are projectiles that persist around the player.
    if (weapon.type === 'void_orb') {
        const orbCount = 2 + weapon.level;
        const currentOrbs = projectiles.filter(p => p.id.startsWith(`orb_${weapon.id}`));
        
        if (currentOrbs.length < orbCount) {
             for (let i = currentOrbs.length; i < orbCount; i++) {
                projectiles.push({
                    id: `orb_${weapon.id}_${i}_${Math.random()}`,
                    x: player.x,
                    y: player.y,
                    vx: 0,
                    vy: 0,
                    radius: 6,
                    color: '#8b5cf6', // Violet
                    damage: weapon.damage,
                    duration: 999999, // Persist
                    fluidType: FluidType.MAGIC,
                    fluidIntensity: 0.5,
                    penetration: 999,
                    markedForDeletion: false
                });
             }
        }

        // Update Orb positions
        const radius = 60;
        const speed = 2.0; // rotation speed
        currentOrbs.forEach((p, idx) => {
            const angle = (gameTime * speed) + (idx * (Math.PI * 2 / orbCount));
            p.x = player.x + Math.cos(angle) * radius;
            p.y = player.y + Math.sin(angle) * radius;
            // Orbs don't decay duration in the normal way
            p.duration = 999999; 
            
            // Trail
            if (fluidSolver && Math.random() > 0.5) {
                 fluidSolver.splat(p.x, p.y, Math.cos(angle)*10, Math.sin(angle)*10, {r: 0.5, g: 0.0, b: 1.0});
            }
        });
        return; // Void orbs are managed differently
    }

    if (weapon.currentCooldown > 0) return;
    if (!fluidSolver) return;

    if (weapon.type === 'fireball') {
        // Target closest enemy
        let target = { x: mousePos.x, y: mousePos.y };
        let closestDist = 600; 
        let closestEnemy = null;
        for (const e of enemies) {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < closestDist) {
                closestDist = d;
                closestEnemy = e;
            }
        }
        if (closestEnemy) target = { x: closestEnemy.x, y: closestEnemy.y };

        const angle = Math.atan2(target.y - player.y, target.x - player.x);
        const speed = 16; 
        
        projectiles.push({
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
        const angle = Math.atan2(mousePos.y - player.y, mousePos.x - player.x);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        
        // Fluid Stream
        fluidSolver.splat(
            player.x + dirX * 20, 
            player.y + dirY * 20, 
            dirX * 500, // High velocity
            dirY * 500, 
            {r: 2.0, g: 0.3, b: 0.1} // Bright Orange
        );
        
        projectiles.push({
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
    else if (weapon.type === 'cluster_bomb') {
        // Throw bombs randomly around
        for(let i=0; i<3; i++) {
             const angle = Math.random() * Math.PI * 2;
             const speed = Math.random() * 10 + 5;
             projectiles.push({
                id: Math.random().toString(),
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 6,
                color: '#10b981', // Emerald
                damage: weapon.damage,
                duration: 40,
                fluidType: FluidType.SMOKE, // Explosive smoke
                fluidIntensity: 0.2,
                penetration: 1,
                markedForDeletion: false
            });
        }
        weapon.currentCooldown = weapon.cooldown;
    }
    else if (weapon.type === 'nova') {
        createExplosion(player.x, player.y, 150, FluidType.MAGIC, fluidSolver, particles);
        for(let i=0; i<16; i++) {
            const angle = (i / 16) * Math.PI * 2;
             projectiles.push({
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
