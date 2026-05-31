import React, { useRef, useEffect, useState } from 'react';
import type { Theme } from '../../types/player';

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

      if (tW > cW) {
        setShouldAnimate(true);
        setOverflowAmount(tW - cW);
      } else {
        setShouldAnimate(false);
        setOverflowAmount(0);
      }
    };

    const timer = setTimeout(checkWidth, 150);

    window.addEventListener('resize', checkWidth);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkWidth);
    };
  }, [title]);

  const duration = Math.max(8, title.length * 0.15);

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden pointer-events-none">
      <div
        ref={textRef}
        className={`inline-block whitespace-nowrap font-bold text-sm ${
          shouldAnimate ? 'animate-marquee-bounce pr-4' : 'truncate'
        } ${theme === 'dark' ? 'text-white' : 'text-black'}`}
        style={
          shouldAnimate
            ? ({
                '--overflow': `-${overflowAmount}px`,
                '--duration': `${duration}s`,
              } as React.CSSProperties)
            : {}
        }
      >
        {title}
      </div>
    </div>
  );
};

export default QueueItemText;