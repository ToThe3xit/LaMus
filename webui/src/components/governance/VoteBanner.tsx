import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types/player';

interface VoteBannerProps {
  theme: Theme;
  action: string;
  currentVotes: number;
  requiredVotes: number;
  secondsRemaining: number;
  currentUserId: string;
  ownerId: string | null;
  isSuperadmin: boolean;
  onVote: () => void;
  onCancel: () => void;
}

const VoteBanner = ({
  theme,
  action,
  currentVotes,
  requiredVotes,
  secondsRemaining,
  currentUserId,
  ownerId,
  isSuperadmin,
  onVote,
  onCancel,
}: VoteBannerProps) => {
  const { t } = useTranslation();
  const isOwner = currentUserId === ownerId;
  const canVote = !isOwner && !isSuperadmin;
  const progress = requiredVotes > 0 ? Math.round((currentVotes / requiredVotes) * 100) : 0;

  const actionLabel: Record<string, string> = {
    skip: t('controls.skip'),
    clear: t('queue.clear'),
    leave: t('player.leave'),
  };

  return (
    <div className={`w-full rounded-2xl border-2 p-4 animate-in slide-in-from-top-4 duration-300 ${
      theme === 'dark'
        ? 'bg-yellow-500/10 border-yellow-500/40 text-white'
        : 'bg-yellow-50 border-yellow-400 text-black'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">
            {t('vote.active')}
          </span>
          <p className="text-sm font-bold mt-0.5">
            {t('vote.requestFor')}:{' '}
            <span className="text-yellow-400">{actionLabel[action] ?? action}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-yellow-400">{secondsRemaining}s</p>
        </div>
      </div>

      <div className={`w-full h-2 rounded-full mb-3 ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
        <div
          className="h-2 rounded-full bg-yellow-400 transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {currentVotes} / {requiredVotes} {t('vote.votes')}
        </span>
        <div className="flex gap-2">
          {canVote && (
            <button
              onClick={onVote}
              className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xs active:scale-95 transition-all"
            >
              {t('vote.voteYes')}
            </button>
          )}
          {isSuperadmin && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-red-900/20 border border-red-500/40 text-red-400 hover:bg-red-900/30 font-black text-xs active:scale-95 transition-all"
            >
              {t('vote.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoteBanner;