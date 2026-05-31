import React from 'react';
import QueueItemText from './QueueItemText';
import type { Theme } from '../../types/player';

interface QueueItemProps {
  idx: number;
  title: string;
  theme: Theme;
  isNowPlaying: boolean;
  isHistory: boolean;
  currentIndex: number;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  activeDragHandle: number | null;
  queueScrollRef: React.RefObject<HTMLDivElement | null>;
  currentTrackRef: React.RefObject<HTMLDivElement | null>;
  setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setActiveDragHandle: React.Dispatch<React.SetStateAction<number | null>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const QueueItem = ({
  idx,
  title,
  theme,
  isNowPlaying,
  isHistory,
  currentIndex,
  draggedIndex,
  dragOverIndex,
  activeDragHandle,
  queueScrollRef,
  currentTrackRef,
  setDraggedIndex,
  setDragOverIndex,
  setActiveDragHandle,
  sendCommand,
}: QueueItemProps) => {
  const isBottomIndicator =
    draggedIndex === currentIndex && idx > currentIndex;

  return (
    <div
      ref={isNowPlaying ? currentTrackRef : null}
      draggable={activeDragHandle === idx}
      onDragStart={(e) => {
        e.stopPropagation();
        setDraggedIndex(idx);
      }}
      onDragEnter={() => setDragOverIndex(idx)}
      onDragEnd={() => {
        if (
          draggedIndex !== null &&
          dragOverIndex !== null &&
          draggedIndex !== dragOverIndex
        ) {
          sendCommand('move_track', `${draggedIndex}:${dragOverIndex}`);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
        setActiveDragHandle(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (queueScrollRef.current) {
          const container = queueScrollRef.current;
          const rect = container.getBoundingClientRect();
          const threshold = 60;
          const speed = 8;
          if (e.clientY < rect.top + threshold) {
            container.scrollTop -= speed;
          } else if (e.clientY > rect.bottom - threshold) {
            container.scrollTop += speed;
          }
        }
      }}
      className={`queue-item p-4 mb-3 rounded-3xl border flex items-center gap-3 group transition-all duration-300 ${
        dragOverIndex === idx
          ? isBottomIndicator
            ? 'drag-over-item-bottom'
            : 'drag-over-item'
          : ''
      } ${
        theme === 'dark'
          ? 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800'
          : 'bg-zinc-50 border-zinc-200'
      } ${
        isNowPlaying
          ? 'border-green-500/50 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
          : ''
      } ${
        isHistory
          ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all'
          : ''
      }`}
    >
      <div
        className="drag-handle cursor-grab text-zinc-700 hover:text-green-500 transition-colors px-1"
        onMouseEnter={() => setActiveDragHandle(idx)}
        onMouseLeave={() => setActiveDragHandle(null)}
      >
        ⋮⋮
      </div>

      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!isNowPlaying) {
            sendCommand('play_index', idx.toString());
          }
        }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 cursor-pointer group/playbtn transition-all duration-200 ${
          isNowPlaying
            ? 'text-white bg-green-600 border border-green-500'
            : theme === 'dark'
              ? 'bg-black border border-zinc-800 text-green-500 hover:bg-green-500/20'
              : 'bg-white border border-zinc-300 text-green-600 hover:bg-green-100'
        }`}
      >
        <span className={`block ${!isNowPlaying ? 'group-hover/playbtn:hidden' : ''}`}>
          {isNowPlaying ? '▶' : Math.abs(idx - currentIndex)}
        </span>
        {!isNowPlaying && (
          <span className="hidden group-hover/playbtn:block text-[12px] pl-0.5">
            ▶
          </span>
        )}
      </div>

      <QueueItemText title={title} theme={theme} />

      <button
        onClick={() => {
          if (isNowPlaying) {
            sendCommand('skip');
          } else {
            sendCommand('remove_track', idx.toString());
          }
        }}
        className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all"
      >
        ✕
      </button>
    </div>
  );
};

export default QueueItem;