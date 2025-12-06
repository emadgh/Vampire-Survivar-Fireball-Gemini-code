
import React from 'react';
import { Player, Enemy } from '../types';
import { AlertTriangle, Skull } from 'lucide-react';

// HUD only needs these properties
type HUDPlayerProps = Pick<Player, 'hp' | 'maxHp' | 'xp' | 'level' | 'nextLevelXp' | 'weapons'>;

interface Props {
  player: HUDPlayerProps;
  time: number;
  score: number;
  wave?: number; // Optional until prop is passed
  isWaveActive?: boolean;
  boss?: Enemy | null;
}

export const HUD: React.FC<Props> = ({ player, time, score, wave, isWaveActive, boss }) => {
  const hpPercent = (player.hp / player.maxHp) * 100;
  const xpPercent = (player.xp / player.nextLevelXp) * 100;

  const minutes = Math.floor(time / 60).toString().padStart(2, '0');
  const seconds = (Math.floor(time % 60)).toString().padStart(2, '0');

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
      {/* Wave Warning */}
      {isWaveActive && !boss && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-2 text-red-500 animate-pulse">
              <AlertTriangle size={32} />
              <span className="text-2xl font-black tracking-widest uppercase">Wave {wave} Incoming</span>
              <AlertTriangle size={32} />
          </div>
      )}

      {/* BOSS HEALTH BAR */}
      {boss && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 flex flex-col items-center animate-in fade-in slide-in-from-top-10">
              <div className="flex items-center gap-2 text-purple-400 mb-1">
                  <Skull size={24} />
                  <span className="font-black text-xl tracking-widest uppercase">BOSS</span>
                  <Skull size={24} />
              </div>
              <div className="w-full h-8 bg-black/60 rounded-sm border-2 border-purple-900 overflow-hidden relative">
                  <div 
                      className="h-full bg-purple-600 transition-all duration-200"
                      style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-white drop-shadow-md">
                      {Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}
                  </div>
              </div>
          </div>
      )}

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
             <div key={w.id} className="flex items-center gap-2 text-xs text-gray-400 bg-black/40 p-2 rounded backdrop-blur-sm border-l-2 border-orange-500">
                 {w.isTemp ? <span className="text-yellow-400">⏱️</span> : <div className="w-2 h-2 rounded-full bg-orange-500" />}
                 <div className="flex flex-col">
                     <span className="font-bold text-gray-200">{w.name}</span>
                     {!w.isTemp && <span className="text-[10px]">Lvl {w.level}</span>}
                     {w.isTemp && w.expiresAt && <span className="text-[10px] text-yellow-300">{(w.expiresAt - time).toFixed(1)}s</span>}
                 </div>
             </div>
         ))}
      </div>

      {/* HP Bar (Centered Bottom) */}
      <div className="w-full max-w-md mx-auto mb-8 pointer-events-auto">
        <div className="relative h-6 bg-gray-900 rounded-full border border-gray-700 overflow-hidden shadow-lg">
            <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-200"
                style={{ width: `${Math.max(0, hpPercent)}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
                {Math.ceil(player.hp)} / {player.maxHp} HP
            </div>
        </div>
      </div>
    </div>
  );
};
