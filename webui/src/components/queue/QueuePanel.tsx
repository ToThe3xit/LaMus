import React from 'react';
import { useTranslation } from 'react-i18next';
import QueueItem from './QueueItem';
import HistoryPanel from './HistoryPanel';
import type { Theme, PlayerState } from '../../types/player';

interface QueuePanelProps {
  theme: Theme;
  playerState: PlayerState;
  activePlayerKey: string | null;
  unifiedList: string[];
  historyList: string[];
  currentIndex: number;
  queueScrollRef: React.RefObject<HTMLDivElement | null>;
  currentTrackRef: React.RefObject<HTMLDivElement | null>;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  activeDragHandle: number | null;
  isDraggingQueue: boolean;
  startQueueY: number;
  scrollQueueTop: number;
  shufflePressed: boolean;
  setShufflePressed: React.Dispatch<React.SetStateAction<boolean>>;
  dedupPressed: boolean;
  setDedupPressed: React.Dispatch<React.SetStateAction<boolean>>;
  sortMode: 'title' | 'duration' | null;
  setSortMode: React.Dispatch<React.SetStateAction<'title' | 'duration' | null>>;
  setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setActiveDragHandle: React.Dispatch<React.SetStateAction<number | null>>;
  setIsDraggingQueue: React.Dispatch<React.SetStateAction<boolean>>;
  setStartQueueY: React.Dispatch<React.SetStateAction<number>>;
  setScrollQueueTop: React.Dispatch<React.SetStateAction<number>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const SORT_MODES = (t: (key: string) => string) => [
  { key: 'title'    as const, label: t('queue.sortTitle')    },
  { key: 'duration' as const, label: t('queue.sortDuration') },
];

const QueuePanel = ({
  theme,
  playerState,
  activePlayerKey,
  unifiedList,
  historyList,
  currentIndex,
  queueScrollRef,
  currentTrackRef,
  draggedIndex,
  dragOverIndex,
  activeDragHandle,
  isDraggingQueue,
  startQueueY,
  scrollQueueTop,
  shufflePressed,
  setShufflePressed,
  dedupPressed,
  setDedupPressed,
  sortMode,
  setSortMode,
  setDraggedIndex,
  setDragOverIndex,
  setActiveDragHandle,
  setIsDraggingQueue,
  setStartQueueY,
  setScrollQueueTop,
  sendCommand,
}: QueuePanelProps) => {
  const { t } = useTranslation();
  const isRadioOn = playerState.isRadioActive === true;

  const handleSort = (mode: 'title' | 'duration') => {
    setSortMode(mode);
    sendCommand('sort_queue', mode);
    setTimeout(() => setSortMode(null), 600);
  };

  return (
    <div
      className={`w-full xl:w-96 flex flex-col relative z-20 rounded-[3rem] p-6 md:p-8 border shrink-0 xl:h-full xl:max-h-[calc(100dvh-6rem)] xl:overflow-hidden ${
        theme === 'dark'
          ? 'bg-zinc-950 border-zinc-900'
          : 'bg-white border-zinc-200 shadow-xl'
      }`}
    >
      <button
        onClick={() => { if (!activePlayerKey) return; sendCommand('radio_network'); }}
        className={`w-full py-4 mb-4 rounded-2xl font-black text-[10px] tracking-[0.2em] border transition-all active:scale-95 shrink-0 ${
          !isRadioOn
            ? theme === 'dark'
              ? 'bg-zinc-900 text-zinc-500 border-zinc-800'
              : 'bg-zinc-100 text-zinc-500 border-zinc-300'
            : 'bg-green-600 text-white border-green-500 shadow-lg'
        }`}
      >
        {isRadioOn ? t('queue.radioOn') : t('queue.radioOff')}
      </button>

      <button
        onMouseDown={() => setShufflePressed(true)}
        onMouseUp={() => setShufflePressed(false)}
        onMouseLeave={() => setShufflePressed(false)}
        onClick={() => sendCommand('shuffle_queue')}
        className={`px-4 py-4 mb-4 rounded-2xl font-black transition-all duration-100 active:scale-95 ${
          shufflePressed
            ? 'bg-purple-500 text-white scale-95'
            : theme === 'dark'
              ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              : 'bg-zinc-200 text-black hover:bg-zinc-300'
        }`}
      >
        {t('queue.shuffle')}
      </button>

      <div className="flex gap-2 mb-4">
        {SORT_MODES(t).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            className={`flex-1 py-3 rounded-2xl font-black text-[10px] tracking-[0.15em] transition-all duration-100 active:scale-95 border ${
              sortMode === key
                ? 'bg-blue-500 text-white border-blue-400 scale-95'
                : theme === 'dark'
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onMouseDown={() => setDedupPressed(true)}
        onMouseUp={() => setDedupPressed(false)}
        onMouseLeave={() => setDedupPressed(false)}
        onClick={() => sendCommand('dedup_queue')}
        className={`px-4 py-4 mb-4 rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all duration-100 active:scale-95 border ${
          dedupPressed
            ? 'bg-orange-500 text-white border-orange-400 scale-95'
            : theme === 'dark'
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'
        }`}
      >
        {t('queue.dedup')}
      </button>

      <div
        ref={queueScrollRef}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button') || activeDragHandle !== null) return;
          setIsDraggingQueue(true);
          setStartQueueY(e.pageY - (queueScrollRef.current?.offsetTop || 0));
          setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
        }}
        onMouseUp={() => setIsDraggingQueue(false)}
        onMouseLeave={() => setIsDraggingQueue(false)}
        onMouseMove={(e) => {
          if (!isDraggingQueue || !queueScrollRef.current) return;
          e.preventDefault();
          const walk = (e.pageY - (queueScrollRef.current.offsetTop || 0) - startQueueY) * 1.5;
          queueScrollRef.current.scrollTop = scrollQueueTop - walk;
        }}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('button') || activeDragHandle !== null) return;
          setIsDraggingQueue(true);
          setStartQueueY(e.touches[0].pageY - (queueScrollRef.current?.offsetTop || 0));
          setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
        }}
        onTouchEnd={() => setIsDraggingQueue(false)}
        onTouchMove={(e) => {
          if (!isDraggingQueue || !queueScrollRef.current) return;
          const walk = (e.touches[0].pageY - (queueScrollRef.current.offsetTop || 0) - startQueueY) * 1.5;
          queueScrollRef.current.scrollTop = scrollQueueTop - walk;
        }}
        className="xl:flex-1 xl:overflow-y-auto mt-6 hide-scrollbar space-y-3 pb-4"
      >
        {unifiedList.length > 0 ? (
          unifiedList.map((title, idx) => {
            const isHistory   = idx < currentIndex;
            const isNowPlaying = idx === currentIndex;

            return (
              <React.Fragment key={`${title}-${idx}`}>
                <HistoryPanel
                  theme={theme}
                  count={historyList.length}
                  visible={idx === 0 && historyList.length > 0}
                />
                {isNowPlaying && (
                  <h3 className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-4 mt-6">
                    {t('queue.nowPlaying')}
                  </h3>
                )}
                {idx === currentIndex + 1 && (
                  <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4 mt-6">
                    {t('queue.upNext')}
                  </h3>
                )}
                <QueueItem
                  idx={idx}
                  title={title}
                  theme={theme}
                  isNowPlaying={isNowPlaying}
                  isHistory={isHistory}
                  currentIndex={currentIndex}
                  draggedIndex={draggedIndex}
                  dragOverIndex={dragOverIndex}
                  activeDragHandle={activeDragHandle}
                  queueScrollRef={queueScrollRef}
                  currentTrackRef={currentTrackRef}
                  setDraggedIndex={setDraggedIndex}
                  setDragOverIndex={setDragOverIndex}
                  setActiveDragHandle={setActiveDragHandle}
                  sendCommand={sendCommand}
                />
              </React.Fragment>
            );
          })
        ) : (
          <div className="text-center text-zinc-700 text-sm mt-10 font-bold">
            {t('queue.empty')}
          </div>
        )}
      </div>

      {playerState.upNext.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm(t('queue.clearConfirm'))) {
              sendCommand('clear');
            }
          }}
          className="shrink-0 mt-auto w-full py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] bg-red-900/10 text-red-500 border border-red-900/30 hover:bg-red-900/20 active:scale-95 transition-all"
        >
          {t('queue.clear')}
        </button>
      )}
    </div>
  );
};

export default QueuePanel;