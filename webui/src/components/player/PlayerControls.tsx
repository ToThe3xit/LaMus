import type { Dispatch, SetStateAction, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import type { Theme, PlayerState } from '../../types/player';

interface PlayerControlsProps {
  theme: Theme;
  playerState: PlayerState;
  activePlayerKey: string | null;
  localProgress: number | null;
  localVolume: number | null;
  lastVolume: number;
  setLastVolume: Dispatch<SetStateAction<number>>;
  setLocalProgress: Dispatch<SetStateAction<number | null>>;
  setLocalVolume: Dispatch<SetStateAction<number | null>>;
  lastProgressSendTime: RefObject<number>;
  lastVolumeSendTime: RefObject<number>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
  toggleLoop: () => void;
  shufflePressed: boolean;
  setShufflePressed: Dispatch<SetStateAction<boolean>>;
  setCurrentView: Dispatch<SetStateAction<'servers' | 'bots' | 'player'>>;
  onLeave: () => void;
}

const PlayerControls = ({
  theme,
  playerState,
  activePlayerKey: _activePlayerKey,
  localProgress,
  localVolume,
  lastVolume,
  setLastVolume,
  setLocalProgress,
  setLocalVolume,
  lastProgressSendTime,
  lastVolumeSendTime,
  sendCommand,
  toggleLoop,
  shufflePressed: _shufflePressed,
  setShufflePressed: _setShufflePressed,
  setCurrentView,
  onLeave,
}: PlayerControlsProps) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="w-full max-w-lg space-y-12">
        <ProgressBar
          progressPercent={playerState.progressPercent}
          durationSeconds={playerState.durationSeconds}
          localProgress={localProgress}
          lastProgressSendTime={lastProgressSendTime}
          setLocalProgress={setLocalProgress}
          sendCommand={sendCommand}
        />

        <div className="relative w-full max-w-md mx-auto flex items-center justify-center">
          <div className="flex items-center justify-center gap-4 sm:gap-6 z-10 w-full">

            <div className="w-10 sm:w-12 shrink-0 pointer-events-none opacity-0" />

            <button
              onClick={() => sendCommand('previous')}
              title={t('controls.previous')}
              className="shrink-0 text-green-500 hover:text-green-400 transition-all active:scale-95 drop-shadow-md"
            >
              <svg className="w-14 h-14 sm:w-20 sm:h-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              onClick={() => sendCommand('play_pause')}
              title={t('controls.playPause')}
              className="shrink-0 text-green-500 hover:text-green-400 flex items-center justify-center transition-all active:scale-95 drop-shadow-md"
            >
              {playerState.isPlaying ? (
                <svg className="w-20 h-20 sm:w-28 sm:h-28" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-20 h-20 sm:w-28 sm:h-28" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => sendCommand('skip')}
              title={t('controls.skip')}
              className="shrink-0 text-green-500 hover:text-green-400 transition-all active:scale-95 drop-shadow-md"
            >
              <svg className="w-14 h-14 sm:w-20 sm:h-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            <button
              onClick={toggleLoop}
              title={t('controls.loop')}
              className={`shrink-0 w-10 sm:w-12 flex items-center justify-center p-2 transition-all active:scale-95 drop-shadow-sm ${
                playerState.isLooping
                  ? 'text-green-500 hover:text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                  : 'text-zinc-400 hover:text-green-500'
              }`}
            >
              <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-md mx-auto px-4 mt-6 gap-6 sm:gap-4">
          <button
            onClick={() => {
              onLeave();
              setCurrentView('servers');
            }}
            className="py-3 px-6 sm:px-8 rounded-2xl border border-red-900/30 bg-red-950/10 text-red-500 font-black text-[10px] tracking-[0.2em] active:scale-95 transition-all hover:bg-red-900/20 shadow-lg shadow-red-900/5 whitespace-nowrap"
          >
            {t('player.leave')}
          </button>

          <VolumeControl
            theme={theme}
            volume={playerState.volume}
            localVolume={localVolume}
            lastVolume={lastVolume}
            lastVolumeSendTime={lastVolumeSendTime}
            setLocalVolume={setLocalVolume}
            setLastVolume={setLastVolume}
            sendCommand={sendCommand}
          />
        </div>
      </div>
    </>
  );
};

export default PlayerControls;