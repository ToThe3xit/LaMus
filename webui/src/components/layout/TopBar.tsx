import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SearchResults from '../search/SearchResults';
import type { Theme } from '../../types/player';
import type { CurrentUser } from '../../types/bot';

const API_URL = import.meta.env.VITE_API_URL;

interface TopBarProps {
  theme: Theme;
  currentView: 'servers' | 'bots' | 'player';
  gridCols: number;
  setGridCols: React.Dispatch<React.SetStateAction<number>>;
  currentUser: CurrentUser;
  toggleTheme: () => void;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const TopBar = ({
  theme,
  currentView,
  gridCols,
  setGridCols,
  currentUser,
  toggleTheme,
  setIsSettingsOpen,
  sendCommand,
}: TopBarProps) => {
  const { t } = useTranslation();
  const [searchSource, setSearchSource] = useState<'network' | 'local'>('network');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [localResults, setLocalSearchResults] = useState<any[]>([]);
  const [searchHistory, setSearchHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('mbv2_search_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('mbv2_search_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (searchSource !== 'local' || searchQuery.trim().length < 2) {
      setLocalSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}`, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setLocalSearchResults(data || []))
        .catch((err) => console.error('Live search error:', err));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchSource]);

  const addToHistory = (title: string, source: 'network' | 'local', query: string) => {
    setSearchHistory((prev) => {
      const filtered = prev.filter((item: any) => item.query !== query);
      const newItem = {
        id: Date.now().toString(),
        title,
        author: source === 'network' ? t('search.networkSource') : t('search.librarySource'),
        type: source === 'network' ? 'track' : 'local',
        source,
        query,
      };
      return [newItem, ...filtered].slice(0, 15);
    });
  };

  return (
    <header className={`h-24 flex items-center px-8 justify-between border-b shrink-0 z-[60] ${
      theme === 'dark' ? 'bg-zinc-950 border-zinc-900/50' : 'bg-white border-zinc-200'
    }`}>
      <div className="flex-1 pr-4 md:pr-8">
        {currentView === 'player' ? (
          <div className="relative w-full max-w-[160px] sm:max-w-xs md:max-w-md">
            <div className={`flex items-center rounded-2xl border-2 transition-all w-full overflow-hidden ${
              isSearchFocused
                ? 'border-green-500 shadow-lg shadow-green-500/10 bg-green-500/5'
                : theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-zinc-50'
            }`}>
              <button
                onClick={() => setSearchSource((s) => (s === 'network' ? 'local' : 'network'))}
                className="w-12 h-12 flex items-center justify-center border-r border-zinc-800/20 dark:border-zinc-800 active:scale-90 transition-colors"
              >
                {searchSource === 'network' ? '🔴' : '📁'}
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    if (searchSource === 'network') {
                      addToHistory(searchQuery, 'network', searchQuery);
                      sendCommand('play', searchQuery, 'network');
                      setSearchQuery('');
                    } else {
                      sendCommand('play', searchQuery, 'local');
                    }
                  }
                }}
                placeholder={t('search.placeholder')}
                className="flex-1 bg-transparent px-4 outline-none font-medium"
              />
            </div>

            {isSearchFocused && (
              <SearchResults
                theme={theme}
                localResults={localResults}
                searchHistory={searchHistory}
                onSelectLocal={(trackId, title) => {
                  addToHistory(title, 'local', trackId);
                  sendCommand('play', trackId, 'local_id');
                  setSearchQuery('');
                  setLocalSearchResults([]);
                }}
                onSelectHistory={(query, source) => {
                  sendCommand('play', query, source === 'local' ? 'local_id' : 'network');
                }}
                onClearHistory={() => setSearchHistory([])}
                onRemoveHistoryItem={(id) =>
                  setSearchHistory((prev: any[]) => prev.filter((x: any) => x.id !== id))
                }
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 sm:gap-8 animate-in fade-in duration-500">
            <h1 className="text-xl sm:text-2xl font-black">{t('lobby.selectInstance')}</h1>
            <div className={`hidden md:flex items-center p-1 px-4 rounded-full border gap-3 ${
              theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'
            }`}>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                {t('common.density')}: {gridCols}
              </span>
              <input
                type="range" min="1" max="5" step="1" value={gridCols}
                onChange={(e) => setGridCols(Number(e.target.value))}
                className="w-24 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none accent-green-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 md:gap-6 ml-auto z-20">
        <button onClick={toggleTheme} className="text-xl">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-4 group active:scale-95 transition"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold">{currentUser.name}</p>
            <p className="text-[10px] text-green-500 font-black uppercase">{t('common.online')}</p>
          </div>
          <div className={`w-12 h-12 rounded-2xl border ${
            theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-zinc-100'
          } flex items-center justify-center text-xl group-hover:border-green-500 transition-colors overflow-hidden`}>
            <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </button>
      </div>
    </header>
  );
};

export default TopBar;