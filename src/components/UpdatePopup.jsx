import { useCallback, useEffect, useState } from 'react';

// The update turns this app off within seconds; if it's still here, it didn't start.
const INSTALL_TIMEOUT_MS = 20_000;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const PRIMARY =
  'w-full cursor-pointer rounded-2xl bg-white px-5 py-3.5 text-[16px] font-semibold text-black outline-none transition-colors hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900';
const SECONDARY =
  'w-full cursor-pointer rounded-2xl bg-white/10 px-5 py-3.5 text-[16px] font-semibold text-white/90 outline-none transition-colors hover:bg-white/20 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40';

function Spinner() {
  return <span aria-hidden className="size-9 animate-spin rounded-full border-[3px] border-white/15 border-t-white/80" />;
}

function Check() {
  return (
    <span aria-hidden className="grid size-14 place-items-center rounded-full bg-green-400/15 text-green-400">
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17.5 19 7" />
      </svg>
    </span>
  );
}

/**
 * Opened by the gear button. Checks GitHub for new commits and a newer uBlock
 * Origin; if there are any, "Update and restart" has the remote server turn the
 * TV off, install them and turn it back on.
 */
export default function UpdatePopup({ onClose }) {
  // 'checking' | 'done' (result set) | 'installing'
  const [phase, setPhase] = useState('checking');
  const [result, setResult] = useState(null);
  const [installError, setInstallError] = useState(null);

  const check = useCallback(() => {
    setPhase('checking');
    setInstallError(null);
    let alive = true;
    window.tv
      .checkForUpdates()
      .then((r) => alive && (setResult(r), setPhase('done')))
      .catch(() => alive && (setResult({ app: { error: 'Couldn’t check for updates.' }, ublock: null }), setPhase('done')));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(check, [check]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && phase !== 'installing') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, onClose]);

  useEffect(() => {
    if (phase !== 'installing') return;
    const timer = setTimeout(() => {
      setInstallError('The update didn’t start. Check the terminal for errors.');
      setPhase('done');
    }, INSTALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const install = async () => {
    setPhase('installing');
    const started = await window.tv.installUpdates().catch(() => false);
    if (!started) {
      setInstallError('Can’t reach the remote server. Restart the TV from the terminal, then try again.');
      setPhase('done');
    }
    // Otherwise the server turns this app off in a moment.
  };

  const app = result?.app;
  const ublock = result?.ublock;
  const appUpdate = app?.behind > 0;
  const ublockUpdate = Boolean(ublock?.available);
  const anyUpdate = appUpdate || ublockUpdate;

  let body;
  if (phase === 'checking') {
    body = (
      <>
        <Spinner />
        <h2 id="update-title" className="mt-6 text-[22px] font-bold">Checking for updates…</h2>
      </>
    );
  } else if (phase === 'installing') {
    body = (
      <>
        <Spinner />
        <h2 id="update-title" className="mt-6 text-[22px] font-bold">Updating…</h2>
        <p className="mt-2 text-[15px] text-white/55">
          The TV will turn off, update and turn back on by itself. This can take a minute or two.
        </p>
      </>
    );
  } else if (!anyUpdate && !app?.error) {
    body = (
      <>
        <Check />
        <h2 id="update-title" className="mt-5 text-[26px] font-bold tracking-[-0.01em]">Up to date</h2>
        {ublock && <p className="mt-2 text-[15px] text-white/55">uBlock Origin {ublock.installed}</p>}
      </>
    );
  } else {
    body = (
      <>
        <h2 id="update-title" className="text-[26px] font-bold tracking-[-0.01em]">
          {anyUpdate ? 'Update available' : 'Couldn’t check for updates'}
        </h2>
        <div className="mt-5 flex w-full flex-col gap-3 text-left">
          {appUpdate && (
            <div className="rounded-2xl bg-white/6 px-5 py-4">
              <p className="text-[16px] font-semibold">TV app: {plural(app.behind, 'new change')}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-white/60">
                {app.commits.map((subject, i) => (
                  <li key={i} className="line-clamp-2">• {subject}</li>
                ))}
                {app.behind > app.commits.length && (
                  <li>and {plural(app.behind - app.commits.length, 'more')}</li>
                )}
              </ul>
            </div>
          )}
          {ublockUpdate && (
            <div className="rounded-2xl bg-white/6 px-5 py-4">
              <p className="text-[16px] font-semibold">
                uBlock Origin {ublock.installed ? `${ublock.installed} → ${ublock.latest}` : `${ublock.latest} (not installed)`}
              </p>
            </div>
          )}
          {app?.error && <p className="px-1 text-[14px] text-amber-400">{app.error}</p>}
        </div>
      </>
    );
  }

  const lastError = result?.lastError;
  const error = installError ?? (phase === 'done' && lastError ? `The last update didn’t finish: ${lastError}` : null);
  const canInstall = anyUpdate && result?.canInstall;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/70 backdrop-blur-xl">
      <div
        role="dialog"
        aria-labelledby="update-title"
        aria-busy={phase !== 'done'}
        className="flex max-h-[calc(100vh-48px)] w-[min(480px,calc(100vw-48px))] animate-rise flex-col items-center overflow-y-auto rounded-[28px] bg-neutral-900/90 px-10 pt-10 pb-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        {body}

        {error && <p className="mt-4 text-[14px] text-amber-400">{error}</p>}
        {phase === 'done' && anyUpdate && !result.canInstall && (
          <p className="mt-4 text-[14px] text-white/55">
            To update from here, restart the TV from the terminal: press Ctrl+C, then run npm start or
            npm run dev again.
          </p>
        )}

        {phase === 'done' && (
          <div className="mt-7 flex w-full flex-col gap-3">
            {canInstall && (
              <button autoFocus onClick={install} className={PRIMARY}>
                Update and restart
              </button>
            )}
            {!anyUpdate && app?.error && (
              <button autoFocus onClick={check} className={SECONDARY}>
                Try again
              </button>
            )}
            <button autoFocus={!canInstall && !(!anyUpdate && app?.error)} onClick={onClose} className={SECONDARY}>
              {anyUpdate ? 'Not now' : 'Close'}
            </button>
          </div>
        )}
        {phase === 'checking' && (
          <button onClick={onClose} className={`${SECONDARY} mt-7`}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
