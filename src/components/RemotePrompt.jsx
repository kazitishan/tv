import { useEffect, useRef, useState } from 'react';

/**
 * Startup popup with a QR code that opens the phone remote.
 * Closes when a phone connects, or with the "continue" button.
 */
export default function RemotePrompt({ onClose }) {
  const [info, setInfo] = useState(undefined); // undefined = loading, null = unavailable
  const buttonRef = useRef(null);

  useEffect(() => {
    let alive = true;
    window.tv
      ?.getRemoteInfo()
      .then((result) => alive && setInfo(result ?? null))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/70 backdrop-blur-xl">
      <div
        role="dialog"
        aria-labelledby="remote-title"
        className="flex w-[min(460px,calc(100vw-48px))] animate-rise flex-col items-center rounded-[28px] bg-neutral-900/90 px-10 pt-10 pb-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        <h2 id="remote-title" className="text-[26px] font-bold tracking-[-0.01em]">
          Use your phone as a remote
        </h2>
        <p className="mt-2 text-[15px] text-white/55">
          Scan with your phone’s camera. Your phone needs to be on the same Wi‑Fi network.
        </p>

        <div className="mt-7 grid size-60 place-items-center rounded-3xl bg-white p-3">
          {info ? (
            <img src={info.qr} alt="QR code for the phone remote" draggable={false} className="size-full" />
          ) : (
            <span className="text-sm font-medium text-neutral-500">
              {info === undefined ? 'Loading…' : 'Remote unavailable'}
            </span>
          )}
        </div>

        {info && (
          <p className="mt-5 max-w-full font-mono text-[14px] break-all text-white/80 select-text">{info.url}</p>
        )}
        {info && !info.lanAvailable && (
          <p className="mt-2 text-[13px] text-amber-400">
            This computer isn’t connected to a network, so phones can’t reach it.
          </p>
        )}

        <button
          ref={buttonRef}
          onClick={onClose}
          className="mt-7 w-full cursor-pointer rounded-2xl bg-white/10 px-5 py-3.5 text-[16px] font-semibold text-white/90 outline-none transition-colors hover:bg-white/20 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Continue without connecting controller
        </button>
      </div>
    </div>
  );
}
