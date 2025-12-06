
import { FluidSolver } from '../services/FluidSolver';
import { Particle, FluidType } from '../types';

export const createExplosion = (
    x: number, 
    y: number, 
    radius: number, 
    type: FluidType,
    fluidSolver: FluidSolver | null,
    particles: Particle[]
) => {
    if (!fluidSolver) return;

    const color = type === FluidType.FIRE ? {r: 2.0, g: 0.5, b: 0.1} : {r: 0.5, g: 0.1, b: 0.8};
    
    // Multi-splat for bigger boom
    for (let i=0; i<5; i++) {
        const dx = (Math.random() - 0.5) * 50;
        const dy = (Math.random() - 0.5) * 50;
        fluidSolver.splat(x + dx*0.5, y + dy*0.5, dx*10, dy*10, color);
    }

    // Add particles
    for(let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 3;
        particles.push({
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

export const triggerNuke = (
    x: number, 
    y: number, 
    fluidSolver: FluidSolver | null,
    particles: Particle[]
) => {
    if (!fluidSolver) return;

    // Create a ring of explosions within 300 radius
    for (let i = 0; i < 150; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const dist = Math.random() * 300; // 300 radius range
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        
        // Outward force
        fluidSolver.splat(
            x + dx * dist, 
            y + dy * dist, 
            dx * 2000, 
            dy * 2000, 
            {r: 5.0, g: 2.0, b: 0.5} // Super bright yellow/white
        );
    }

    // Flash particles within the radius
    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 300;
        particles.push({
            id: Math.random().toString(),
            x: x + Math.cos(angle) * dist, 
            y: y + Math.sin(angle) * dist, 
            radius: Math.random() * 5 + 2,
            color: '#fff',
            vx: (Math.random() - 0.5) * 50,
            vy: (Math.random() - 0.5) * 50,
            life: 2.0,
            maxLife: 2.0,
            markedForDeletion: false
        });
    }
};
