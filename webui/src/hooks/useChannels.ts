import { useState } from 'react';

import type { VoiceChannel } from '../types/voice';

const API_URL = import.meta.env.VITE_API_URL;

export default function useChannels() {

  const [availableChannels, setAvailableChannels] =
    useState<VoiceChannel[]>([]);

  const [isLoadingChannels, setIsLoadingChannels] =
    useState(false);

  const fetchChannels = async (serverId: string) => {
    setIsLoadingChannels(true);
    setAvailableChannels([]);

    try {
      const res = await fetch(
        `${API_URL}/api/bots/${serverId}/channels`,
        { credentials: 'include' }
      );

      const data = await res.json();

      setAvailableChannels(data);

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  return {
    availableChannels,
    isLoadingChannels,
    fetchChannels,
  };
}