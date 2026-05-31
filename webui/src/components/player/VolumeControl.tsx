import React from 'react';
import type { Theme } from '../../types/player';

interface VolumeControlProps {
  theme: Theme;
  volume: number;
  localVolume: number | null;
  lastVolume: number;
  lastVolumeSendTime: React.MutableRefObject<number>;
  setLocalVolume: React.Dispatch<React.SetStateAction<number | null>>;
  setLastVolume: React.Dispatch<React.SetStateAction<number>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const VolumeControl = ({
  theme,
  volume,
  localVolume,
  lastVolume,
  lastVolumeSendTime,
  setLocalVolume,
  setLastVolume,
  sendCommand,
}: VolumeControlProps) => {
  return (
    <div className="flex items-center justify-center gap-4 flex-1 w-full max-w-[200px] sm:max-w-none">
      <button
        onClick={() => {
          if (volume === 0) {
            sendCommand('volume', lastVolume.toString());
          } else {
            setLastVolume(volume);
            sendCommand('volume', '0');
          }
        }}
        className={`text-xs font-black transition-all ${
          volume === 0
            ? 'text-red-500'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        {volume === 0 ? 'MUTE' : 'VOL'}
      </button>

      <input
        type="range"
        min="0"
        max="100"
        value={localVolume !== null ? localVolume : volume}
        onChange={(e) => {
          const val = Number(e.target.value);
          setLocalVolume(val);
          const now = Date.now();
          if (now - lastVolumeSendTime.current > 300) {
            sendCommand('volume', val.toString());
            lastVolumeSendTime.current = now;
          }
        }}
        onMouseUp={(e) => {
          sendCommand('volume', e.currentTarget.value);
          setTimeout(() => setLocalVolume(null), 500);
        }}
        onTouchEnd={(e) => {
          sendCommand('volume', e.currentTarget.value);
          setTimeout(() => setLocalVolume(null), 500);
        }}
        className={`w-full flex-1 accent-green-500 cursor-pointer h-2 rounded-lg appearance-none ${
          theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'
        }`}
      />
    </div>
  );
};

export default VolumeControl;