import React, { useState, useEffect, useRef, useCallback } from 'react';
import logo from './assets/logo.png';

import CoverImage from './components/player/CoverImage';
import PlayerControls from './components/player/PlayerControls';
import QueuePanel from './components/queue/QueuePanel';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import BotSelector from './components/bots/BotSelector';

import useTheme from './hooks/useTheme';
import useWebSocket from './hooks/useWebSocket';
import usePlayerState from './hooks/usePlayerState';
import useBots from './hooks/useBots';
import useQueue from './hooks/useQueue';
import useChannels from './hooks/useChannels';
import useAuth from './hooks/useAuth';
import useLanguage from './hooks/useLanguage';
import { SUPPORTED_LANGUAGES } from './i18n/index';
import { useTranslation } from 'react-i18next';
import { sanitizeAvatarSrc } from './utils/sanitize';
import type { PlayerState } from './types/player';

import VoteBanner from './components/governance/VoteBanner';
import OwnerBadge from './components/governance/OwnerBadge';

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  useEffect(() => {
    document.title = 'LaMus';
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

  useEffect(() => {
    localStorage.setItem('mbv2_view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (activeServerId) {
      localStorage.setItem('mbv2_active_server', activeServerId);
    }
  }, [activeServerId]);

  const { currentUser, isSuperadmin, sessionVerified, logout } = useAuth();

  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  const {
    botInstances,
    systemBots,
    setSystemBots,
    isLoadingBots,
    channelBotLimitInfo,
  } = useBots({ activeServerId, currentView });

  const { availableChannels, isLoadingChannels, fetchChannels } = useChannels();

  const [activePlayerKey, setActivePlayerKey] = useState<string | null>(
    () => localStorage.getItem('mbv2_active_player_key') || null
  );

  useEffect(() => {
    if (activePlayerKey) {
      localStorage.setItem('mbv2_active_player_key', activePlayerKey);
    } else {
      localStorage.removeItem('mbv2_active_player_key');
    }
  }, [activePlayerKey]);

  const handleBotGone = useCallback(() => {
    setActivePlayerKey(null);
    setCurrentView('servers');
  }, []);

  const { playerState, setPlayerState, activePlayers, handleWsData, resetMissingTicks } =
    usePlayerState({
      activePlayerKey,
      isSuperadmin,
      setSystemBots,
      onBotGone: handleBotGone,
    });

  useWebSocket(!!currentUser, handleWsData);

  const {
    draggedIndex, setDraggedIndex,
    dragOverIndex, setDragOverIndex,
    activeDragHandle, setActiveDragHandle,
    isDraggingQueue, setIsDraggingQueue,
    startQueueY, setStartQueueY,
    scrollQueueTop, setScrollQueueTop,
    shufflePressed, setShufflePressed,
    dedupPressed, setDedupPressed,
    sortMode, setSortMode,
  } = useQueue();

  const [gridCols, setGridCols] = useState(3);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedBotIndex, setSelectedBotIndex] = useState<number | null>(null);
  const [openServerFolder, setOpenServerFolder] = useState<string | null>(null);
  const [leaveDebounce, setLeaveDebounce] = useState<Record<number, boolean>>({});

  const currentTrackRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLElement>(null);

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [startSidebarY, setStartSidebarY] = useState(0);
  const [scrollSidebarTop, setScrollSidebarTop] = useState(0);

  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLDivElement>(null);
  const [shouldAnimateTitle, setShouldAnimateTitle] = useState(false);
  const [overflowAmountTitle, setOverflowAmountTitle] = useState(0);

  useEffect(() => {
    const check = () => {
      if (!titleContainerRef.current || !titleTextRef.current) return;
      const cW = titleContainerRef.current.clientWidth;
      const tW = titleTextRef.current.scrollWidth;
      if (tW > cW) {
        setShouldAnimateTitle(true);
        setOverflowAmountTitle(tW - cW);
      } else {
        setShouldAnimateTitle(false);
        setOverflowAmountTitle(0);
      }
    };
    const timer = setTimeout(check, 100);
    window.addEventListener('resize', check);
    return () => { clearTimeout(timer); window.removeEventListener('resize', check); };
  }, [playerState.trackName]);

  const lastVolumeSendTime = useRef<number>(0);
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const [lastVolume, setLastVolume] = useState<number>(100);

  useEffect(() => {
    if (playerState.volume > 0) setLastVolume(playerState.volume);
  }, [playerState.volume]);

  const lastProgressSendTime = useRef<number>(0);
  const [localProgress, setLocalProgress] = useState<number | null>(null);

  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerHeight < 700);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (playerState.serverId && !activeServerId) {
      setActiveServerId(playerState.serverId);
    }
  }, [playerState.serverId, activeServerId]);

  useEffect(() => {
    if (!activePlayerKey) return;
    setPlayerState((prev) => ({ ...prev, isRadioActive: false }));
  }, [activePlayerKey]);

  const historyList = playerState.history || [];
  const unifiedList = [...historyList, ...playerState.upNext];
  const currentIndex = historyList.length;

  const playersByServer = Object.entries(activePlayers).reduce(
    (acc, [key, state]) => {
      if (!acc[state.serverId]) acc[state.serverId] = [];
      acc[state.serverId].push({ key, state });
      return acc;
    },
    {} as Record<string, { key: string; state: PlayerState }[]>
  );

  const isCurrentUserOwner = playerState.ownerId === currentUser?.id;
  const isCurrentUserDelegate = playerState.delegatedUserIds.includes(currentUser?.id ?? '');
  const hasDirectControl = isSuperadmin || isCurrentUserOwner || isCurrentUserDelegate;

  const sendCommand = async (action: string, payload?: string, source?: string) => {
    if (!activeServerId) return;
    try {
      const res = await fetch(`${API_URL}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serverId: activeServerId,
          botId: playerState.botId,
          action,
          payload: payload || null,
          source: source || null,
        }),
      });

      if (res.status === 401) {
        localStorage.removeItem('mbv2_user');
        localStorage.removeItem('mbv2_view');
        localStorage.removeItem('mbv2_active_server');
        localStorage.removeItem('mbv2_active_player_key');
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('Command sending error:', err);
    }
  };

  const sendLeaveWithDebounce = async () => {
    const botId = playerState.botId;
    if (leaveDebounce[botId]) return;
    setLeaveDebounce(prev => ({ ...prev, [botId]: true }));
    await sendCommand('leave');
    setTimeout(() => {
      setLeaveDebounce(prev => ({ ...prev, [botId]: false }));
    }, 2000);
  };

  const toggleLoop = () => sendCommand('toggle_loop');

  const handleServerClick = (server: { id: string }) => {
    setActiveServerId(server.id);
    setCurrentView('bots');
    fetchChannels(server.id, isSuperadmin);
  };

  const joinedAtRef = useRef<number>(0);

  const joinChannel = async (channelId: string, botIndex: number) => {
    if (!activeServerId) return;
    setSelectedBotIndex(null);
    const expectedKey = `${activeServerId}_${botIndex}`;
    joinedAtRef.current = Date.now();
    resetMissingTicks();
    setActivePlayerKey(expectedKey);
    setCurrentView('player');
    setOpenServerFolder(null);
    try {
      await fetch(`${API_URL}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serverId: activeServerId,
          action: 'join',
          payload: channelId,
          source: `${botIndex}:${currentUser?.name ?? ''}`,
        }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const scrollToCurrent = () => {
    if (!currentTrackRef.current) return;
    const element = currentTrackRef.current;
    if (window.innerWidth >= 1280) {
      if (queueScrollRef.current) {
        const container = queueScrollRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 32;
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
      }
    } else if (mainScrollRef.current) {
      const container = mainScrollRef.current;
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 32;
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
    } else {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!sessionVerified) {
    return (
      <div className={`fixed inset-0 h-[100dvh] w-full flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-zinc-100'}`}>
        <img src={logo} alt="LaMus" className="w-20 h-20 object-contain animate-bounce opacity-60" style={{ animationDuration: '1.5s' }} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={`fixed inset-0 h-[100dvh] w-full flex items-center justify-center transition-colors duration-300 font-sans select-none ${theme === 'dark' ? 'bg-black text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <div className={`max-w-md w-full p-12 rounded-[3rem] shadow-2xl border-4 text-center ${theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-white border-zinc-200'}`}>
          <div className="w-28 h-28 mx-auto rounded-[2.5rem] flex items-center justify-center mb-6 shadow-2xl drop-shadow-2xl">
            <img src={logo} alt="LaMus Logo" className="w-full h-full object-contain animate-bounce" style={{ animationDuration: '3s' }} />
          </div>
          <h2 className="text-4xl font-black mb-2 text-orange-500 tracking-tighter">{t('auth.loginTitle')}</h2>
          <p className="text-sm text-zinc-500 font-bold mb-10">{t('auth.loginSubtitle')}</p>
          <button
            onClick={() => (window.location.href = `${API_URL}/api/auth/login`)}
            className="w-full py-5 rounded-2xl bg-[#5865F2] text-white font-bold hover:bg-[#4752C4] transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#5865F2]/20 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
            </svg>
            {t('auth.loginButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 h-[100dvh] w-full max-w-full flex flex-col-reverse md:flex-row overflow-x-hidden overflow-y-hidden transition-colors duration-300 font-sans select-none ${theme === 'dark' ? 'bg-black text-zinc-100' : 'bg-white text-zinc-900'}`}>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 z-[140] backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsSettingsOpen(false)} />
      )}

      <aside className={`fixed top-0 right-0 h-full w-80 z-[150] transform transition-transform duration-500 ease-in-out p-8 flex flex-col ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'} ${theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xl'} border-l`}>
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-xl font-black uppercase text-zinc-500 tracking-widest">{t('auth.settingsTitle')}</h2>
          <button onClick={() => setIsSettingsOpen(false)} className="text-2xl p-2 hover:scale-125 transition">✕</button>
        </div>
        <div className="flex-1 space-y-10 flex flex-col">
          <section className="space-y-4 text-center">
            <div className={`w-24 h-24 mx-auto rounded-[2rem] flex items-center justify-center text-4xl shadow-inner border overflow-hidden ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-300 bg-zinc-100'}`}>
              <img src={sanitizeAvatarSrc(currentUser.avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-xl font-black">{currentUser.name}</h3>
              <p className="text-[10px] text-green-500 font-black uppercase tracking-widest mt-1">{t('auth.status')}</p>
            </div>
          </section>
          <section className="space-y-2">
            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">{t('settings.language')}</p>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl font-bold text-sm border outline-none transition-colors ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-100 border-zinc-300 text-black'}`}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </section>
          <div className="mt-auto">
            <button
              onClick={() => { logout(); setIsSettingsOpen(false); }}
              className="w-full py-4 rounded-xl bg-red-900/10 text-red-500 font-bold border border-red-900/30 hover:bg-red-900/20 transition"
            >
              {t('auth.logoutButton')}
            </button>
          </div>
        </div>
      </aside>

      <Sidebar
        theme={theme}
        currentView={currentView}
        isSuperadmin={isSuperadmin}
        botInstances={botInstances}
        systemBots={systemBots}
        activePlayers={activePlayers}
        playersByServer={playersByServer}
        activePlayerKey={activePlayerKey}
        activeServerId={activeServerId}
        openServerFolder={openServerFolder}
        sidebarScrollRef={sidebarScrollRef}
        isDraggingSidebar={isDraggingSidebar}
        startSidebarY={startSidebarY}
        scrollSidebarTop={scrollSidebarTop}
        setCurrentView={setCurrentView}
        setActivePlayerKey={setActivePlayerKey}
        setActiveServerId={setActiveServerId}
        setOpenServerFolder={setOpenServerFolder}
        setIsDraggingSidebar={setIsDraggingSidebar}
        setStartSidebarY={setStartSidebarY}
        setScrollSidebarTop={setScrollSidebarTop}
      />

      <main className="flex-1 flex flex-col min-w-0 relative min-h-0 overflow-hidden">

        <TopBar
          theme={theme}
          currentView={currentView}
          gridCols={gridCols}
          setGridCols={setGridCols}
          currentUser={currentUser}
          toggleTheme={toggleTheme}
          setIsSettingsOpen={setIsSettingsOpen}
          sendCommand={sendCommand}
        />

        <div
          ref={mainScrollRef}
          className="flex-1 flex flex-col xl:flex-row p-4 md:p-6 gap-6 overflow-y-auto xl:overflow-hidden min-h-0 relative pb-20 md:pb-6 xl:h-0"
        >
          {currentView === 'player' ? (
            <>
              <div className="w-full xl:flex-1 flex flex-col xl:overflow-y-auto xl:min-h-0">
                <div className="flex flex-col gap-2 p-2 pb-0">
                  {(() => {
                    const controlledBot = systemBots.find((sb) => sb.id === playerState.botId);
                    const controlledServer = botInstances.find((b) => b.id === playerState.serverId);
                    return controlledBot && controlledServer && (
                      <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border backdrop-blur-md shadow-lg animate-in fade-in duration-500 group transition-all duration-300 self-start ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950/70' : 'border-zinc-300 bg-white/70'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border overflow-hidden shrink-0 text-xs font-black ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                          {controlledBot.avatarUrl ? <img src={controlledBot.avatarUrl} alt="" className="w-full h-full object-cover" /> : 'BOT'}
                        </div>
                        <div className="text-left flex-1 flex flex-col gap-0.5">
                          <div className="truncate max-w-[200px]">
                            <p className={`text-[8px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-green-500' : 'text-green-600'}`}>
                              {t('player.controlling')}
                            </p>
                            <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                              {controlledBot.name}
                            </p>
                          </div>
                          <div className={`mt-0.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto truncate max-w-[200px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            <div className={`w-4 h-4 rounded-md overflow-hidden shrink-0 border shadow-inner text-[6px] font-black flex items-center justify-center ${theme === 'dark' ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-300 bg-white'}`}>
                              {controlledServer.iconUrl ? <img src={controlledServer.iconUrl} alt="Icon" className="w-full h-full object-cover" /> : 'S'}
                            </div>
                            <p className="text-[9px] font-medium truncate">
                              {t('common.server')}: {controlledServer.serverName}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <OwnerBadge
                    theme={theme}
                    ownerName={playerState.ownerName}
                    ownerId={playerState.ownerId}
                    delegatedIds={playerState.delegatedUserIds}
                    currentUserId={currentUser.id}
                    isSuperadmin={isSuperadmin}
                    hasRollback={playerState.hasRollback}
                    rollbackSeconds={playerState.rollbackSecondsLeft}
                    onRollback={() => sendCommand('rollback_vote')}
                  />
                  {playerState.activeVote && (
                    <VoteBanner
                      theme={theme}
                      action={playerState.activeVote.action}
                      currentVotes={playerState.activeVote.currentVotes}
                      requiredVotes={playerState.activeVote.requiredVotes}
                      secondsRemaining={playerState.activeVote.secondsRemaining}
                      currentUserId={currentUser.id}
                      ownerId={playerState.ownerId}
                      initiatedBy={playerState.activeVote.initiatedBy}
                      isSuperadmin={isSuperadmin}
                      onVote={() => sendCommand('vote')}
                      onCancel={() => sendCommand('cancel_vote')}
                    />
                  )}
                  {!hasDirectControl && !playerState.activeVote && playerState.ownerId && (
                    <div className={`text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded-xl self-start ${theme === 'dark' ? 'text-zinc-600 bg-zinc-900/50' : 'text-zinc-400 bg-zinc-100'}`}>
                      {t('vote.noControlInfo') ?? 'Vote to skip, clear or disconnect'}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center w-full pb-8 mt-4">
                  <div className="w-64 h-64 md:w-80 md:h-80 rounded-[3.5rem] shadow-2xl mb-10 border-4 border-zinc-300 dark:border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center bg-white dark:bg-zinc-900">
                    <CoverImage url={playerState.thumbnailUrl} />
                  </div>

                  <div className={`flex flex-col items-center text-center transition-all overflow-hidden w-[calc(100%-4rem)] max-w-[42rem] ${isSmallScreen ? 'mb-6 mt-2' : 'mb-12 mt-6'}`}>
                    <div
                      ref={titleContainerRef}
                      className={`w-full overflow-hidden flex items-center ${shouldAnimateTitle ? 'justify-start' : 'justify-center'} ${isSmallScreen ? 'h-12' : 'h-16'}`}
                    >
                      <div
                        ref={titleTextRef}
                        className={`inline-block whitespace-nowrap ${shouldAnimateTitle ? 'animate-marquee-bounce px-8' : ''}`}
                        style={
                          shouldAnimateTitle
                            ? ({ '--overflow': `-${overflowAmountTitle}px`, '--duration': `${Math.max(10, playerState.trackName.length * 0.15)}s` } as React.CSSProperties)
                            : {}
                        }
                      >
                        <h2 className={`${isSmallScreen ? 'text-3xl' : 'text-5xl'} font-black text-green-500 drop-shadow-lg [-webkit-text-stroke:1.5px_rgba(0,0,0,0.8)] dark:[-webkit-text-stroke:1px_rgba(0,0,0,0.5)]`}>
                          {playerState.trackName}
                        </h2>
                      </div>
                    </div>
                    <p className={`${isSmallScreen ? 'text-sm mt-1' : 'text-xl mt-2'} font-bold text-zinc-500 uppercase tracking-widest`}>
                      {playerState.author}
                    </p>
                  </div>

                  <PlayerControls
                    theme={theme}
                    playerState={playerState}
                    activePlayerKey={activePlayerKey}
                    localProgress={localProgress}
                    localVolume={localVolume}
                    lastVolume={lastVolume}
                    setLastVolume={setLastVolume}
                    setLocalProgress={setLocalProgress}
                    setLocalVolume={setLocalVolume}
                    lastProgressSendTime={lastProgressSendTime}
                    lastVolumeSendTime={lastVolumeSendTime}
                    sendCommand={sendCommand}
                    toggleLoop={toggleLoop}
                    shufflePressed={shufflePressed}
                    setShufflePressed={setShufflePressed}
                    setCurrentView={setCurrentView}
                    onLeave={sendLeaveWithDebounce}
                  />
                </div>

              </div>

              <QueuePanel
                theme={theme}
                playerState={playerState}
                activePlayerKey={activePlayerKey}
                unifiedList={unifiedList}
                historyList={historyList}
                currentIndex={currentIndex}
                queueScrollRef={queueScrollRef}
                currentTrackRef={currentTrackRef}
                draggedIndex={draggedIndex}
                dragOverIndex={dragOverIndex}
                activeDragHandle={activeDragHandle}
                isDraggingQueue={isDraggingQueue}
                startQueueY={startQueueY}
                scrollQueueTop={scrollQueueTop}
                shufflePressed={shufflePressed}
                setShufflePressed={setShufflePressed}
                dedupPressed={dedupPressed}
                setDedupPressed={setDedupPressed}
                sortMode={sortMode}
                setSortMode={setSortMode}
                setDraggedIndex={setDraggedIndex}
                setDragOverIndex={setDragOverIndex}
                setActiveDragHandle={setActiveDragHandle}
                setIsDraggingQueue={setIsDraggingQueue}
                setStartQueueY={setStartQueueY}
                setScrollQueueTop={setScrollQueueTop}
                sendCommand={sendCommand}
              />
            </>

          ) : currentView === 'bots' ? (
            <BotSelector
              theme={theme}
              systemBots={systemBots}
              isLoadingBots={isLoadingBots}
              isSuperadmin={isSuperadmin}
              channelBotLimitInfo={channelBotLimitInfo}
              activeServerId={activeServerId}
              gridCols={gridCols}
              setGridCols={setGridCols}
              setCurrentView={setCurrentView}
              setSelectedBotIndex={setSelectedBotIndex}
              fetchChannels={fetchChannels}
            />

          ) : (
            <div className="flex-1 overflow-y-auto hide-scrollbar p-6 md:p-20 relative">
              <div className="md:hidden flex justify-center mb-8">
                <div className={`flex items-center p-2 px-6 rounded-full border gap-4 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                    Density: {gridCols}
                  </span>
                  <input
                    type="range" min="1" max="4" value={gridCols}
                    onChange={(e) => setGridCols(Number(e.target.value))}
                    className="w-24 accent-green-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid gap-16 justify-items-center w-full" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                {botInstances.map((server) => (
                  <div
                    key={server.id}
                    onClick={() => handleServerClick(server)}
                    className={`max-w-xs w-full aspect-[4/5] p-10 rounded-[4rem] border-4 flex flex-col items-center justify-center gap-8 transition-all hover:scale-[1.05] active:scale-95 overflow-hidden cursor-pointer hover:border-green-500 hover:bg-green-500/10 hover:shadow-green-500/20 shadow-2xl ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200'} ${server.isLocked ? 'border-green-500 bg-green-500/10' : ''}`}
                  >
                    <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-sm font-black shrink-0 border shadow-inner ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                      {server.iconUrl ? <img src={server.iconUrl} alt="" className="w-full h-full object-cover rounded-[2.5rem]" /> : 'SRV'}
                    </div>
                    <div className="text-center">
                      <h3 className="text-2xl font-black tracking-tight leading-tight mb-2 px-2">{server.serverName}</h3>
                      <p className={`text-[10px] font-black tracking-[0.3em] uppercase opacity-80 ${server.isLocked ? 'text-green-500' : 'text-zinc-500'}`}>
                        {server.isLocked ? t('lobby.playingMusic') : t('lobby.selectBot')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedBotIndex !== null && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-md p-8 rounded-[2rem] shadow-2xl border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black">{t('channels.selectTitle')}</h3>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{t('channels.selectSubtitle')}</p>
                </div>
                <button onClick={() => setSelectedBotIndex(null)} className="text-2xl p-2 hover:scale-110 transition opacity-50 hover:opacity-100 hover:text-red-500">✕</button>
              </div>
              <div className="max-h-64 overflow-y-auto pr-2 space-y-2 hide-scrollbar">
                {isLoadingChannels ? (
                  <div className="text-center py-8 text-zinc-500 font-bold animate-pulse">{t('channels.searching')}</div>
                ) : availableChannels.length > 0 ? (
                  availableChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => joinChannel(channel.id, selectedBotIndex)}
                      className={`w-full text-left p-4 rounded-xl font-bold transition-colors border hover:border-green-500 hover:bg-green-500/10 ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}
                    >
                      {channel.name}
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-red-500 font-bold">{t('channels.noChannels')}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentView === 'player' && (
          <button
            onClick={scrollToCurrent}
            className={`absolute bottom-24 right-4 sm:right-6 md:bottom-8 md:right-8 z-[150] w-14 h-14 border-2 rounded-full flex items-center justify-center text-xs font-black shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all active:scale-90 hover:scale-110 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700 hover:border-green-500' : 'bg-white border-zinc-300 text-black hover:bg-zinc-100 hover:border-green-500'}`}
            title={t('player.backToCurrent')}
          >
            UP
          </button>
        )}
      </main>
    </div>
  );
}

export default App;