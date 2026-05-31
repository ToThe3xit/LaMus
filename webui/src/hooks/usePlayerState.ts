import { useState } from 'react';

import type { PlayerState } from '../types/player';
import type { SystemBot } from '../types/bot';

interface UsePlayerStateProps {
  activePlayerKey: string | null;
  isSuperadmin: boolean;

  setSystemBots: React.Dispatch<
    React.SetStateAction<SystemBot[]>
  >;
}

export default function usePlayerState({
  activePlayerKey,
  isSuperadmin,
  setSystemBots,
}: UsePlayerStateProps) {

  const [playerState, setPlayerState] =
    useState<PlayerState>({
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
    });

  const [activePlayers, setActivePlayers] =
    useState<Record<string, PlayerState>>({});

  const handleWsData = (data: any) => {

    if (activePlayerKey && data[activePlayerKey]) {
      setPlayerState(data[activePlayerKey]);
    }

    setActivePlayers(prev => {

      if (isSuperadmin) {
        return data;
      }

      const prevKeys =
        Object.keys(prev).sort().join(',');

      const newKeys =
        Object.keys(data).sort().join(',');

      if (prevKeys !== newKeys) {
        return data;
      }

      return prev;
    });

    setSystemBots(prevBots =>
      prevBots.map(bot => {

        const isActuallyBusy =
          Object.values(data).some(
            (ps: any) => ps.botId === bot.id
          );

        if (bot.isBusy !== isActuallyBusy) {
          return {
            ...bot,
            isBusy: isActuallyBusy
          };
        }

        return bot;
      })
    );
  };

  return {
    playerState,
    setPlayerState,

    activePlayers,
    setActivePlayers,

    handleWsData,
  };
}