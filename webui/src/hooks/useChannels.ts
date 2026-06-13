import { useState } from 'react';
import type { VoiceChannel } from '../types/voice';

const API_URL = import.meta.env.VITE_API_URL;

export default function useChannels() {
  const [availableChannels, setAvailableChannels] = useState<VoiceChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);

  const fetchChannels = async (serverId: string, isSuperadmin: boolean = false) => {
    setIsLoadingChannels(true);
    setAvailableChannels([]);
    try {
      const res = await fetch(
        `${API_URL}/api/bots/${serverId}/channels`,
        { credentials: 'include' }
      );
      const data: VoiceChannel[] = await res.json();

      if (isSuperadmin) {
        setAvailableChannels(data);
      } else {
        const meRes = await fetch(`${API_URL}/api/me/voice_channel/${serverId}`, {
          credentials: 'include',
        });
        if (meRes.ok) {
          const myChannel: VoiceChannel | null = await meRes.json();
          if (myChannel) {
            setAvailableChannels([myChannel]);
          } else {
            setAvailableChannels([]);
          }
        } else {
          setAvailableChannels([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  return { availableChannels, isLoadingChannels, fetchChannels };
}