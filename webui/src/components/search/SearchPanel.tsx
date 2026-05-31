import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../types/player';
import type { SearchItem } from '../../types/search';

const API_URL = import.meta.env.VITE_API_URL;

interface SearchPanelProps {
  theme: Theme;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const SearchPanel = ({ theme, sendCommand }: SearchPanelProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setShowSearchDropdown(false); return; }
    try {
      setSearchLoading(true);
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data.results || []);
      setShowSearchDropdown(true);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
      setShowSearchDropdown(false);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={searchRef} className="relative w-full max-w-3xl mx-auto mb-10 z-50">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => {
          const q = e.target.value;
          setSearchQuery(q);
          if (q.trim().length >= 2) performSearch(q);
          else setShowSearchDropdown(false);
        }}
        placeholder={t('search.placeholderFull')}
        className={`w-full rounded-3xl px-6 py-5 outline-none border text-sm font-bold transition-all ${
          theme === 'dark'
            ? 'bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-green-500'
            : 'bg-white border-zinc-300 text-black placeholder:text-zinc-500 focus:border-green-500'
        }`}
      />

      {showSearchDropdown && (
        <div className={`absolute top-full left-0 w-full mt-3 rounded-3xl border overflow-hidden shadow-2xl backdrop-blur-xl ${
          theme === 'dark' ? 'bg-zinc-950/95 border-zinc-800' : 'bg-white/95 border-zinc-200'
        }`}>
          {searchLoading ? (
            <div className="p-6 text-center text-sm font-bold text-zinc-500">
              {t('search.searching')}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto hide-scrollbar">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  onClick={() => { sendCommand('play_search', item.query, item.source); setSearchQuery(''); setShowSearchDropdown(false); }}
                  className={`w-full text-left px-5 py-4 border-b last:border-b-0 transition-all ${
                    theme === 'dark' ? 'border-zinc-800 hover:bg-zinc-900' : 'border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                      item.source === 'network' ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500'
                    }`}>
                      {item.type === 'playlist' ? 'PL' : item.source === 'network' ? 'YT' : 'LC'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate text-sm font-black ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                        {item.title}
                      </p>
                      <p className="truncate text-[10px] uppercase tracking-wider font-bold text-zinc-500 mt-1">
                        {item.author}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm font-bold text-zinc-500">
              {t('search.noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchPanel;