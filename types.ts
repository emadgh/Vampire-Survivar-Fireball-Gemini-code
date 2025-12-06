
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
  maxHp: number; // Added for HUD
  speed: number;
  damage: number;
  type: 'chaser' | 'shooter' | 'tank' | 'boss';
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

export interface Pickup extends Entity {
  type: 'health' | 'nuke' | 'weapon' | 'xp_big';
  subType?: string; // For weapon ID (e.g., 'flamethrower')
  value?: number; // For HP amount or XP amount
  duration?: number; // Duration if it's a temporary weapon
  icon?: string; // Character to render
}

export interface Weapon {
  id: string;
  name: string;
  cooldown: number;
  currentCooldown: number;
  damage: number;
  type: 'fireball' | 'flamethrower' | 'nova' | 'void_orb' | 'cluster_bomb';
  level: number;
  // Temporary weapon properties
  isTemp?: boolean;
  expiresAt?: number; // Game time when this expires
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

export interface WaveState {
    active: boolean;
    waveNumber: number;
    nextWaveTime: number;
    endTime: number;
    type: 'normal' | 'swarm' | 'siege' | 'elite' | 'boss';
    siegeSide?: number; // 0: Top, 1: Right, 2: Bottom, 3: Left
    bossSpawned?: boolean;
}
