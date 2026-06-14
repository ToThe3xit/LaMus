import { useState, useRef, useEffect } from 'react';

import type { PlayerState } from '../types/player';
import type { SystemBot } from '../types/bot';

const EMPTY_PLAYER_STATE: PlayerState = {
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
};

interface UsePlayerStateProps {
  activePlayerKey: string | null;
  isSuperadmin: boolean;
  setSystemBots: React.Dispatch<React.SetStateAction<SystemBot[]>>;
  onBotGone: () => void;
}

export default function usePlayerState({
  activePlayerKey,
  isSuperadmin: _isSuperadmin,
  setSystemBots,
  onBotGone,
}: UsePlayerStateProps) {

  const [playerState, setPlayerState] = useState<PlayerState>(EMPTY_PLAYER_STATE);
  const [activePlayers, setActivePlayers] = useState<Record<string, PlayerState>>({});

  const missingTicksRef = useRef(0);
  const botGoneCalledRef = useRef(false);
  const joinProtectionRef = useRef(false);
  const joinProtectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    missingTicksRef.current = 0;
    botGoneCalledRef.current = false;
  }, [activePlayerKey]);

  const handleWsData = (data: any) => {
    if (activePlayerKey && data[activePlayerKey]) {
      missingTicksRef.current = 0;
      botGoneCalledRef.current = false;
      joinProtectionRef.current = false;
      if (joinProtectionTimerRef.current) {
        clearTimeout(joinProtectionTimerRef.current);
        joinProtectionTimerRef.current = null;
      }
      setPlayerState(data[activePlayerKey]);
    } else if (activePlayerKey && !data[activePlayerKey]) {
      if (joinProtectionRef.current) {
        setActivePlayers(data);
        setSystemBots(prevBots =>
          prevBots.map(bot => {
            const isActuallyBusy = Object.values(data).some(
              (ps: any) => ps.botId === bot.id
            );
            if (bot.isBusy !== isActuallyBusy) {
              return { ...bot, isBusy: isActuallyBusy };
            }
            return bot;
          })
        );
        return;
      }

      missingTicksRef.current += 1;

      if (missingTicksRef.current >= 5 && !botGoneCalledRef.current) {
        botGoneCalledRef.current = true;
        onBotGone();
      }
    }

    setActivePlayers(data);

    setSystemBots(prevBots =>
      prevBots.map(bot => {
        const isActuallyBusy = Object.values(data).some(
          (ps: any) => ps.botId === bot.id
        );
        if (bot.isBusy !== isActuallyBusy) {
          return { ...bot, isBusy: isActuallyBusy };
        }
        return bot;
      })
    );
  };

  const resetMissingTicks = () => {
    missingTicksRef.current = 0;
    botGoneCalledRef.current = false;
    joinProtectionRef.current = true;

    if (joinProtectionTimerRef.current) {
      clearTimeout(joinProtectionTimerRef.current);
    }
    joinProtectionTimerRef.current = setTimeout(() => {
      joinProtectionRef.current = false;
      joinProtectionTimerRef.current = null;
    }, 6000);
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