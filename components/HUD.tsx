import React from 'react';
import { Player } from '../types';

// HUD only needs these properties
type HUDPlayerProps = Pick<Player, 'hp' | 'maxHp' | 'xp' | 'level' | 'nextLevelXp' | 'weapons'>;

interface Props {
  player: HUDPlayerProps;
  time: number;
  score: number;
}

export const HUD: React.FC<Props> = ({ player, time, score }) => {
  const hpPercent = (player.hp / player.maxHp) * 100;
  const xpPercent = (player.xp / player.nextLevelXp) * 100;

  const minutes = Math.floor(time / 60).toString().padStart(2, '0');
  const seconds = (time % 60).toString().padStart(2, '0');

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
      {/* Top Bar */}
      <div className="w-full flex justify-between items-start">
        {/* XP Bar */}
        <div className="flex-1 max-w-2xl mr-4">
            <div className="flex justify-between text-xs font-bold uppercase text-blue-200 mb-1">
                <span>LVL {player.level}</span>
                <span>{Math.floor(player.xp)} / {player.nextLevelXp} XP</span>
            </div>
            <div className="h-4 bg-gray-900/80 rounded-full border border-gray-700 overflow-hidden backdrop-blur">
                <div 
                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300"
                    style={{ width: `${xpPercent}%` }}
                />
            </div>
        </div>

        {/* Timer & Score */}
        <div className="flex flex-col items-end">
            <div className="text-3xl font-mono font-bold text-white drop-shadow-lg">
                {minutes}:{seconds}
            </div>
            <div className="text-sm text-yellow-500 font-bold">
                KILLS: {score}
            </div>
        </div>
      </div>

      {/* Weapons List (Bottom Left) */}
      <div className="absolute bottom-8 left-4 flex flex-col gap-2">
         {player.weapons.map(w => (
             <div key={w.id} className="flex items-center gap-2 text-xs text-gray-400 bg-black/40 p-2 rounded backdrop-blur-sm">
                 <div className="w-2 h-2 rounded-full bg-orange-500" />
                 <span className="font-bold text-gray-200">{w.name}</span>
                 <span>Lvl {w.level}</span>
             </div>
         ))}
      </div>

      {/* HP Bar (Centered Bottom) */}
      <div className="w-full max-w-md mx-auto mb-8 pointer-events-auto">
        <div className="relative h-6 bg-gray-900 rounded-full border border-gray-700 overflow-hidden shadow-lg">
            <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-200"
                style={{ width: `${hpPercent}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
                {Math.ceil(player.hp)} / {player.maxHp} HP
            </div>
        </div>
      </div>
    </div>
  );
};