const API_URL = import.meta.env.VITE_API_URL;

// ── Generyczne fetch helpers ───────────────────────────────────

export async function apiGet<T = unknown>(
  path: string
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Specyficzne API calls ──────────────────────────────────────

export interface CommandPayload {
  serverId: string;
  botId: number;
  action: string;
  payload?: string | null;
  source?: string | null;
}

export async function sendBotCommand(
  cmd: CommandPayload
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cmd),
    });
  } catch (err) {
    console.error('Command sending error:', err);
  }
}

export async function fetchBotList<T = unknown>(): Promise<T | null> {
  return apiGet<T>('/api/bots');
}

export async function fetchSystemBots<T = unknown>(
  serverId: string
): Promise<T | null> {
  return apiGet<T>(`/api/system_bots/${serverId}`);
}

export async function fetchVoiceChannels<T = unknown>(
  serverId: string
): Promise<T | null> {
  return apiGet<T>(`/api/bots/${serverId}/channels`);
}

export async function fetchAdminCheck(): Promise<boolean> {
  const result = await apiGet<boolean>('/api/me/admin');
  return result ?? false;
}

export async function searchLocal<T = unknown>(
  query: string
): Promise<T | null> {
  return apiGet<T>(`/api/search?q=${encodeURIComponent(query)}`);
}