import React from 'react';
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
  setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setActiveDragHandle: React.Dispatch<React.SetStateAction<number | null>>;
  setIsDraggingQueue: React.Dispatch<React.SetStateAction<boolean>>;
  setStartQueueY: React.Dispatch<React.SetStateAction<number>>;
  setScrollQueueTop: React.Dispatch<React.SetStateAction<number>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

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
  setDraggedIndex,
  setDragOverIndex,
  setActiveDragHandle,
  setIsDraggingQueue,
  setStartQueueY,
  setScrollQueueTop,
  sendCommand,
}: QueuePanelProps) => {
  const isRadioOn = playerState.isRadioActive === true;

  return (
    <div
      className={`w-full xl:w-96 flex flex-col relative z-20 rounded-[3rem] p-6 md:p-8 border shrink-0 xl:h-full xl:max-h-[calc(100dvh-6rem)] xl:overflow-hidden ${
        theme === 'dark'
          ? 'bg-zinc-950 border-zinc-900'
          : 'bg-white border-zinc-200 shadow-xl'
      }`}
    >
      {/* Radio */}
      <button
        onClick={() => {
          if (!activePlayerKey) return;
          sendCommand('radio_network');
        }}
        className={`w-full py-4 mb-4 rounded-2xl font-black text-[10px] tracking-[0.2em] border transition-all active:scale-95 shrink-0 ${
          !isRadioOn
            ? theme === 'dark'
              ? 'bg-zinc-900 text-zinc-500 border-zinc-800'
              : 'bg-zinc-100 text-zinc-500 border-zinc-300'
            : 'bg-green-600 text-white border-green-500 shadow-lg'
        }`}
      >
        RADIO {!isRadioOn ? 'OFF' : 'ON'}
      </button>

      {/* Shuffle */}
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
        SHUFFLE
      </button>

      {/* Lista */}
      <div
        ref={queueScrollRef}
        onMouseDown={(e) => {
          if (
            (e.target as HTMLElement).closest('button') ||
            activeDragHandle !== null
          ) return;
          setIsDraggingQueue(true);
          setStartQueueY(e.pageY - (queueScrollRef.current?.offsetTop || 0));
          setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
        }}
        onMouseUp={() => setIsDraggingQueue(false)}
        onMouseLeave={() => setIsDraggingQueue(false)}
        onMouseMove={(e) => {
          if (!isDraggingQueue || !queueScrollRef.current) return;
          e.preventDefault();
          const walk =
            (e.pageY - (queueScrollRef.current.offsetTop || 0) - startQueueY) *
            1.5;
          queueScrollRef.current.scrollTop = scrollQueueTop - walk;
        }}
        onTouchStart={(e) => {
          if (
            (e.target as HTMLElement).closest('button') ||
            activeDragHandle !== null
          ) return;
          setIsDraggingQueue(true);
          setStartQueueY(
            e.touches[0].pageY - (queueScrollRef.current?.offsetTop || 0)
          );
          setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
        }}
        onTouchEnd={() => setIsDraggingQueue(false)}
        onTouchMove={(e) => {
          if (!isDraggingQueue || !queueScrollRef.current) return;
          const walk =
            (e.touches[0].pageY -
              (queueScrollRef.current.offsetTop || 0) -
              startQueueY) *
            1.5;
          queueScrollRef.current.scrollTop = scrollQueueTop - walk;
        }}
        className="xl:flex-1 xl:overflow-y-auto mt-6 hide-scrollbar space-y-3 pb-4"
      >
        {unifiedList.length > 0 ? (
          unifiedList.map((title, idx) => {
            const isHistory = idx < currentIndex;
            const isNowPlaying = idx === currentIndex;

            return (
              <React.Fragment key={`${title}-${idx}`}>

                {/* ── Nagłówek sekcji "Previous" (HistoryPanel) ── */}
                <HistoryPanel
                  theme={theme}
                  count={historyList.length}
                  visible={idx === 0 && historyList.length > 0}
                />

                {/* ── Nagłówek sekcji "Now Playing" ── */}
                {isNowPlaying && (
                  <h3 className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-4 mt-6">
                    Now Playing
                  </h3>
                )}

                {/* ── Nagłówek sekcji "Up Next" ── */}
                {idx === currentIndex + 1 && (
                  <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4 mt-6">
                    Up Next
                  </h3>
                )}

                {/* ── Element kolejki ── */}
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
            EMPTY QUEUE
          </div>
        )}
      </div>

      {/* Przycisk czyszczenia */}
      {playerState.upNext.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to clear the queue?')) {
              sendCommand('clear');
            }
          }}
          className="shrink-0 mt-auto w-full py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] bg-red-900/10 text-red-500 border border-red-900/30 hover:bg-red-900/20 active:scale-95 transition-all"
        >
          CLEAR QUEUE
        </button>
      )}
    </div>
  );
};

export default QueuePanel;