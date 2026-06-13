export type { Theme } from './theme';

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
  ownerId: string | null;
  ownerName: string | null;
  delegatedUserIds: string[];
  activeVote: {
    action: string;
    currentVotes: number;
    requiredVotes: number;
    secondsRemaining: number;
    initiatedBy: string;
  } | null;
  hasRollback: boolean;
  rollbackSecondsLeft: number;
};