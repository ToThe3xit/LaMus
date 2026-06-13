import type { Theme } from '../../types/theme';
import { useTranslation } from 'react-i18next';

interface OwnerBadgeProps {
  theme: Theme;
  ownerName: string | null;
  ownerId: string | null;
  delegatedIds: string[];
  currentUserId: string;
  isSuperadmin: boolean;
  hasRollback: boolean;
  rollbackSeconds: number;
  onRollback: () => void;
}

const OwnerBadge = ({
  theme,
  ownerName,
  ownerId,
  delegatedIds,
  currentUserId,
  isSuperadmin,
  hasRollback,
  rollbackSeconds,
  onRollback,
}: OwnerBadgeProps) => {
  const { t } = useTranslation();
  const isOwner = currentUserId === ownerId;
  const isDelegate = delegatedIds.includes(currentUserId);

  if (!ownerId && !isSuperadmin) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {ownerId && (
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
          isOwner
            ? 'bg-green-500/20 text-green-400 border border-green-500/40'
            : theme === 'dark'
              ? 'bg-zinc-800 text-zinc-400'
              : 'bg-zinc-100 text-zinc-500'
        }`}>
        {isOwner
          ? `👑 ${t('ownership.youOwn')}`
          : `👑 ${t('ownership.owner')}: ${ownerName ?? `#${ownerId?.slice(-4)}`}`}
        </span>
      )}
      {isDelegate && !isOwner && (
        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40">
          ✓ {t('ownership.delegated')}
        </span>
      )}
      {isSuperadmin && hasRollback && (
        <button
          onClick={onRollback}
          className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30 active:scale-95 transition-all"
        >
          ↩ {t('vote.rollback')} ({rollbackSeconds}s)
        </button>
      )}
    </div>
  );
};

export default OwnerBadge;