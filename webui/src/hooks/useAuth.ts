import { useEffect, useState } from 'react';

import type { CurrentUser } from '../types/bot';

const API_URL = import.meta.env.VITE_API_URL;

export default function useAuth() {

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(() => {
      const saved = localStorage.getItem('mbv2_user');
      return saved ? JSON.parse(saved) : null;
    });

  const [isSuperadmin, setIsSuperadmin] =
    useState(false);

  // Sprawdź uprawnienia admina
  useEffect(() => {
    if (currentUser) {
      fetch(`${API_URL}/api/me/admin`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => setIsSuperadmin(data))
        .catch(err =>
          console.error('Admin verification error:', err)
        );
    } else {
      setIsSuperadmin(false);
    }
  }, [currentUser]);

  // Obsługa powrotu z OAuth2
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const userId = params.get('user_id');
    const username = params.get('username');
    const avatar = params.get('avatar');

    if (userId && username && avatar) {
      const user = {
        id: userId,
        name: username,
        avatarUrl: avatar,
      };

      localStorage.setItem('mbv2_user', JSON.stringify(user));
      setCurrentUser(user);
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('mbv2_user');
    setCurrentUser(null);
  };

  return {
    currentUser,
    setCurrentUser,
    isSuperadmin,
    logout,
  };
}