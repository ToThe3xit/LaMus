import React, { useState, useEffect, useRef } from 'react'
import logo from './assets/logo.png'

// ============================================================ //
// ==== TYPE DEFINITIONS (DATA INTERFACES) ==================== //
// ============================================================ //
type BotInstance = { id: string; serverName: string; isLocked: boolean; status: 'playing' | 'idle' | 'offline'; iconUrl?: string | null; }
type SearchItem = { id: string; title: string; author: string; type: 'track' | 'playlist' | 'local'; source: 'network' | 'local'; query: string; }
type Theme = 'dark' | 'light';
type PlayerState = { 
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
}
type VoiceChannel = { id: string; name: string; }
type SystemBot = { id: number; name: string; avatarUrl: string; isBusy: boolean; isInServer: boolean; userHasPermission?: boolean; }
type CurrentUser = { id: string; name: string; avatarUrl: string; }

const API_URL = import.meta.env.VITE_API_URL;

// ============================================================ //
// ==== COMPONENT: TRACK COVER (FALLBACK MECHANISM) =========== //
// ============================================================ //
const CoverImage = ({ url }: { url?: string | null }) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [fallbackLevel, setFallbackLevel] = useState(0);

  useEffect(() => {
    setFallbackLevel(0);
    if (!url) {
      setCurrentUrl(null);
      return;
    }

    if (url.length === 11 && !url.startsWith('http')) {
      try {
        const b = atob('aHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8=');
        const q = atob('L2hxNzIwLmpwZw==');
        setCurrentUrl(b + url + q);
      } catch {
        setCurrentUrl(null);
      }
    } else {
      setCurrentUrl(url);
    }
  }, [url]);

  const handleError = () => {
    if (!url || url.startsWith('http')) return;
    try {
      const b = atob('aHR0cHM6Ly9pLnl0aW1nLmNvbS92aS8=');
      if (fallbackLevel === 0) {
        setCurrentUrl(b + url + atob('L21heHJlc2RlZmF1bHQuanBn'));
        setFallbackLevel(1);
      } else if (fallbackLevel === 1) {
        setCurrentUrl(b + url + atob('L2hxZGVmYXVsdC5qcGc='));
        setFallbackLevel(2);
      } else {
        setCurrentUrl(null);
      }
    } catch {
      setCurrentUrl(null);
    }
  };

  if (!currentUrl) return (
    <div className="w-full h-full flex items-center justify-center text-sm font-black text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/10">NO COVER</div>
  );

  return (
    <img 
      src={currentUrl} 
      alt="Cover"
      className="w-full h-full object-cover animate-in fade-in duration-500" 
      onError={handleError} 
      onLoad={(e) => { if (e.currentTarget.naturalWidth <= 120) handleError(); }} 
    />
  );
};

