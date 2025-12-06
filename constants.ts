import { Upgrade, Weapon, FluidType } from "./types";

export const WORLD_WIDTH = window.innerWidth;
export const WORLD_HEIGHT = window.innerHeight;

export const INITIAL_PLAYER_STATS = {
  hp: 100,
  maxHp: 100,
  speed: 8.5, // Fast gameplay
  damageMultiplier: 1,
  areaMultiplier: 1,
  cooldownMultiplier: 1,
};

export const WEAPON_DEFINITIONS: Record<string, Weapon> = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    cooldown: 20, // Fast
    currentCooldown: 0,
    damage: 40,
    type: 'fireball',
    level: 1,
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    cooldown: 2, 
    currentCooldown: 0,
    damage: 6,
    type: 'flamethrower',
    level: 1,
  },
  nova: {
    id: 'nova',
    name: 'Frost Nova',
    cooldown: 120,
    currentCooldown: 0,
    damage: 25,
    type: 'nova',
    level: 1,
  }
};

export const AVAILABLE_UPGRADES: Upgrade[] = [
  {
    id: 'w_fireball_level',
    name: 'Upgrade Fireball',
    description: 'Increases damage and area of effect of Fireballs.',
    rarity: 'common',
    type: 'weapon',
    weaponType: 'fireball',
    apply: (p) => {
      const w = p.weapons.find(wp => wp.type === 'fireball');
      if (w) {
        w.level++;
        w.damage += 15;
        w.cooldown = Math.max(8, w.cooldown * 0.9);
      } else {
        p.weapons.push({ ...WEAPON_DEFINITIONS.fireball });
      }
    }
  },
  {
    id: 'w_flamethrower_unlock',
    name: 'Unlock Flamethrower',
    description: 'Spew a constant stream of fire in front of you.',
    rarity: 'rare',
    type: 'weapon',
    weaponType: 'flamethrower',
    apply: (p) => {
        const w = p.weapons.find(wp => wp.type === 'flamethrower');
        if (w) {
          w.level++;
          w.damage += 3;
        } else {
          p.weapons.push({ ...WEAPON_DEFINITIONS.flamethrower });
        }
    }
  },
  {
    id: 'w_nova_unlock',
    name: 'Unlock Frost Nova',
    description: 'Periodically releases a magical blast around you.',
    rarity: 'legendary',
    type: 'weapon',
    weaponType: 'nova',
    apply: (p) => {
        const w = p.weapons.find(wp => wp.type === 'nova');
        if (w) {
            w.level++;
            w.damage += 8;
            w.cooldown *= 0.85;
        } else {
            p.weapons.push({ ...WEAPON_DEFINITIONS.nova });
        }
    }
  },
  {
    id: 's_speed_up',
    name: 'Haste',
    description: 'Increases movement speed by 15%.',
    rarity: 'common',
    type: 'stat',
    apply: (p) => {
      p.speed *= 1.15;
    }
  },
  {
    id: 's_max_hp',
    name: 'Vitality',
    description: 'Increases Max HP by 25 and heals full.',
    rarity: 'common',
    type: 'stat',
    apply: (p) => {
      p.maxHp += 25;
      p.hp = p.maxHp;
    }
  }
];