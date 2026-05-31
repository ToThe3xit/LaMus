import { useState } from 'react';

export default function useQueue() {

  const [draggedIndex, setDraggedIndex] =
    useState<number | null>(null);

  const [dragOverIndex, setDragOverIndex] =
    useState<number | null>(null);

  const [activeDragHandle, setActiveDragHandle] =
    useState<number | null>(null);

  const [isDraggingQueue, setIsDraggingQueue] =
    useState(false);

  const [startQueueY, setStartQueueY] =
    useState(0);

  const [scrollQueueTop, setScrollQueueTop] =
    useState(0);

  const [shufflePressed, setShufflePressed] =
    useState(false);

  return {
    draggedIndex,
    setDraggedIndex,
    dragOverIndex,
    setDragOverIndex,
    activeDragHandle,
    setActiveDragHandle,
    isDraggingQueue,
    setIsDraggingQueue,
    startQueueY,
    setStartQueueY,
    scrollQueueTop,
    setScrollQueueTop,
    shufflePressed,
    setShufflePressed,
  };
}