import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types/player';

interface HistoryPanelProps {
  theme: Theme;
  count: number;
  visible: boolean;
}

const HistoryPanel = ({ theme: _theme, count, visible }: HistoryPanelProps) => {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div className="flex items-center justify-between mb-4 mt-2">
      <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
        {t('queue.previous')}
      </h3>
      <span className="text-[9px] font-bold text-zinc-600 px-2 py-0.5 rounded-full bg-zinc-800/40">
        {count}
      </span>
    </div>
  );
};

export default HistoryPanel;