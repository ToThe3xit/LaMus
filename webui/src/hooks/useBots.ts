import { useEffect, useRef, useState } from 'react';

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

  const knownNamesRef = useRef<Set<string>>(new Set());
  const systemBotsRef = useRef<SystemBot[]>([]);

  useEffect(() => {
    systemBotsRef.current = systemBots;
  }, [systemBots]);

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

    let cancelled = false;
    let requestInFlight = false;
    knownNamesRef.current = new Set();

    const fetchSystemBots = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const res = await fetch(
          `${API_URL}/api/system_bots/${activeServerId}`,
          { credentials: 'include' }
        );

        const data = await res.json();

        if (cancelled) return;

        const incomingBots: SystemBot[] = data.bots || [];
        const incomingNames = new Set(
          incomingBots.filter((b) => b.isInServer).map((b) => b.name)
        );

        const namesChanged =
          incomingNames.size !== knownNamesRef.current.size ||
          [...incomingNames].some((name) => !knownNamesRef.current.has(name));

        if (namesChanged) {
          knownNamesRef.current = incomingNames;
          systemBotsRef.current = incomingBots;
          setSystemBots(incomingBots);
        } else {
          let anyFieldChanged = false;

          const merged = systemBotsRef.current.map((existingBot) => {
            const fresh = incomingBots.find((b) => b.name === existingBot.name);
            if (!fresh) return existingBot;

            if (
              fresh.isBusy !== existingBot.isBusy ||
              fresh.userHasPermission !== existingBot.userHasPermission ||
              fresh.avatarUrl !== existingBot.avatarUrl ||
              fresh.isInServer !== existingBot.isInServer
            ) {
              anyFieldChanged = true;
              return { ...existingBot, ...fresh };
            }
            return existingBot;
          });

          if (anyFieldChanged) {
            systemBotsRef.current = merged;
            setSystemBots(merged);
          }
        }

        setChannelBotLimitInfo(prev => {
          const next = {
            current: data.currentChannelBotCount || 0,
            max: data.maxLimit || 2,
          };
          if (prev.current === next.current && prev.max === next.max) {
            return prev;
          }
          return next;
        });

      } catch (err) {
        console.error('System bots fetch error:', err);
      } finally {
        requestInFlight = false;
      }
    };

    setIsLoadingBots(true);
    fetchSystemBots().finally(() => setIsLoadingBots(false));

    const intervalMs = currentView === 'bots' ? 500 : 1000;
    const interval = setInterval(fetchSystemBots, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeServerId, currentView]);

  return {
    botInstances,
    systemBots,
    setSystemBots,
    isLoadingBots,
    channelBotLimitInfo,
  };
}