import React from 'react';

interface ProgressBarProps {
  progressPercent: number;
  durationSeconds: number;
  localProgress: number | null;
  lastProgressSendTime: React.MutableRefObject<number>;
  setLocalProgress: React.Dispatch<React.SetStateAction<number | null>>;
  sendCommand: (action: string, payload?: string, source?: string) => void;
}

const ProgressBar = ({
  progressPercent,
  durationSeconds,
  localProgress,
  lastProgressSendTime,
  setLocalProgress,
  sendCommand,
}: ProgressBarProps) => {
  return (
    <input
      type="range"
      min="0"
      max="100"
      step="0.1"
      value={localProgress !== null ? localProgress : progressPercent}
      onChange={(e) => {
        const val = Number(e.target.value);
        setLocalProgress(val);
        const now = Date.now();
        if (now - lastProgressSendTime.current > 300) {
          sendCommand(
            'seek',
            Math.floor((val / 100) * durationSeconds).toString()
          );
          lastProgressSendTime.current = now;
        }
      }}
      onMouseUp={(e) => {
        const val = Number(e.currentTarget.value);
        sendCommand(
          'seek',
          Math.floor((val / 100) * durationSeconds).toString()
        );
        setTimeout(() => setLocalProgress(null), 500);
      }}
      onTouchEnd={(e) => {
        const val = Number(e.currentTarget.value);
        sendCommand(
          'seek',
          Math.floor((val / 100) * durationSeconds).toString()
        );
        setTimeout(() => setLocalProgress(null), 500);
      }}
      className="w-full h-2.5 bg-zinc-800 rounded-full appearance-none accent-green-500 cursor-pointer hover:accent-green-400 shadow-inner"
    />
  );
};

export default ProgressBar;