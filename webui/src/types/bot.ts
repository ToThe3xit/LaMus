export type BotInstance = { 
  id: string; 
  serverName: string; 
  isLocked: boolean; 
  status: 'playing' | 'idle' | 'offline'; 
  iconUrl?: string | null; 
}

export type SystemBot = { 
  id: number; 
  name: string; 
  avatarUrl: string; 
  isBusy: boolean; 
  isInServer: boolean; 
  userHasPermission?: boolean; 
}

export type CurrentUser = { 
  id: string; 
  name: string; 
  avatarUrl: string; 
}