// ============================================================ //
// ==== COMPONENT: ANIMATED QUEUE TEXT (MARQUEE) ============== //
// ============================================================ //
const QueueItemText = ({ title, theme }: { title: string, theme: Theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [overflowAmount, setOverflowAmount] = useState(0);

  useEffect(() => {
    const checkWidth = () => {
      if (!containerRef.current || !textRef.current) return;
      const cW = containerRef.current.clientWidth;
      const tW = textRef.current.scrollWidth;
      if (tW > cW) { setShouldAnimate(true); setOverflowAmount(tW - cW); }
      else { setShouldAnimate(false); setOverflowAmount(0); }
    };
    const timer = setTimeout(checkWidth, 150);
    window.addEventListener('resize', checkWidth);
    return () => { clearTimeout(timer); window.removeEventListener('resize', checkWidth); };
  }, [title]);

  const duration = Math.max(8, title.length * 0.15);
  return (
    <div ref={containerRef} className="flex-1 overflow-hidden pointer-events-none">
      <div ref={textRef} className={`inline-block whitespace-nowrap font-bold text-sm ${shouldAnimate ? 'animate-marquee-bounce pr-4' : 'truncate'} ${theme === 'dark' ? 'text-white' : 'text-black'}`} style={shouldAnimate ? { '--overflow': `-${overflowAmount}px`, '--duration': `${duration}s` } as React.CSSProperties : {}}>
        {title}
      </div>
    </div>
  );
};

// ============================================================ //
// ==== MAIN FRONTEND APPLICATION (ROOT COMPONENT) ============ //
// ============================================================ //
function App() {
  useEffect(() => {
    document.title = "LaMus";
  }, []);
  const [currentView, setCurrentView] = useState<'servers' | 'bots' | 'player'>(() => {
  const saved = localStorage.getItem('mbv2_view') as any;
  if (saved === 'player' && !localStorage.getItem('mbv2_active_server')) {
    return 'servers';
  }
  return saved || 'servers';
});
  const [activeServerId, setActiveServerId] = useState<string | null>(() => {
    return localStorage.getItem('mbv2_active_server') || null;
  });

  useEffect(() => { localStorage.setItem('mbv2_view', currentView); }, [currentView]);
  useEffect(() => { if (activeServerId) localStorage.setItem('mbv2_active_server', activeServerId); }, [activeServerId]);
  
  const [searchSource, setSearchSource] = useState<'network' | 'local'>('network')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [gridCols, setGridCols] = useState(3);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('mbv2_theme');
    return (savedTheme as Theme) || 'dark';
  });
  const toggleLoop = () => sendCommand('toggle_loop');
  const [botInstances, setBotInstances] = useState<BotInstance[]>([])
  const [systemBots, setSystemBots] = useState<SystemBot[]>([])
  const [selectedBotIndex, setSelectedBotIndex] = useState<number | null>(null);
  const [localResults, setLocalSearchResults] = useState<any[]>([])
  const [playerState, setPlayerState] = useState<PlayerState>({ 
    serverId: '', 
    channelId: '', 
    botId: 0, 
    trackName: 'Waiting for a track...', 
    author: '-', 
    progressPercent: 0, 
    isPlaying: false, 
    positionSeconds: 0, 
    durationSeconds: 0, 
    upNext: [], 
    history: [], 
    volume: 100,
    isLooping: false,
    isRadioActive: false,
  });
  const [isLoadingBots, setIsLoadingBots] = useState(false);
  const [availableChannels, setAvailableChannels] = useState<VoiceChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeDragHandle, setActiveDragHandle] = useState<number | null>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingQueue, setIsDraggingQueue] = useState(false);
  const [startQueueY, setStartQueueY] = useState(0);
  const [scrollQueueTop, setScrollQueueTop] = useState(0);
  const sidebarScrollRef = useRef<HTMLElement>(null);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [startSidebarY, setStartSidebarY] = useState(0);
  const [scrollSidebarTop, setScrollSidebarTop] = useState(0);

  // ============================================================ //
  // ==== SEARCH AND AUTOCOMPLETE LOGIC (LIVE SEARCH) =========== //
  // ============================================================ //
  useEffect(() => {
    if (searchSource !== 'local' || searchQuery.trim().length < 2) {
      setLocalSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setLocalSearchResults(data || []))
        .catch(err => console.error("Live search error:", err));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchSource]);
  
  const currentTrackRef = useRef<HTMLDivElement>(null);

  // ============================================================ //
  // ==== HELPER FUNCTION: SCROLL TO CURRENT TRACK ============== //
  // ============================================================ //
  const scrollToCurrent = () => {
    if (currentTrackRef.current) {
        const element = currentTrackRef.current;
        
        if (window.innerWidth >= 1280) {
          if (queueScrollRef.current) {
            const container = queueScrollRef.current;
            container.scrollTo({
                top: element.offsetTop - 140,
                behavior: 'smooth'
            });
          }
        } else {
          if (mainScrollRef.current) {
            const container = mainScrollRef.current;
            const elementRect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            const targetTop = container.scrollTop + (elementRect.top - containerRect.top) - 20;
            
            container.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
          } else {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
    }
  };

  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLDivElement>(null);
  const [shouldAnimateTitle, setShouldAnimateTitle] = useState(false);
  const [overflowAmountTitle, setOverflowAmountTitle] = useState(0);
  const lastVolumeSendTime = useRef<number>(0);
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const [lastVolume, setLastVolume] = useState<number>(100);
  
  const lastProgressSendTime = useRef<number>(0);
  const [localProgress, setLocalProgress] = useState<number | null>(null);
  useEffect(() => {
    if (playerState.volume > 0) {
      setLastVolume(playerState.volume);
    }
  }, [playerState.volume]);

  const [isSmallScreen, setIsSmallScreen] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerHeight < 700);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const check = () => {
      if (!titleContainerRef.current || !titleTextRef.current) return;
      const cW = titleContainerRef.current.clientWidth;
      const tW = titleTextRef.current.scrollWidth;
      if (tW > cW) { setShouldAnimateTitle(true); setOverflowAmountTitle(tW - cW); }
      else { setShouldAnimateTitle(false); setOverflowAmountTitle(0); }
    };
    const timer = setTimeout(check, 100);
    window.addEventListener('resize', check);
    return () => { clearTimeout(timer); window.removeEventListener('resize', check); };
  }, [playerState.trackName]);

  const [searchHistory, setSearchHistory] = useState<SearchItem[]>(() => {
    const saved = localStorage.getItem('mbv2_search_history');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => { localStorage.setItem('mbv2_search_history', JSON.stringify(searchHistory)); }, [searchHistory]);

  const addToHistory = (title: string, source: 'network' | 'local', query: string) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.query !== query);
      const newItem: SearchItem = { id: Date.now().toString(), title, author: source === 'network' ? 'Network' : 'Library', type: source === 'network' ? 'track' : 'local', source, query };
      return [newItem, ...filtered].slice(0, 15);
    });
  };

  // ============================================================ //
  // ==== AUTHENTICATION SYSTEM AND SESSION MANAGEMENT ========== //
  // ============================================================ //
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const saved = localStorage.getItem('mbv2_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetch(`${API_URL}/api/me/admin`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setIsSuperadmin(data))
        .catch(err => console.error("Admin verification error:", err));
    } else {
      setIsSuperadmin(false);
    }
  }, [currentUser]);
  const [channelBotLimitInfo, setChannelBotLimitInfo] = useState({ current: 0, max: 2 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user_id');
    const username = params.get('username');
    const avatar = params.get('avatar');

    if (userId && username && avatar) {
      const user = { id: userId, name: username, avatarUrl: avatar };
      localStorage.setItem('mbv2_user', JSON.stringify(user));
      setCurrentUser(user);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  // ============================================================ //
  // ==== API CLIENT (COMMUNICATION WITH RUST BACKEND) ========== //
  // ============================================================ //
  const sendCommand = async (action: string, payload?: string, source?: string) => {
    if (!activeServerId) return;
    try {
      await fetch(`${API_URL}/api/command`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          serverId: activeServerId, 
          botId: playerState.botId, 
          action, 
          payload: payload || null, 
          source: source || null 
        })
      });
    } catch (err) {
      console.error("Command sending error:", err);
    }
  };

  const handleServerClick = (server: BotInstance) => {
    setActiveServerId(server.id);
    setCurrentView('bots'); 
    setSystemBots([]);
    fetchChannels(server.id);
  };

  // ============================================================ //
  // ==== VOICE CHANNEL MANAGEMENT ============================== //
  // ============================================================ //
  const fetchChannels = async (serverId: string) => {
    setIsLoadingChannels(true);
    setAvailableChannels([]);
    try {
      const res = await fetch(`${API_URL}/api/bots/${serverId}/channels`, {
        credentials: "include"
      });
      const data = await res.json();
      setAvailableChannels(data);
    } catch (err) { console.error(err); } finally { setIsLoadingChannels(false); }
  };

  const joinChannel = async (channelId: string, botIndex: number) => {
    if (!activeServerId) return;
    setSelectedBotIndex(null); 

    const expectedKey = `${activeServerId}_${botIndex}`;
    setActivePlayerKey(expectedKey);
    setCurrentView('player');
    setOpenServerFolder(null);

    try {
      await fetch(`${API_URL}/api/command`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ serverId: activeServerId, action: "join", payload: channelId, source: botIndex.toString() })
      });
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('mbv2_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('mbv2_theme', 'light');
    }
  }, [theme]);

  
  const [activePlayers, setActivePlayers] = useState<Record<string, PlayerState>>({});
  const [openServerFolder, setOpenServerFolder] = useState<string | null>(null);

  const playersByServer = Object.entries(activePlayers).reduce((acc, [key, state]) => {
    if (!acc[state.serverId]) acc[state.serverId] = [];
    acc[state.serverId].push({ key, state });
    return acc;
  }, {} as Record<string, { key: string; state: PlayerState }[]>);
  
  const [activePlayerKey, setActivePlayerKey] = useState<string | null>(null);
  useEffect(() => {
  if (!activePlayerKey) return;
  setPlayerState(prev => ({
    ...prev,
    isRadioActive: false,
  }));
  }, [activePlayerKey]);
  // ============================================================ //
  // ==== BOTS AND SERVERS SYNCHRONIZATION SUBSYSTEM ============ //
  // ============================================================ //

  useEffect(() => {
    const fetchServers = () => {
      fetch(`${API_URL}/api/bots`, { credentials: "include" })
        .then(res => res.json())
        .then(setBotInstances)
        .catch(err => console.error("Lobby fetch error:", err));
    };
    fetchServers();
    const interval = setInterval(fetchServers, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeServerId) return;

    const fetchSystemBots = async () => {
      try {
        const res = await fetch(`${API_URL}/api/system_bots/${activeServerId}`, { 
          credentials: "include" 
        });
        const data = await res.json();
        setSystemBots(data.bots || []); 
        setChannelBotLimitInfo({ 
          current: data.currentChannelBotCount || 0, 
          max: data.maxLimit || 2 
        });
      } catch (err) {
        console.error("System bots fetch error:", err);
      }
    };

    setIsLoadingBots(true);
    fetchSystemBots().finally(() => setIsLoadingBots(false));
    const interval = setInterval(fetchSystemBots, 500);

    return () => clearInterval(interval);
  }, [activeServerId]);

  useEffect(() => {
    if (playerState.serverId && !activeServerId) {
      setActiveServerId(playerState.serverId);
    }
  }, [playerState.serverId, activeServerId]);

  // ============================================================ //
  // ==== REAL-TIME SYNCHRONIZATION SUBSYSTEM (WSS) ============= //
  // ============================================================ //
  useEffect(() => {
    if (!currentUser) return; 

    const getWsUrl = () => {
      let wsUrl = API_URL;
      if (wsUrl.startsWith('https://')) {
          wsUrl = wsUrl.replace('https://', 'wss://');
      } else {
          wsUrl = wsUrl.replace('http://', 'ws://');
      }
      return `${wsUrl}/ws`;
    };

    const ws = new WebSocket(getWsUrl());
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      
      if (activePlayerKey && data[activePlayerKey]) {
        setPlayerState(data[activePlayerKey]);
      }

      setActivePlayers(prev => {
        if (isSuperadmin) {
          return data; 
        } else {
          const prevKeys = Object.keys(prev).sort().join(',');
          const newKeys = Object.keys(data).sort().join(',');
          
          if (prevKeys !== newKeys) {
            return data;
          }
          return prev;
        }
      });

      setSystemBots(prevBots => prevBots.map(bot => {
        const isActuallyBusy = Object.values(data).some((ps: any) => ps.botId === bot.id);
        
        if (bot.isBusy !== isActuallyBusy) {
          return { ...bot, isBusy: isActuallyBusy };
        }
        return bot;
      }));

    };
    
    return () => ws.close();
  }, [currentUser, activePlayerKey, isSuperadmin]);
  useEffect(() => {
    if (currentView === 'bots' && activeServerId) {
      const interval = setInterval(() => {
        fetch(`${API_URL}/api/system_bots/${activeServerId}`, { credentials: "include" })
          .then(res => res.json())
          .then(data => {
            setSystemBots(data.bots || []);
            setChannelBotLimitInfo({ 
              current: data.currentChannelBotCount || 0, 
              max: data.maxLimit || 2 
            });
          })
          .catch(err => console.error("Auto-refresh error:", err));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [currentView, activeServerId]);
  const historyList = playerState.history || [];
  const unifiedList = [...historyList, ...playerState.upNext];
  const currentIndex = historyList.length;

  // ============================================================ //
  // ==== RENDER: OAUTH2 AUTHORIZATION SCREEN =================== //
  // ============================================================ //
  if (!currentUser) {
    return (
      <div className={`fixed inset-0 h-[100dvh] w-full flex items-center justify-center transition-colors duration-300 font-sans select-none ${theme === 'dark' ? 'bg-black text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`max-w-md w-full p-12 rounded-[3rem] shadow-2xl border-4 text-center ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-zinc-200'}`}>
          <div className="w-28 h-28 mx-auto rounded-[2.5rem] flex items-center justify-center mb-6 shadow-2xl drop-shadow-2xl">
            <img src={logo} alt="LaMus Logo" className="w-full h-full object-contain animate-bounce" style={{ animationDuration: '3s' }} />
          </div>
          <h2 className="text-4xl font-black mb-2 text-orange-500 tracking-tighter">LaMus</h2>
          <p className="text-sm text-zinc-500 font-bold mb-10">Log in via Discord to access the command panel.</p>
          <button 
            onClick={() => window.location.href = `${API_URL}/api/auth/login`}
            className="w-full py-5 rounded-2xl bg-[#5865F2] text-white font-bold hover:bg-[#4752C4] transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#5865F2]/20 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
            Log in with Discord
          </button>
        </div>
      </div>
    );
  }

  // ============================================================ //
  // ==== RENDER: MAIN WEBUI APPLICATION (SPA) ================== //
  // ============================================================ //
  return (
    <div className={`fixed inset-0 h-[100dvh] w-full max-w-full flex flex-col-reverse md:flex-row overflow-x-hidden overflow-y-hidden transition-colors duration-300 font-sans select-none ${theme === 'dark' ? 'bg-black text-zinc-100' : 'bg-white text-zinc-900'}`}>
      {isSettingsOpen && <div className="fixed inset-0 bg-black/70 z-[140] backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsSettingsOpen(false)} />}
      <aside className={`fixed top-0 right-0 h-full w-80 z-[150] transform transition-transform duration-500 ease-in-out p-8 flex flex-col ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'} ${theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xl'} border-l`}>
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-xl font-black uppercase text-zinc-500 tracking-widest">Settings</h2>
          <button onClick={() => setIsSettingsOpen(false)} className="text-2xl p-2 hover:scale-125 transition">✕</button>
        </div>
        
        <div className="flex-1 space-y-10 flex flex-col">
          <section className="space-y-4 text-center">
            <div className={`w-24 h-24 mx-auto rounded-[2rem] flex items-center justify-center text-4xl shadow-inner border overflow-hidden ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-300 bg-zinc-100'}`}>
              <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-xl font-black">{currentUser.name}</h3>
              <p className="text-[10px] text-green-500 font-black uppercase tracking-widest mt-1">Status: Logged in</p>
            </div>
          </section>
          
          <div className="mt-auto">
            <button 
              onClick={() => { localStorage.removeItem('mbv2_user'); setCurrentUser(null); setIsSettingsOpen(false); }}
              className="w-full py-4 rounded-xl bg-red-900/10 text-red-500 font-bold border border-red-900/30 hover:bg-red-900/20 transition"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <aside className={`fixed bottom-0 left-0 w-full h-20 md:static md:w-64 md:h-full flex flex-row md:flex-col border-t md:border-t-0 md:border-r z-[100] shrink-0 ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-zinc-50 border-zinc-200'}`}>
        <div className="hidden md:flex pt-4 pb-6 px-4 flex-col items-center justify-center">
          <img 
            src={logo} 
            alt="LaMus" 
            className="w-14 h-14 md:w-28 md:h-28 object-contain drop-shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:drop-shadow-[0_0_25px_rgba(249,115,22,0.6)] hover:scale-110 transition-all duration-300 cursor-pointer -mt-2" 
          />
          
          <span className="font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-300 via-orange-500 to-red-600 text-xl md:text-4xl tracking-tighter hidden md:block drop-shadow-[0_5px_15px_rgba(249,115,22,0.4)] -mt-2 md:-mt-6">
            LaMus
          </span>
        </div>
        <nav 
          ref={sidebarScrollRef}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button')) return; 
            setIsDraggingSidebar(true);
            setStartSidebarY(e.pageY - (sidebarScrollRef.current?.offsetTop || 0));
            setScrollSidebarTop(sidebarScrollRef.current?.scrollTop || 0);
          }}
          onMouseUp={() => setIsDraggingSidebar(false)}
          onMouseLeave={() => setIsDraggingSidebar(false)}
          onMouseMove={(e) => {
            if (!isDraggingSidebar || !sidebarScrollRef.current) return;
            e.preventDefault();
            const walk = (e.pageY - (sidebarScrollRef.current.offsetTop || 0) - startSidebarY) * 1.5;
            sidebarScrollRef.current.scrollTop = scrollSidebarTop - walk;
          }}
          onTouchStart={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button')) return; 
            setIsDraggingSidebar(true);
            setStartSidebarY(e.touches[0].pageY - (sidebarScrollRef.current?.offsetTop || 0));
            setScrollSidebarTop(sidebarScrollRef.current?.scrollTop || 0);
          }}
          onTouchEnd={() => setIsDraggingSidebar(false)}
          onTouchMove={(e) => {
            if (!isDraggingSidebar || !sidebarScrollRef.current) return;
            const walk = (e.touches[0].pageY - (sidebarScrollRef.current.offsetTop || 0) - startSidebarY) * 1.5;
            sidebarScrollRef.current.scrollTop = scrollSidebarTop - walk;
          }}
          className={`flex-1 px-4 flex flex-row md:flex-col items-center md:items-stretch space-x-3 md:space-x-0 md:space-y-4 overflow-x-auto md:overflow-y-auto hide-scrollbar pb-0 md:pb-8 pt-0 md:pt-2 ${isDraggingSidebar ? 'cursor-grabbing' : 'cursor-default'}`}
        >
          <button onClick={() => setCurrentView('servers')} className={`w-full py-4 rounded-3xl flex items-center justify-center md:px-6 transition-all active:scale-95 border-2 ${currentView === 'servers' ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.15)]' : (theme === 'dark' ? 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300' : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700')}`}>
            <span className="text-sm uppercase font-black tracking-widest drop-shadow-sm">🏠</span><span className="ml-4 hidden md:inline font-bold">Lobby</span>
          </button>

        <div className="pt-0 md:pt-6 border-l md:border-l-0 border-t-0 md:border-t border-zinc-800/50 flex flex-row md:flex-col items-center md:items-stretch pl-4 md:pl-0 h-full md:h-auto">
          <p className="hidden md:block text-[10px] font-black uppercase text-zinc-500 mb-4 px-2 tracking-widest text-left">Instances</p>
            
            {/* ==== NAVIGATION STRUCTURE (ADMIN VIEW) ==== */}
            {isSuperadmin ? (
              Object.entries(playersByServer)
                .sort(([idA], [idB]) => idA.localeCompare(idB))
                .map(([srvId, players]) => {
                  const serverInfo = botInstances.find(b => b.id === srvId);
                  const isFolderOpen = openServerFolder === srvId;
                  
                  return (
                    <div key={srvId} className="relative mb-3 group">
                      <button 
                        onClick={() => {
                          setOpenServerFolder(isFolderOpen ? null : srvId);
                          setActiveServerId(srvId);
                        }}
                        className={`w-full p-2 rounded-2xl flex items-center gap-3 transition-all border-2 ${
                          isFolderOpen 
                            ? 'border-green-500 bg-transparent shadow-[0_0_15px_rgba(34,197,94,0.15)]' 
                            : 'border-transparent bg-transparent hover:border-green-500/50 hover:bg-green-500/10'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden text-sm font-black shadow-inner border transition-colors ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-300'}`}>
                          {serverInfo?.iconUrl ? <img src={serverInfo.iconUrl} alt="Icon" className="w-full h-full object-cover" /> : 'SRV'}
                        </div>
                        <div className="hidden md:block text-left truncate flex-1">
                          <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                            {serverInfo?.serverName || 'Server'}
                          </p>
                          <p className="text-[9px] text-green-500 font-black tracking-wider uppercase">Bots: {players.length}</p>
                        </div>
                      </button>
                      {isFolderOpen && (
                        <div className={`fixed left-24 md:left-64 top-1/2 -translate-y-1/2 ml-4 p-6 rounded-3xl shadow-[20px_20px_60px_rgba(0,0,0,0.4)] z-[9999] animate-in slide-in-from-left-4 duration-200 cursor-default flex flex-col w-max max-w-[calc(100vw-8rem)] md:max-w-[calc(100vw-18rem)] max-h-[90vh] overflow-y-auto border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`} onClick={(e) => e.stopPropagation()}>
                          <div className={`flex justify-between items-center mb-6 gap-8 border-b pb-4 shrink-0 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div>
                                <h3 className={`text-xl font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>Active Instances</h3>
                                <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Server: {serverInfo?.serverName || 'Unknown'}</p>
                              </div>
                              <button onClick={() => setOpenServerFolder(null)} className="text-zinc-500 hover:text-red-500 text-2xl transition-transform hover:rotate-90">✕</button>
                          </div>
                          
                          <div className="flex flex-wrap gap-4 content-start">
                            {players.sort((a, b) => a.key.localeCompare(b.key)).map((p) => {
                               const botInfo = systemBots.find(sb => sb.id === p.state.botId);
                               return (
                                 <button 
                                   key={p.key}
                                   onClick={() => {
                                     setActivePlayerKey(p.key);
                                     setActiveServerId(p.state.serverId);
                                     setCurrentView('player');
                                     setOpenServerFolder(null);
                                   }}
                                   className={`w-32 h-40 rounded-[2rem] border-2 flex flex-col items-center justify-center p-2 transition-all hover:scale-105 active:scale-95 ${
                                     activePlayerKey === p.key 
                                       ? 'border-green-500 bg-green-500/10 text-green-500 shadow-[0_0_20px_#22c55e40]' 
                                       : `hover:bg-green-500/10 hover:border-green-500 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950 text-zinc-400' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`
                                   }`}
                                 >
                                   <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-sm font-black mb-3 overflow-hidden shadow-inner shrink-0 border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}>
                                      {botInfo?.avatarUrl ? <img src={botInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : 'BOT'}
                                   </div>
                                   <span className={`text-[10px] font-black uppercase truncate w-full text-center px-1 ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                                      {botInfo?.name || `Bot #${p.state.botId}`}
                                   </span>
                                   <span className="text-[8px] font-bold text-green-500 mt-1 uppercase tracking-widest bg-green-500/10 px-2 py-0.5 rounded-full">Active</span>
                                 </button>
                               )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
                
            ) : (
              // ==== NAVIGATION STRUCTURE (USER VIEW) ====
              Object.entries(activePlayers).map(([key, state]) => {
                const botInfo = systemBots.find(sb => sb.id === state.botId);
                const isSelected = activePlayerKey === key;
                
                return (
                  <button 
                    key={key}
                    onClick={() => { 
                      setActivePlayerKey(key); 
                      setActiveServerId(state.serverId); 
                      setCurrentView('player'); 
                    }}
                    className={`w-full p-3 mb-3 rounded-2xl flex items-center gap-4 transition-all border-2 ${
                      isSelected 
                        ? 'border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.2)]' 
                        : `hover:border-green-500 hover:bg-green-500/10 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white shadow-sm'}`
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl overflow-hidden border shrink-0 shadow-md flex items-center justify-center text-sm font-black ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-300 bg-white'}`}>
                      {botInfo?.avatarUrl ? <img src={botInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : 'BOT'}
                    </div>
                    <div className="text-left hidden md:block truncate flex-1">
                      <p className={`text-[11px] font-black truncate leading-tight ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                        {botInfo?.name || `Instance #${state.botId}`}
                      </p>
                      <p className="text-[9px] text-green-500 font-bold uppercase tracking-tighter mt-0.5">Your Instance</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative h-[calc(100dvh-5rem)] md:h-full overflow-hidden">
        <header className={`h-24 flex items-center px-8 justify-between border-b shrink-0 z-[60] ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900/50' : 'bg-white border-zinc-200'}`}>
          <div className="flex-1 pr-4 md:pr-8">
            {/* ============================================================ */}
            {/* ==== SCREEN: PLAYER CONTROL PANEL ========================== */}
            {/* ============================================================ */}
            {currentView === 'player' ? (
              <div className="relative w-full max-w-[160px] sm:max-w-xs md:max-w-md">
                <div className={`flex items-center rounded-2xl border-2 transition-all w-full overflow-hidden ${isSearchFocused ? 'border-green-500 shadow-lg shadow-green-500/10 bg-green-500/5' : (theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-zinc-50')}`}>
                  <button onClick={() => setSearchSource(s => s === 'network' ? 'local' : 'network')} className="w-12 h-12 flex items-center justify-center border-r border-zinc-800/20 dark:border-zinc-800 active:scale-90 transition-colors">{searchSource === 'network' ? '🔴' : '📁'}</button>
                  <input 
                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        if (searchSource === 'network') {
                          addToHistory(searchQuery, 'network', searchQuery);
                          sendCommand("play", searchQuery, "network");
                          setSearchQuery("");
                        } else {
                          sendCommand("play", searchQuery, "local");
                        }
                      }
                    }}
                    placeholder="Search..." className="flex-1 bg-transparent px-4 outline-none font-medium" 
                  />
                </div>
                {isSearchFocused && (
                  <div className={`absolute top-full left-0 right-0 mt-2 border-2 rounded-3xl overflow-hidden shadow-2xl z-[100] ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-black'}`}>
                    <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
                      {localResults.length > 0 && (
                        <div className="p-2 border-b border-zinc-800/50 bg-zinc-950/20">
                          <div className="p-2 text-[10px] font-black text-green-500 uppercase tracking-widest">Local matches</div>
                          {localResults.map((r: any) => (
                            <div key={r.track_id} className={`flex items-center p-2 rounded-xl cursor-pointer transition-colors ${theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`} 
                              onMouseDown={(e) => { 
                                e.preventDefault(); 
                                addToHistory(r.title, 'local', r.track_id); 
                                sendCommand("play", r.track_id, "local_id"); 
                                setSearchQuery("");
                                setLocalSearchResults([]);
                              }}>
                              <div className={`w-6 h-6 rounded flex items-center justify-center mr-3 text-[10px] text-green-500 font-black ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>{r.index}</div>
                              <div className="truncate text-sm font-bold">{r.title}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {searchHistory.length > 0 && (
                        <div className="p-2">
                          <div className="flex justify-between p-2 text-[10px] font-black text-zinc-500 uppercase"><span>Recent</span><button onMouseDown={(e) => { e.preventDefault(); setSearchHistory([]); }} className="hover:text-red-500">Clear</button></div>
                          {searchHistory.map(h => (
                            <div key={h.id} className={`flex items-center p-2 rounded-xl group cursor-pointer transition-colors ${theme === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`} onMouseDown={(e) => { e.preventDefault(); sendCommand("play", h.query, h.source === 'local' ? 'local_id' : 'network'); }}>
                              <span className="mr-3 opacity-50">{h.source === 'network' ? '🔴' : '📁'}</span>
                              <div className="flex-1 truncate text-sm font-bold">{h.title}</div>
                              <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setSearchHistory(prev => prev.filter(x => x.id !== h.id)); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4 sm:gap-8 animate-in fade-in duration-500">
                <h1 className="text-xl sm:text-2xl font-black">Select Instance</h1>
                <div className={`hidden md:flex items-center p-1 px-4 rounded-full border gap-3 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <span className={`text-[10px] font-black uppercase tracking-widest text-zinc-500`}>Density: {gridCols}</span>
                  <input 
                    type="range" min="1" max="5" step="1"
                    value={gridCols} 
                    onChange={(e) => setGridCols(Number(e.target.value))} 
                    className="w-24 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none accent-green-500" 
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 md:gap-6 ml-auto z-20">
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className={`...`}>{theme === 'dark' ? '☀️' : '🌙'}</button>            
            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-4 group active:scale-95 transition">
              <div className="text-right hidden sm:block"><p className="text-sm font-bold">{currentUser.name}</p><p className="text-[10px] text-green-500 font-black uppercase">Online</p></div>
              <div className={`w-12 h-12 rounded-2xl border ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-zinc-100'} flex items-center justify-center text-xl group-hover:border-green-500 transition-colors overflow-hidden`}>
                <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              </div>            
            </button>
          </div>
        </header>

        {/* Attach mainScrollRef to the scrollable part for mobile/narrow screens */}
        <div ref={mainScrollRef} className="flex-1 flex flex-col xl:flex-row p-4 md:p-6 gap-6 overflow-y-auto xl:overflow-hidden min-h-0 relative pb-24 md:pb-6">
          {currentView === 'player' ? (
            <>
              <div className="w-full xl:flex-1 flex flex-col items-center p-4 sm:p-10 xl:overflow-y-auto hide-scrollbar relative z-0 shrink-0">
                
                {(() => {
                  const controlledBot = systemBots.find(sb => sb.id === playerState.botId);
                  const controlledServer = botInstances.find(b => b.id === playerState.serverId);
                  
                  return controlledBot && controlledServer && (
                    <div className={`absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-3 px-4 py-2 rounded-2xl border backdrop-blur-md shadow-lg z-0 animate-in fade-in duration-500 group transition-all duration-300 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950/70' : 'border-zinc-300 bg-white/70'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border overflow-hidden shrink-0 text-xs font-black ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                        {controlledBot.avatarUrl ? <img src={controlledBot.avatarUrl} alt="" className="w-full h-full object-cover" /> : 'BOT'}
                      </div>
                      
                      <div className="text-left flex-1 flex flex-col gap-0.5">
                        <div className="truncate max-w-[150px]">
                          <p className={`text-[8px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-green-500' : 'text-green-600'}`}>Controlling</p>
                          <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>{controlledBot.name}</p>
                        </div>
                        
                        <div className={`mt-0.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto truncate max-w-[150px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            <div className={`w-4 h-4 rounded-md overflow-hidden shrink-0 border shadow-inner text-[6px] font-black flex items-center justify-center ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                                {controlledServer.iconUrl ? <img src={controlledServer.iconUrl} alt="Icon" className="w-full h-full object-cover" /> : 'S'}
                            </div>
                            <p className="text-[9px] font-medium truncate">Server: {controlledServer.serverName}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="w-full flex flex-col items-center my-auto min-h-max pt-20 sm:pt-0 pb-8">
                  <div className="w-64 h-64 md:w-80 md:h-80 rounded-[3.5rem] shadow-2xl mb-10 border-4 border-zinc-300 dark:border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center bg-white dark:bg-zinc-900">
                    <CoverImage url={playerState.thumbnailUrl} />
                  </div>
                  <div className={`flex flex-col items-center text-center transition-all overflow-hidden w-[calc(100%-4rem)] max-w-[42rem] ${isSmallScreen ? 'mb-6 mt-2' : 'mb-12 mt-6'}`}>
                    <div ref={titleContainerRef} className={`w-full overflow-hidden flex items-center ${shouldAnimateTitle ? 'justify-start' : 'justify-center'} ${isSmallScreen ? 'h-12' : 'h-16'}`}>
                      <div ref={titleTextRef} className={`inline-block whitespace-nowrap ${shouldAnimateTitle ? 'animate-marquee-bounce px-8' : ''}`} style={shouldAnimateTitle ? { '--overflow': `-${overflowAmountTitle}px`, '--duration': `${Math.max(10, playerState.trackName.length * 0.15)}s` } as React.CSSProperties : {}}>
                        <h2 className={`${isSmallScreen ? 'text-3xl' : 'text-5xl'} font-black text-green-500 drop-shadow-lg [-webkit-text-stroke:1.5px_rgba(0,0,0,0.8)] dark:[-webkit-text-stroke:1px_rgba(0,0,0,0.5)]`}>{playerState.trackName}</h2>
                      </div>
                    </div>
                    <p className={`${isSmallScreen ? 'text-sm mt-1' : 'text-xl mt-2'} font-bold text-zinc-500 uppercase tracking-widest`}>{playerState.author}</p>
                  </div>
                  
                  <div className="w-full max-w-lg space-y-12">
                    <input 
                      type="range" min="0" max="100" step="0.1"
                      value={localProgress !== null ? localProgress : playerState.progressPercent}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setLocalProgress(val);
                        const now = Date.now();
                        if (now - lastProgressSendTime.current > 300) {
                          sendCommand("seek", Math.floor((val / 100) * playerState.durationSeconds).toString());
                          lastProgressSendTime.current = now;
                        }
                      }}
                      onMouseUp={(e) => {
                        const val = Number(e.currentTarget.value);
                        sendCommand("seek", Math.floor((val / 100) * playerState.durationSeconds).toString());
                        setTimeout(() => setLocalProgress(null), 500);
                      }}
                      onTouchEnd={(e) => {
                        const val = Number(e.currentTarget.value);
                        sendCommand("seek", Math.floor((val / 100) * playerState.durationSeconds).toString());
                        setTimeout(() => setLocalProgress(null), 500);
                      }}
                      className="w-full h-2.5 bg-zinc-800 rounded-full appearance-none accent-green-500 cursor-pointer hover:accent-green-400 shadow-inner"
                    />
                        {/* MAIN CONTAINER WITH CONTROLS - LOOP/PLAY */}
                        <div className="relative w-full max-w-md mx-auto flex items-center justify-center">
                          <div className="flex items-center justify-center gap-4 sm:gap-6 z-10 w-full">
                            
                            {/* EMPTY SPACER */}
                            <div className="w-10 sm:w-12 shrink-0 pointer-events-none opacity-0"></div>
                            
                            <button onClick={() => sendCommand("previous")} className="shrink-0 text-green-500 hover:text-green-400 transition-all active:scale-95 drop-shadow-md">
                              <svg className="w-14 h-14 sm:w-20 sm:h-20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                            </button>
                            <button onClick={() => sendCommand("play_pause")} className="shrink-0 text-green-500 hover:text-green-400 flex items-center justify-center transition-all active:scale-95 drop-shadow-md">
                              {playerState.isPlaying ? (
                                <svg className="w-20 h-20 sm:w-28 sm:h-28" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                              ) : (
                                <svg className="w-20 h-20 sm:w-28 sm:h-28" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                              )}
                            </button>
                            <button onClick={() => sendCommand("skip")} className="shrink-0 text-green-500 hover:text-green-400 transition-all active:scale-95 drop-shadow-md">
                              <svg className="w-14 h-14 sm:w-20 sm:h-20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                            </button>

                            {/* LOOP BUTTON */}
                            <button onClick={toggleLoop} className={`shrink-0 w-10 sm:w-12 flex items-center justify-center p-2 transition-all active:scale-95 drop-shadow-sm ${playerState.isLooping ? 'text-green-500 hover:text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'text-zinc-400 hover:text-green-500'}`}>
                              <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-md mx-auto px-4 mt-6 gap-6 sm:gap-4">
                          {/* LEAVE BUTTON */}
                          <button 
                            onClick={() => { 
                              sendCommand("leave"); 
                              setCurrentView('servers'); 
                            }} 
                            className="py-3 px-6 sm:px-8 rounded-2xl border border-red-900/30 bg-red-950/10 text-red-500 font-black text-[10px] tracking-[0.2em] active:scale-95 transition-all hover:bg-red-900/20 shadow-lg shadow-red-900/5 whitespace-nowrap"
                            title="Kick bot from channel"
                          >
                            LEAVE
                          </button>

                          {/* VOLUME */}
                          <div className="flex items-center justify-center gap-4 flex-1 w-full max-w-[200px] sm:max-w-none">
                            <button 
                              onClick={() => {
                                if (playerState.volume === 0) { sendCommand("volume", lastVolume.toString()); } 
                                else { setLastVolume(playerState.volume); sendCommand("volume", "0"); }
                              }}
                              className={`text-xs font-black transition-all ${playerState.volume === 0 ? 'text-red-500' : 'text-zinc-400 hover:text-white'}`}
                            >
                              {playerState.volume === 0 ? 'MUTE' : 'VOL'}
                            </button>
                            <input 
                              type="range" min="0" max="100" 
                              value={localVolume !== null ? localVolume : playerState.volume} 
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLocalVolume(val);
                                const now = Date.now();
                                if (now - lastVolumeSendTime.current > 300) {
                                  sendCommand("volume", val.toString());
                                  lastVolumeSendTime.current = now;
                                }
                              }}
                              onMouseUp={(e) => {
                                sendCommand("volume", e.currentTarget.value);
                                setTimeout(() => setLocalVolume(null), 500);
                              }}
                              onTouchEnd={(e) => {
                                sendCommand("volume", e.currentTarget.value);
                                setTimeout(() => setLocalVolume(null), 500);
                              }}
                              className={`w-full flex-1 accent-green-500 cursor-pointer h-2 rounded-lg appearance-none ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`} 
                            />
                          </div>
                        </div>
                  </div>
                </div>
              </div>

              <div className={`w-full xl:w-96 flex flex-col relative z-20 rounded-[3rem] p-6 md:p-8 border shrink-0 xl:h-full xl:max-h-[calc(100dvh-6rem)] xl:overflow-hidden ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-zinc-200 shadow-xl'}`}>
                
                {(() => {
                  const isRadioOn = playerState.isRadioActive === true;
                  return (
                    <button 
                      onClick={() => { 
                        if (!activePlayerKey) return;
                        sendCommand("radio_network"); 
                      }}
                      className={`w-full py-4 mb-4 rounded-2xl font-black text-[10px] tracking-[0.2em] border transition-all active:scale-95 shrink-0 ${!isRadioOn ? (theme === 'dark' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' : 'bg-zinc-100 text-zinc-500 border-zinc-300') : 'bg-green-600 text-white border-green-500 shadow-lg'}`}
                    >
                      RADIO {!isRadioOn ? 'OFF' : 'ON'}
                    </button>
                  );
                })()}
                
                <div 
                  ref={queueScrollRef}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('button') || activeDragHandle !== null) return;
                    setIsDraggingQueue(true);
                    setStartQueueY(e.pageY - (queueScrollRef.current?.offsetTop || 0));
                    setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
                  }}
                  onMouseUp={() => setIsDraggingQueue(false)}
                  onMouseLeave={() => setIsDraggingQueue(false)}
                  onMouseMove={(e) => {
                    if (!isDraggingQueue || !queueScrollRef.current) return;
                    e.preventDefault();
                    const walk = (e.pageY - (queueScrollRef.current.offsetTop || 0) - startQueueY) * 1.5;
                    queueScrollRef.current.scrollTop = scrollQueueTop - walk;
                  }}
                  onTouchStart={(e) => {
                    if ((e.target as HTMLElement).closest('button') || activeDragHandle !== null) return;
                    setIsDraggingQueue(true);
                    setStartQueueY(e.touches[0].pageY - (queueScrollRef.current?.offsetTop || 0));
                    setScrollQueueTop(queueScrollRef.current?.scrollTop || 0);
                  }}
                  onTouchEnd={() => setIsDraggingQueue(false)}
                  onTouchMove={(e) => {
                    if (!isDraggingQueue || !queueScrollRef.current) return;
                    const walk = (e.touches[0].pageY - (queueScrollRef.current.offsetTop || 0) - startQueueY) * 1.5;
                    queueScrollRef.current.scrollTop = scrollQueueTop - walk;
                  }}
                  className="xl:flex-1 xl:overflow-y-auto mt-6 hide-scrollbar space-y-3 pb-4"
                >
                  {unifiedList.length > 0 ? unifiedList.map((title, idx) => {
                    const isHistory = idx < currentIndex;
                    const isNowPlaying = idx === currentIndex;
                    const isBottomIndicator = draggedIndex === currentIndex && idx > currentIndex;

                    return (
                      <React.Fragment key={`${title}-${idx}`}>
                        
                        {idx === 0 && historyList.length > 0 && (
                          <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4 mt-2">Previous</h3>
                        )}
                        {isNowPlaying && (
                          <h3 className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-4 mt-6">Now Playing</h3>
                        )}
                        {idx === currentIndex + 1 && (
                          <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4 mt-6">Up Next</h3>
                        )}

                        <div 
                          ref={isNowPlaying ? currentTrackRef : null}
                          draggable={activeDragHandle === idx} 
                          onDragStart={(e) => { e.stopPropagation(); setDraggedIndex(idx); }} 
                          onDragEnter={() => setDragOverIndex(idx)} 
                          onDragEnd={() => { 
                            if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
                              sendCommand("move_track", `${draggedIndex}:${dragOverIndex}`); 
                            }
                            setDraggedIndex(null); setDragOverIndex(null); setActiveDragHandle(null);
                          }} 
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (queueScrollRef.current) {
                              const container = queueScrollRef.current;
                              const rect = container.getBoundingClientRect();
                              const threshold = 60;
                              const speed = 8;
                              if (e.clientY < rect.top + threshold) { container.scrollTop -= speed; } 
                              else if (e.clientY > rect.bottom - threshold) { container.scrollTop += speed; }
                            }
                          }}
                          className={`queue-item p-4 mb-3 rounded-3xl border flex items-center gap-3 group transition-all duration-300 ${dragOverIndex === idx ? (isBottomIndicator ? 'drag-over-item-bottom' : 'drag-over-item') : ''} ${theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800' : 'bg-zinc-50 border-zinc-200'} ${isNowPlaying ? 'border-green-500/50 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : ''} ${isHistory ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : ''}`}                        >
                          <div className="drag-handle cursor-grab text-zinc-700 hover:text-green-500 transition-colors px-1" onMouseEnter={() => setActiveDragHandle(idx)} onMouseLeave={() => setActiveDragHandle(null)}>
                            ⋮⋮
                          </div>
                          
                          <div onClick={(e) => { e.stopPropagation(); if (!isNowPlaying) sendCommand("play_index", idx.toString()); }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 cursor-pointer group/playbtn transition-all duration-200 ${isNowPlaying ? 'text-white bg-green-600 border border-green-500' : (theme === 'dark' ? 'bg-black border border-zinc-800 text-green-500 hover:bg-green-500/20' : 'bg-white border border-zinc-300 text-green-600 hover:bg-green-100')}`}>
                            <span className={`block ${!isNowPlaying ? 'group-hover/playbtn:hidden' : ''}`}>{isNowPlaying ? '▶' : Math.abs(idx - currentIndex)}</span>
                            {!isNowPlaying && <span className="hidden group-hover/playbtn:block text-[12px] pl-0.5">▶</span>}
                          </div>
                          
                          <QueueItemText title={title} theme={theme} />
                          
                          <button onClick={() => { if (isNowPlaying) sendCommand("skip"); else sendCommand("remove_track", idx.toString()); }} className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all">
                            ✕
                          </button>
                        </div>
                      </React.Fragment>
                    );
                  }) : <div className="text-center text-zinc-700 text-sm mt-10 font-bold">EMPTY QUEUE</div>}
                </div>

                {playerState.upNext.length > 0 && (
                  <button 
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear the queue?")) {
                      sendCommand("clear");
                    }
                  }}
                  className="shrink-0 mt-auto w-full py-4 rounded-2xl font-black text-[10px] tracking-[0.2em] bg-red-900/10 text-red-500 border border-red-900/30 hover:bg-red-900/20 active:scale-95 transition-all"
                >
                  CLEAR QUEUE
                </button>
                )}
              </div>
            </>
          //============================================================
          //==== SCREEN: BOT INSTANCE SELECTION (BOTS) =================
          //============================================================
          ) : currentView === 'bots' ? (
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 md:p-20 relative">
              
              <div className="md:hidden flex justify-center mb-8">
                <div className={`flex items-center p-2 px-6 rounded-full border gap-4 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Density: {gridCols}</span>
                  <input type="range" min="1" max="4" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} className="w-24 accent-green-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>
              
              {!isSuperadmin && channelBotLimitInfo.current >= channelBotLimitInfo.max && (
                <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in duration-500">
                  <div className="bg-zinc-950 border-4 border-red-500/30 p-12 rounded-[4rem] text-center shadow-[0_0_50px_rgba(239,68,68,0.2)] max-w-lg">
                    <div className="text-4xl mb-8 font-black text-red-500">STOP</div>
                    <h2 className="text-4xl font-black text-white mb-4">Limit Reached!</h2>
                    <p className="text-zinc-400 font-bold mb-10 uppercase tracking-widest text-sm leading-relaxed">
                      There are already {channelBotLimitInfo.max} bots on your voice channel.<br/>You must kick one out to summon another.
                    </p>
                    <button onClick={() => setCurrentView('servers')} className="w-full py-5 bg-zinc-800 hover:bg-zinc-700 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl">RETURN TO LOBBY</button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-3xl font-black">Select Bot</h2>
                </div>
                <button onClick={() => setCurrentView('servers')} className="text-zinc-500 font-bold hover:text-white transition">Back to servers</button>
              </div>

              <div className="grid gap-16 justify-items-center w-full" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                
                {isLoadingBots ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 animate-pulse">
                    <div className="text-2xl mb-6 font-black uppercase text-zinc-500">BOT</div>
                    <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">Scanning fleet...</h3>
                  </div>
                ) : (
                  [...systemBots]
                  .filter(sysBot => sysBot.isInServer) 
                  .sort((a, b) => {
                    const aUnavailable = a.isBusy;
                    const bUnavailable = b.isBusy;
                    if (aUnavailable && !bUnavailable) return 1;
                    if (!aUnavailable && bUnavailable) return -1;
                    return a.id - b.id;
                  }).map(sysBot => {
                    const isUnavailable = sysBot.isBusy || sysBot.userHasPermission === false;
                    const statusText = sysBot.isBusy 
                        ? "Busy elsewhere" 
                        : (sysBot.userHasPermission === false ? "Join a channel!" : "Ready for action");
                    
                    return (
                      <div key={sysBot.id} 
                        onClick={() => { if (!isUnavailable) { setSelectedBotIndex(sysBot.id); fetchChannels(activeServerId!); } }}
                        className={`max-w-xs w-full aspect-[4/5] p-10 rounded-[4rem] border-4 flex flex-col items-center justify-center gap-8 transition-all overflow-hidden 
                            ${isUnavailable 
                                ? `opacity-30 grayscale cursor-not-allowed ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}` 
                                : `cursor-pointer shadow-2xl hover:scale-[1.05] active:scale-95 hover:border-green-500 hover:bg-green-500/10 hover:shadow-green-500/20 ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200'}`
                            }`}
                      >
                        <div className={`w-24 h-24 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'} rounded-[2.5rem] flex items-center justify-center text-sm font-black shrink-0 border shadow-inner overflow-hidden`}>
                          {sysBot.avatarUrl ? <img src={sysBot.avatarUrl} alt="" className="w-full h-full object-cover" /> : 'BOT'}
                        </div>
                        <div className="text-center">
                          <h3 className="text-2xl font-black tracking-tight leading-tight mb-2 px-2">{sysBot.name}</h3>
                          <p className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-80 ${isUnavailable ? 'text-red-500' : 'text-green-500'}`}>
                            {statusText}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          //============================================================
          //==== SCREEN: LOBBY AND SERVER SELECTION (SERVERS) ==========
          //============================================================
          ) : (
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 md:p-20 relative">
              <div className="md:hidden flex justify-center mb-8">
                <div className={`flex items-center p-2 px-6 rounded-full border gap-4 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Density: {gridCols}</span>
                  <input type="range" min="1" max="4" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} className="w-24 accent-green-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>

              <div className="grid gap-16 justify-items-center w-full" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                {botInstances.map(server => (
                  <div key={server.id} onClick={() => handleServerClick(server)}
                    className={`max-w-xs w-full aspect-[4/5] p-10 rounded-[4rem] border-4 flex flex-col items-center justify-center gap-8 transition-all hover:scale-[1.05] active:scale-95 overflow-hidden cursor-pointer hover:border-green-500 hover:bg-green-500/10 hover:shadow-green-500/20 shadow-2xl ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200'} ${server.isLocked ? 'border-green-500 bg-green-500/10' : ''}`}>
                    <div className={`w-24 h-24 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'} rounded-[2.5rem] flex items-center justify-center text-sm font-black shrink-0 border shadow-inner`}>
                      {server.iconUrl ? <img src={server.iconUrl} alt="" className="w-full h-full object-cover rounded-[2.5rem]" /> : "SRV"}
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-black tracking-tight leading-tight mb-2 px-2">{server.serverName}</h3>
                      <p className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-80 ${server.isLocked ? 'text-green-500' : 'text-zinc-500'}`}>
                        {server.isLocked ? '▶ Playing music' : 'Select bot'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* ==== MODAL: VOICE CHANNEL SELECTION ======================== */}
        {/* ============================================================ */}
        {selectedBotIndex !== null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-md p-8 rounded-[2rem] shadow-2xl border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black">Select voice channel</h3>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">For selected bot</p>
                </div>
                <button onClick={() => setSelectedBotIndex(null)} className="text-2xl p-2 hover:scale-110 transition opacity-50 hover:opacity-100 hover:text-red-500">✕</button>
              </div>
              
              <div className="max-h-64 overflow-y-auto pr-2 space-y-2 hide-scrollbar">
                {isLoadingChannels ? (
                  <div className="text-center py-8 text-zinc-500 font-bold animate-pulse">Searching for channels...</div>
                ) : availableChannels.length > 0 ? (
                  availableChannels.map(channel => (
                    <button key={channel.id} onClick={() => joinChannel(channel.id, selectedBotIndex)}
                      className={`w-full text-left p-4 rounded-xl font-bold transition-colors border hover:border-green-500 hover:bg-green-500/10 ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
                      {channel.name}
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-red-500 font-bold">No visible voice channels.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentView === 'player' && (
          <button 
            onClick={scrollToCurrent} 
            className={`absolute bottom-24 right-4 sm:right-6 md:bottom-8 md:right-8 z-[150] w-14 h-14 border-2 rounded-full flex items-center justify-center text-xs font-black shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all active:scale-90 hover:scale-110 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700 hover:border-green-500' : 'bg-white border-zinc-300 text-black hover:bg-zinc-100 hover:border-green-500'}`} 
            title="Back to current track"
          >
            UP
          </button>
        )}
      </main>
    </div>
  )
}

export default App