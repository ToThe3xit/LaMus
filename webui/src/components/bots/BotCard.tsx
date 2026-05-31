import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types/player';
import type { SystemBot } from '../../types/bot';

interface BotCardProps {
  theme: Theme;
  bot: SystemBot;
  onSelect: (botId: number) => void;
}

const BotCard = ({ theme, bot, onSelect }: BotCardProps) => {
  const { t } = useTranslation();
  const isUnavailable = bot.isBusy || bot.userHasPermission === false;

  const statusText = bot.isBusy
    ? t('botCard.busy')
    : bot.userHasPermission === false
    ? t('botCard.joinChannel')
    : t('botCard.ready');

  return (
    <div
      onClick={() => { if (!isUnavailable) onSelect(bot.id); }}
      className={`max-w-xs w-full aspect-[4/5] p-10 rounded-[4rem] border-4 flex flex-col items-center justify-center gap-8 transition-all overflow-hidden ${
        isUnavailable
          ? `opacity-30 grayscale cursor-not-allowed ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`
          : `cursor-pointer shadow-2xl hover:scale-[1.05] active:scale-95 hover:border-green-500 hover:bg-green-500/10 hover:shadow-green-500/20 ${
              theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200'
            }`
      }`}
    >
      <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-sm font-black shrink-0 border shadow-inner overflow-hidden ${
        theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'
      }`}>
        {bot.avatarUrl
          ? <img src={bot.avatarUrl} alt="" className="w-full h-full object-cover" />
          : t('common.bot')}
      </div>
      <div className="text-center">
        <h3 className="text-2xl font-black tracking-tight leading-tight mb-2 px-2">{bot.name}</h3>
        <p className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-80 ${isUnavailable ? 'text-red-500' : 'text-green-500'}`}>
          {statusText}
        </p>
      </div>
    </div>
  );
};

export default BotCard;