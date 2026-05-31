import { useEffect, useState } from 'react';
import type { CurrentUser } from '../types/bot';

const API_URL = import.meta.env.VITE_API_URL;

const ALLOWED_AVATAR_ORIGINS = [
  'https://cdn.discordapp.com',
  'https://media.discordapp.net',
];

const AVATAR_FALLBACK = 'https://cdn.discordapp.com/embed/avatars/0.png';

function sanitizeAvatarUrl(url: string | null): string {
  if (!url) return AVATAR_FALLBACK;
  try {
    const parsed = new URL(url);
    if (ALLOWED_AVATAR_ORIGINS.some(origin => parsed.origin === origin)) {
      return url;
    }
  } catch {
  }
  return AVATAR_FALLBACK;
}

export default function useAuth() {

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(() => {
      const saved = localStorage.getItem('mbv2_user');
      return saved ? JSON.parse(saved) : null;
    });

  const [isSuperadmin, setIsSuperadmin] =
    useState(false);

  const [sessionVerified, setSessionVerified] =
    useState(false);

  useEffect(() => {
    if (!currentUser) {
      setSessionVerified(true);
      return;
    }

    fetch(`${API_URL}/api/me/admin`, {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) {
          localStorage.removeItem('mbv2_user');
          localStorage.removeItem('mbv2_view');
          localStorage.removeItem('mbv2_active_server');
          setCurrentUser(null);
          setIsSuperadmin(false);
        } else {
          return res.json().then(data => setIsSuperadmin(data));
        }
      })
      .catch(() => {
      })
      .finally(() => {
        setSessionVerified(true);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const userId   = params.get('user_id');
    const username = params.get('username');
    const avatar   = params.get('avatar');

    if (userId && username && avatar) {
      const sanitizedAvatar = sanitizeAvatarUrl(avatar);

      const user: CurrentUser = {
        id:        userId,
        name:      username,
        avatarUrl: sanitizedAvatar,
      };

      localStorage.setItem('mbv2_user', JSON.stringify(user));
      setCurrentUser(user);
      fetch(`${API_URL}/api/me/admin`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setIsSuperadmin(data))
        .catch(() => {});
      setSessionVerified(true);
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('mbv2_user');
    localStorage.removeItem('mbv2_view');
    localStorage.removeItem('mbv2_active_server');
    setCurrentUser(null);
    setIsSuperadmin(false);
  };

  return {
    currentUser,
    setCurrentUser,
    isSuperadmin,
    sessionVerified,
    logout,
  };
}