import { useState, useRef, useCallback } from 'react';

import type { PlayerState } from '../types/player';
import type { SystemBot } from '../types/bot';

interface UsePlayerStateProps {
  activePlayerKey: string | null;
  isSuperadmin: boolean;
  setSystemBots: React.Dispatch<React.SetStateAction<SystemBot[]>>;
  onBotGone: () => void;
}

export default function usePlayerState({
  activePlayerKey,
  isSuperadmin,
  onBotGone,
}: UsePlayerStateProps) {

  const [playerState, setPlayerState] = useState<PlayerState>({
    serverId: '',
    channelId: '',
    botId: 0,
    trackName: 'Waiting for a track...',
    author: '-',
    progressPercent: 0,
    isPlaying: false,
    positionSeconds: 0,
    durationSeconds: 0,
    upNext: [],
    history: [],
    volume: 100,
    isLooping: false,
    isRadioActive: false,
    ownerId: null,
    ownerName: null,
    delegatedUserIds: [],
    activeVote: null,
    hasRollback: false,
    rollbackSecondsLeft: 0,
  });

  const [activePlayers, setActivePlayers] = useState<Record<string, PlayerState>>({});

  const missingTicksRef = useRef(0);
  const botGoneCalledRef = useRef(false);
  const joinProtectionRef = useRef(false);

  const resetMissingTicks = useCallback(() => {
    missingTicksRef.current = 0;
    botGoneCalledRef.current = false;
    joinProtectionRef.current = true;
    setTimeout(() => {
      joinProtectionRef.current = false;
    }, 6000);
  }, []);

  const handleWsData = (data: any) => {
    if (activePlayerKey && data[activePlayerKey]) {
      missingTicksRef.current = 0;
      botGoneCalledRef.current = false;
      setPlayerState(data[activePlayerKey]);
    } else if (activePlayerKey && !data[activePlayerKey]) {
      if (!joinProtectionRef.current) {
        missingTicksRef.current += 1;
        if (missingTicksRef.current >= 15 && !botGoneCalledRef.current) {
          botGoneCalledRef.current = true;
          onBotGone();
        }
      }
    }

    setActivePlayers(prev => {
      if (isSuperadmin) {
        return data;
      }
      const prevKeys = Object.keys(prev).sort().join(',');
      const newKeys = Object.keys(data).sort().join(',');
      if (prevKeys !== newKeys) {
        return data;
      }
      return prev;
    });
  };

  return {
    playerState,
    setPlayerState,
    activePlayers,
    setActivePlayers,
    handleWsData,
    resetMissingTicks,
  };
}