import { useEffect, useState } from 'react';

import type { BotInstance, SystemBot } from '../types/bot';

const API_URL = import.meta.env.VITE_API_URL;

interface UseBotsProps {
  activeServerId: string | null;
  currentView: 'servers' | 'bots' | 'player';
}

export default function useBots({
  activeServerId,
  currentView,
}: UseBotsProps) {

  const [botInstances, setBotInstances] =
    useState<BotInstance[]>([]);

  const [systemBots, setSystemBots] =
    useState<SystemBot[]>([]);

  const [isLoadingBots, setIsLoadingBots] =
    useState(false);

  const [channelBotLimitInfo, setChannelBotLimitInfo] =
    useState({ current: 0, max: 2 });

  useEffect(() => {
    const fetchServers = () => {
      fetch(`${API_URL}/api/bots`, { credentials: 'include' })
        .then(res => res.json())
        .then(setBotInstances)
        .catch(err =>
          console.error('Lobby fetch error:', err)
        );
    };

    fetchServers();

    const interval = setInterval(fetchServers, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeServerId) return;

    const fetchSystemBots = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/system_bots/${activeServerId}`,
          { credentials: 'include' }
        );

        const data = await res.json();

        setSystemBots(data.bots || []);

        setChannelBotLimitInfo({
          current: data.currentChannelBotCount || 0,
          max: data.maxLimit || 2,
        });

      } catch (err) {
        console.error('System bots fetch error:', err);
      }
    };

    setIsLoadingBots(true);
    fetchSystemBots().finally(() => setIsLoadingBots(false));

    const interval = setInterval(fetchSystemBots, 500);

    return () => clearInterval(interval);
  }, [activeServerId]);

  useEffect(() => {
    if (currentView !== 'bots' || !activeServerId) return;

    const interval = setInterval(() => {
      fetch(
        `${API_URL}/api/system_bots/${activeServerId}`,
        { credentials: 'include' }
      )
        .then(res => res.json())
        .then(data => {
          setSystemBots(data.bots || []);
          setChannelBotLimitInfo({
            current: data.currentChannelBotCount || 0,
            max: data.maxLimit || 2,
          });
        })
        .catch(err =>
          console.error('Auto-refresh error:', err)
        );
    }, 500);

    return () => clearInterval(interval);
  }, [currentView, activeServerId]);

  return {
    botInstances,
    systemBots,
    setSystemBots,
    isLoadingBots,
    channelBotLimitInfo,
  };
}