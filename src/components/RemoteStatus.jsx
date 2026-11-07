import { useEffect, useState } from 'react';

const LABEL_MS = 3000;

/**
 * Green dot in the top bar while a phone remote is connected. Clicking it
 * slides out a "Remote control connected" label, which hides again on its own.
 * The label stays inside the top bar, so it's visible over open websites too.
 */
export default function RemoteStatus() {
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    if (!showLabel) return;
    const timer = setTimeout(() => setShowLabel(false), LABEL_MS);
    return () => clearTimeout(timer);
  }, [showLabel]);

  return (
    <button
      onClick={() => setShowLabel((shown) => !shown)}
      aria-label="Remote control connected"
      title="Remote control connected"
      className={`app-no-drag flex h-9 cursor-pointer items-center rounded-full px-3 transition-colors duration-300 ease-tv ${showLabel ? 'bg-white/10' : 'hover:bg-white/10'}`}
    >
      <span
        aria-hidden
        className={`overflow-hidden text-[14px] font-medium whitespace-nowrap text-white/90 transition-[max-width,opacity,margin] duration-300 ease-tv ${showLabel ? 'mr-2.5 max-w-60 opacity-100' : 'mr-0 max-w-0 opacity-0'}`}
      >
        Remote control connected
      </span>
      <span className="relative flex size-2.5" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-40 [animation-duration:2.5s]" />
        <span className="relative size-2.5 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" />
      </span>
    </button>
  );
}
