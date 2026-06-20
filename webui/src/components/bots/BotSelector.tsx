import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import BotCard from './BotCard';
import type { Theme } from '../../types/player';
import type { SystemBot } from '../../types/bot';

interface BotSelectorProps {
  theme: Theme;
  systemBots: SystemBot[];
  isLoadingBots: boolean;
  isSuperadmin: boolean;
  channelBotLimitInfo: { current: number; max: number };
  activeServerId: string | null;
  gridCols: number;
  setGridCols: Dispatch<SetStateAction<number>>;
  setCurrentView: Dispatch<SetStateAction<'servers' | 'bots' | 'player'>>;
  setSelectedBotIndex: Dispatch<SetStateAction<number | null>>;
  fetchChannels: (serverId: string, isSuperadmin?: boolean) => void;
}

const BotSelector = ({
  theme,
  systemBots,
  isLoadingBots,
  isSuperadmin,
  channelBotLimitInfo: _channelBotLimitInfo,
  activeServerId,
  gridCols,
  setGridCols,
  setCurrentView,
  setSelectedBotIndex,
  fetchChannels,
}: BotSelectorProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar p-6 md:p-20 relative">
      <div className="md:hidden flex justify-center mb-8">
        <div className={`flex items-center p-2 px-6 rounded-full border gap-4 ${
          theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'
        }`}>
          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">
            {t('common.density')}: {gridCols}
          </span>
          <input
            type="range" min="1" max="4" value={gridCols}
            onChange={(e) => setGridCols(Number(e.target.value))}
            className="w-24 accent-green-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-10">
        <h2 className="text-3xl font-black">{t('botSelector.title')}</h2>
        <button onClick={() => setCurrentView('servers')} className="text-zinc-500 font-bold hover:text-white transition">
          {t('botSelector.backToServers')}
        </button>
      </div>

      <div className="grid gap-16 justify-items-center w-full" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {isLoadingBots ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 animate-pulse">
            <div className="text-2xl mb-6 font-black uppercase text-zinc-500">{t('common.bot')}</div>
            <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">{t('botSelector.scanningFleet')}</h3>
          </div>
        ) : (
          [...systemBots]
            .filter((bot) => bot.isInServer)
            .sort((a, b) => {
              if (a.isBusy && !b.isBusy) return 1;
              if (!a.isBusy && b.isBusy) return -1;
              return a.id - b.id;
            })
            .map((bot) => (
              <BotCard
                key={bot.id}
                theme={theme}
                bot={bot}
                onSelect={(botId) => {
                  setSelectedBotIndex(botId);
                  if (activeServerId) fetchChannels(activeServerId, isSuperadmin);
                }}
              />
            ))
        )}
      </div>
    </div>
  );
};

export default BotSelector;