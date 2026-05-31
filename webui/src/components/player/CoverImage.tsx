import { useState, useEffect } from 'react';

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

  if (!currentUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm font-black text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/10">
        NO COVER
      </div>
    );
  }

  return (
    <img
      src={currentUrl}
      alt="Cover"
      className="w-full h-full object-cover animate-in fade-in duration-500"
      onError={handleError}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 120) {
          handleError();
        }
      }}
    />
  );
};

export default CoverImage;