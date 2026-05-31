import type { Theme } from '../../types/player';

interface LocalResult {
  track_id: string;
  title: string;
  index: number;
}

interface HistoryItem {
  id: string;
  title: string;
  source: 'network' | 'local';
  query: string;
}

interface SearchResultsProps {
  theme: Theme;
  localResults: LocalResult[];
  searchHistory: HistoryItem[];
  onSelectLocal: (trackId: string, title: string) => void;
  onSelectHistory: (query: string, source: string) => void;
  onClearHistory: () => void;
  onRemoveHistoryItem: (id: string) => void;
}

const SearchResults = ({
  theme,
  localResults,
  searchHistory,
  onSelectLocal,
  onSelectHistory,
  onClearHistory,
  onRemoveHistoryItem,
}: SearchResultsProps) => {
  return (
    <div
      className={`absolute top-full left-0 right-0 mt-2 border-2 rounded-3xl overflow-hidden shadow-2xl z-[100] ${
        theme === 'dark'
          ? 'bg-zinc-900 border-zinc-800 text-white'
          : 'bg-white border-zinc-200 text-black'
      }`}
    >
      <div className="max-h-[400px] overflow-y-auto hide-scrollbar">

        {localResults.length > 0 && (
          <div className="p-2 border-b border-zinc-800/50 bg-zinc-950/20">
            <div className="p-2 text-[10px] font-black text-green-500 uppercase tracking-widest">
              Local matches
            </div>
            {localResults.map((r) => (
              <div
                key={r.track_id}
                className={`flex items-center p-2 rounded-xl cursor-pointer transition-colors ${
                  theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectLocal(r.track_id, r.title);
                }}
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center mr-3 text-[10px] text-green-500 font-black ${
                    theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'
                  }`}
                >
                  {r.index}
                </div>
                <div className="truncate text-sm font-bold">{r.title}</div>
              </div>
            ))}
          </div>
        )}

        {searchHistory.length > 0 && (
          <div className="p-2">
            <div className="flex justify-between p-2 text-[10px] font-black text-zinc-500 uppercase">
              <span>Recent</span>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  onClearHistory();
                }}
                className="hover:text-red-500"
              >
                Clear
              </button>
            </div>
            {searchHistory.map((h) => (
              <div
                key={h.id}
                className={`flex items-center p-2 rounded-xl group cursor-pointer transition-colors ${
                  theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectHistory(h.query, h.source);
                }}
              >
                <span className="mr-3 opacity-50">
                  {h.source === 'network' ? '🔴' : '📁'}
                </span>
                <div className="flex-1 truncate text-sm font-bold">{h.title}</div>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveHistoryItem(h.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default SearchResults;