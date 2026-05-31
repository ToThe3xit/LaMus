import { useEffect, useState } from 'react';

import type { Theme } from '../types/player';

export default function useTheme() {

  const [theme, setTheme] = useState<Theme>(() => {

    const saved =
      localStorage.getItem('lamus-theme');

    return saved === 'light'
      ? 'light'
      : 'dark';
  });

  useEffect(() => {

    localStorage.setItem(
      'lamus-theme',
      theme
    );

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

  }, [theme]);

  const toggleTheme = () => {

    setTheme(prev =>
      prev === 'dark'
        ? 'light'
        : 'dark'
    );
  };

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}