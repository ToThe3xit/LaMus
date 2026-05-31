import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../../assets/logo.png';
import type { Theme, PlayerState } from '../../types/player';
import type { BotInstance, SystemBot } from '../../types/bot';

interface SidebarProps {
  theme: Theme;
  currentView: 'servers' | 'bots' | 'player';
  isSuperadmin: boolean;
  botInstances: BotInstance[];
  systemBots: SystemBot[];
  activePlayers: Record<string, PlayerState>;
  playersByServer: Record<string, { key: string; state: PlayerState }[]>;
  activePlayerKey: string | null;
  activeServerId: string | null;
  openServerFolder: string | null;
  sidebarScrollRef: React.RefObject<HTMLElement | null>;
  isDraggingSidebar: boolean;
  startSidebarY: number;
  scrollSidebarTop: number;
  setCurrentView: Dispatch<SetStateAction<'servers' | 'bots' | 'player'>>;
  setActivePlayerKey: Dispatch<SetStateAction<string | null>>;
  setActiveServerId: Dispatch<SetStateAction<string | null>>;
  setOpenServerFolder: Dispatch<SetStateAction<string | null>>;
  setIsDraggingSidebar: Dispatch<SetStateAction<boolean>>;
  setStartSidebarY: Dispatch<SetStateAction<number>>;
  setScrollSidebarTop: Dispatch<SetStateAction<number>>;
}

