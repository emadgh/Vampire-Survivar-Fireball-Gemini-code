import React from 'react';
import { Upgrade } from '../types';
import { Flame, Wind, Snowflake, Heart, Zap, Plus } from 'lucide-react';

interface Props {
  upgrades: Upgrade[];
  onSelect: (upgrade: Upgrade) => void;
}

const getIcon = (type: string, id: string) => {
  if (type === 'stat') {
    if (id.includes('hp')) return <Heart className="text-red-500" />;
    if (id.includes('speed')) return <Wind className="text-blue-400" />;
    return <Plus className="text-white" />;
  }
  if (id.includes('fireball')) return <Flame className="text-orange-500" />;
  if (id.includes('flamethrower')) return <Zap className="text-yellow-400" />;
  if (id.includes('nova')) return <Snowflake className="text-cyan-400" />;
  return <Flame className="text-gray-400" />;
};

export const UpgradeModal: React.FC<Props> = ({ upgrades, onSelect }) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-4xl w-full p-6">
        <h2 className="text-4xl font-bold text-center text-yellow-500 mb-2 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">
          LEVEL UP!
        </h2>
        <p className="text-center text-gray-400 mb-8">Choose a blessing to enhance your power</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {upgrades.map((upgrade, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(upgrade)}
              className={`
                group relative p-6 rounded-xl border-2 transition-all duration-300 hover:-translate-y-2
                flex flex-col items-center text-center gap-4 bg-gray-900
                ${upgrade.rarity === 'legendary' ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 
                  upgrade.rarity === 'rare' ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 
                  'border-gray-700 hover:border-yellow-500'}
              `}
            >
              <div className="p-4 rounded-full bg-gray-800 group-hover:bg-gray-700 transition-colors">
                {getIcon(upgrade.type, upgrade.id)}
              </div>
              
              <div>
                <h3 className={`text-xl font-bold mb-2 ${
                  upgrade.rarity === 'legendary' ? 'text-purple-400' :
                  upgrade.rarity === 'rare' ? 'text-blue-400' :
                  'text-white'
                }`}>
                  {upgrade.name}
                </h3>
                <p className="text-sm text-gray-400 group-hover:text-gray-300">
                  {upgrade.description}
                </p>
              </div>
              
              <div className="absolute bottom-2 text-xs uppercase tracking-widest opacity-50 font-bold">
                {upgrade.rarity}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
