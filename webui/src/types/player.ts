export type Theme = 'dark' | 'light';

export type PlayerState = { 
  serverId: string;
  channelId: string;
  botId: number;
  trackName: string;
  author: string;
  progressPercent: number;
  isPlaying: boolean;
  thumbnailUrl?: string | null;
  positionSeconds: number;
  durationSeconds: number;
  upNext: string[];
  history: string[];
  volume: number;
  isLooping: boolean;
  isRadioActive?: boolean;
}