const Sidebar = ({
  theme,
  currentView,
  isSuperadmin,
  botInstances,
  systemBots,
  activePlayers,
  playersByServer,
  activePlayerKey,
  openServerFolder,
  sidebarScrollRef,
  isDraggingSidebar,
  startSidebarY,
  scrollSidebarTop,
  setCurrentView,
  setActivePlayerKey,
  setActiveServerId,
  setOpenServerFolder,
  setIsDraggingSidebar,
  setStartSidebarY,
  setScrollSidebarTop,
}: SidebarProps) => {
  const { t } = useTranslation();

  return (
    <aside className={`fixed bottom-0 left-0 w-full h-20 md:static md:w-64 md:h-full flex flex-row md:flex-col border-t md:border-t-0 md:border-r z-[100] shrink-0 ${
      theme === 'dark' ? 'bg-zinc-950 border-zinc-900' : 'bg-zinc-50 border-zinc-200'
    }`}>
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
        ref={sidebarScrollRef as React.RefObject<HTMLElement>}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          setIsDraggingSidebar(true);
          setStartSidebarY(e.pageY - ((sidebarScrollRef.current as HTMLElement)?.offsetTop || 0));
          setScrollSidebarTop((sidebarScrollRef.current as HTMLElement)?.scrollTop || 0);
        }}
        onMouseUp={() => setIsDraggingSidebar(false)}
        onMouseLeave={() => setIsDraggingSidebar(false)}
        onMouseMove={(e) => {
          if (!isDraggingSidebar || !sidebarScrollRef.current) return;
          e.preventDefault();
          const el = sidebarScrollRef.current as HTMLElement;
          const walk = (e.pageY - (el.offsetTop || 0) - startSidebarY) * 1.5;
          el.scrollTop = scrollSidebarTop - walk;
        }}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          setIsDraggingSidebar(true);
          setStartSidebarY(e.touches[0].pageY - ((sidebarScrollRef.current as HTMLElement)?.offsetTop || 0));
          setScrollSidebarTop((sidebarScrollRef.current as HTMLElement)?.scrollTop || 0);
        }}
        onTouchEnd={() => setIsDraggingSidebar(false)}
        onTouchMove={(e) => {
          if (!isDraggingSidebar || !sidebarScrollRef.current) return;
          const el = sidebarScrollRef.current as HTMLElement;
          const walk = (e.touches[0].pageY - (el.offsetTop || 0) - startSidebarY) * 1.5;
          el.scrollTop = scrollSidebarTop - walk;
        }}
        className={`flex-1 px-4 flex flex-row md:flex-col items-center md:items-stretch space-x-3 md:space-x-0 md:space-y-4 overflow-x-auto md:overflow-y-auto hide-scrollbar pb-0 md:pb-8 pt-0 md:pt-2 ${
          isDraggingSidebar ? 'cursor-grabbing' : 'cursor-default'
        }`}
      >
        <button
          onClick={() => setCurrentView('servers')}
          className={`w-full py-4 rounded-3xl flex items-center justify-center md:px-6 transition-all active:scale-95 border-2 ${
            currentView === 'servers'
              ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
              : theme === 'dark'
              ? 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              : 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
          }`}
        >
          <span className="text-sm uppercase font-black tracking-widest drop-shadow-sm">🏠</span>
          <span className="ml-4 hidden md:inline font-bold">{t('sidebar.lobby')}</span>
        </button>

        <div className="pt-0 md:pt-6 border-l md:border-l-0 border-t-0 md:border-t border-zinc-800/50 flex flex-row md:flex-col items-center md:items-stretch pl-4 md:pl-0 h-full md:h-auto">
          <p className="hidden md:block text-[10px] font-black uppercase text-zinc-500 mb-4 px-2 tracking-widest text-left">
            {t('sidebar.instances')}
          </p>

          {isSuperadmin ? (
            Object.entries(playersByServer)
              .sort(([idA], [idB]) => idA.localeCompare(idB))
              .map(([srvId, players]) => {
                const serverInfo = botInstances.find((b) => b.id === srvId);
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
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden text-sm font-black shadow-inner border transition-colors ${
                        theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-300'
                      }`}>
                        {serverInfo?.iconUrl
                          ? <img src={serverInfo.iconUrl} alt="Icon" className="w-full h-full object-cover" />
                          : 'SRV'}
                      </div>
                      <div className="hidden md:block text-left truncate flex-1">
                        <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                          {serverInfo?.serverName || t('common.server')}
                        </p>
                        <p className="text-[9px] text-green-500 font-black tracking-wider uppercase">
                          {t('sidebar.bots')}: {players.length}
                        </p>
                      </div>
                    </button>

                    {isFolderOpen && (
                      <div
                        className={`fixed left-24 md:left-64 top-1/2 -translate-y-1/2 ml-4 p-6 rounded-3xl shadow-[20px_20px_60px_rgba(0,0,0,0.4)] z-[9999] animate-in slide-in-from-left-4 duration-200 cursor-default flex flex-col w-max max-w-[calc(100vw-8rem)] md:max-w-[calc(100vw-18rem)] max-h-[90vh] overflow-y-auto border ${
                          theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={`flex justify-between items-center mb-6 gap-8 border-b pb-4 shrink-0 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                          <div>
                            <h3 className={`text-xl font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                              {t('sidebar.activeInstances')}
                            </h3>
                            <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">
                              {t('sidebar.server')}: {serverInfo?.serverName || t('common.server')}
                            </p>
                          </div>
                          <button
                            onClick={() => setOpenServerFolder(null)}
                            className="text-zinc-500 hover:text-red-500 text-2xl transition-transform hover:rotate-90"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-4 content-start">
                          {players
                            .sort((a, b) => a.key.localeCompare(b.key))
                            .map((p) => {
                              const botInfo = systemBots.find((sb) => sb.id === p.state.botId);
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
                                      : `hover:bg-green-500/10 hover:border-green-500 ${
                                          theme === 'dark'
                                            ? 'border-zinc-800 bg-zinc-950 text-zinc-400'
                                            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                                        }`
                                  }`}
                                >
                                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-sm font-black mb-3 overflow-hidden shadow-inner shrink-0 border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}>
                                    {botInfo?.avatarUrl
                                      ? <img src={botInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                      : t('common.bot')}
                                  </div>
                                  <span className={`text-[10px] font-black uppercase truncate w-full text-center px-1 ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                                    {botInfo?.name || `Bot #${p.state.botId}`}
                                  </span>
                                  <span className="text-[8px] font-bold text-green-500 mt-1 uppercase tracking-widest bg-green-500/10 px-2 py-0.5 rounded-full">
                                    {t('sidebar.active')}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          ) : (
            Object.entries(activePlayers).map(([key, state]) => {
              const botInfo = systemBots.find((sb) => sb.id === state.botId);
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
                      : `hover:border-green-500 hover:bg-green-500/10 ${
                          theme === 'dark'
                            ? 'border-zinc-800 bg-zinc-900/50'
                            : 'border-zinc-200 bg-white shadow-sm'
                        }`
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl overflow-hidden border shrink-0 shadow-md flex items-center justify-center text-sm font-black ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-300 bg-white'}`}>
                    {botInfo?.avatarUrl
                      ? <img src={botInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      : t('common.bot')}
                  </div>
                  <div className="text-left hidden md:block truncate flex-1">
                    <p className={`text-[11px] font-black truncate leading-tight ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                      {botInfo?.name || `Instance #${state.botId}`}
                    </p>
                    <p className="text-[9px] text-green-500 font-bold uppercase tracking-tighter mt-0.5">
                      {t('sidebar.yourInstance')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;