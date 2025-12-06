
import { Weapon, Upgrade } from "../types";

export const WEAPON_DEFINITIONS: Record<string, Weapon> = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    cooldown: 20,
    currentCooldown: 0,
    damage: 40,
    type: 'fireball',
    level: 1,
  },
  void_orb: {
    id: 'void_orb',
    name: 'Void Orbs',
    cooldown: 0, // Passive rotation
    currentCooldown: 0,
    damage: 15,
    type: 'void_orb',
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
  },
  // Temporary Weapons (Not available via Level Up)
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    cooldown: 2, 
    currentCooldown: 0,
    damage: 6,
    type: 'flamethrower',
    level: 1,
  },
  cluster_bomb: {
    id: 'cluster_bomb',
    name: 'Cluster Bomb',
    cooldown: 10,
    currentCooldown: 0,
    damage: 60,
    type: 'cluster_bomb',
    level: 1
  }
};

export const AVAILABLE_UPGRADES: Upgrade[] = [
  // Fireball Upgrades
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
  // Void Orb Upgrades
  {
    id: 'w_void_orb_unlock',
    name: 'Unlock Void Orbs',
    description: 'Summon dark orbs that circle you and destroy enemies.',
    rarity: 'rare',
    type: 'weapon',
    weaponType: 'void_orb',
    apply: (p) => {
        const w = p.weapons.find(wp => wp.type === 'void_orb');
        if (w) {
          w.level++;
          w.damage += 5;
        } else {
          p.weapons.push({ ...WEAPON_DEFINITIONS.void_orb });
        }
    }
  },
  // Nova Upgrades
  {
    id: 'w_nova_unlock',
    name: 'Unlock Frost Nova',
    description: 'Periodically releases a magical blast around you.',
    rarity: 'rare',
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
  // Stats
  {
    id: 's_speed_up',
    name: 'Haste',
    description: 'Increases movement speed by 15%.',
    rarity: 'common',
    type: 'stat',
    apply: (p) => {
      p.speed *= 1.05;
    }
  },
  {
    id: 's_max_hp',
    name: 'Vitality',
    description: 'Increases Max HP by 30 and heals full.',
    rarity: 'common',
    type: 'stat',
    apply: (p) => {
      p.maxHp += 30;
      p.hp = p.maxHp;
    }
  },
  {
    id: 's_power',
    name: 'Arcane Power',
    description: 'Increases damage of all weapons by 20%.',
    rarity: 'legendary',
    type: 'stat',
    apply: (p) => {
      p.weapons.forEach(w => w.damage = Math.ceil(w.damage * 1.2));
    }
  }
];
