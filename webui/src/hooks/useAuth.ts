import { useEffect, useState } from 'react';
import { sanitizeAvatarSrc } from '../utils/sanitize';

import type { CurrentUser } from '../types/bot';

const API_URL = import.meta.env.VITE_API_URL;

export default function useAuth() {

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(() => {
      const saved = localStorage.getItem('mbv2_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        avatarUrl: sanitizeAvatarSrc(parsed?.avatarUrl ?? null),
      };
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
      const sanitizedAvatar = sanitizeAvatarSrc(avatar);

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