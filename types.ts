export interface Vector2 {
  x: number;
  y: number;
}

export enum FluidType {
  FIRE,
  SMOKE,
  MAGIC,
  POISON
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  markedForDeletion: boolean;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  speed: number;
  xp: number;
  level: number;
  nextLevelXp: number;
  weapons: Weapon[];
}

export interface Enemy extends Entity {
  hp: number;
  speed: number;
  damage: number;
  type: 'chaser' | 'shooter' | 'tank';
}

export interface Projectile extends Entity {
  vx: number;
  vy: number;
  damage: number;
  duration: number;
  fluidType: FluidType;
  fluidIntensity: number;
  penetration: number;
}

export interface XPGem extends Entity {
  value: number;
}

export interface Weapon {
  id: string;
  name: string;
  cooldown: number;
  currentCooldown: number;
  damage: number;
  type: 'fireball' | 'flamethrower' | 'nova' | 'smoke_trail';
  level: number;
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'legendary';
  apply: (player: Player) => void;
  type: 'weapon' | 'stat';
  weaponType?: string; // If it unlocks or upgrades a specific weapon
}

export interface Particle extends Entity {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}
