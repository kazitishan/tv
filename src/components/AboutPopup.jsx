import { useCallback, useEffect, useRef, useState } from 'react';
import DrmSetup from './DrmSetup.jsx';
import Icon from './Icon.jsx';
import { PRIMARY, SECONDARY, Spinner } from './popupStyles.jsx';

const tv = window.tv;

function Row({ label, children, sub }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <span className="shrink-0 text-[16px] text-white/55">{label}</span>
      <span className="flex min-w-0 flex-col items-end text-right">
        <span className="flex min-w-0 items-center gap-2 text-[16px] font-medium text-white/90">{children}</span>
        {sub && <span className="mt-0.5 text-[13px] text-white/45">{sub}</span>}
      </span>
    </div>
  );
}

const SMALL_BUTTON =
  'cursor-pointer rounded-xl bg-white px-4 py-2 text-[15px] font-semibold text-black outline-none transition-colors hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-default disabled:opacity-50';

// Why DRM video may still not play although the app is signed.
const WIDEVINE_NOTES = {
  loading: 'Widevine is still downloading.',
  failed: 'Widevine didn’t load. Check the terminal for errors.',
  unavailable: 'This Electron build has no Widevine. Run npm install again.',
};

/**
 * Opened from the gear menu. Shows the app's version, the Wi-Fi network in use,
 * whether DRM video is set up (with a Set up button that walks through it), and
 * the ad blocker and Electron versions.
 */
export default function AboutPopup({ onClose }) {
  const [info, setInfo] = useState(null);
  const [wifi, setWifi] = useState(undefined); // undefined while loading, then { name }
  const [drm, setDrm] = useState(null);
  const [settingUp, setSettingUp] = useState(false);
  const [restart, setRestart] = useState(null); // null | 'restarting' | 'manual'
  const alive = useRef(true);

  const loadDrm = useCallback(() => {
    tv.getDrmStatus()
      .then((status) => alive.current && setDrm(status))
      .catch(() => alive.current && setDrm({ error: true }));
  }, []);

  useEffect(() => {
    alive.current = true;
    tv.getAppInfo().then((i) => alive.current && setInfo(i)).catch(() => {});
    tv.getWifi()
      .then((w) => alive.current && setWifi(w ?? { name: null }))
      .catch(() => alive.current && setWifi({ name: null }));
    loadDrm();
    return () => {
      alive.current = false;
    };
  }, [loadDrm]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !settingUp && restart !== 'restarting') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingUp, restart, onClose]);

  const restartNow = async () => {
    const ok = await tv.drm.restart().catch(() => false);
    if (alive.current) setRestart(ok ? 'restarting' : 'manual');
    // Otherwise the remote server turns the app off and on in a moment.
  };

  let drmValue;
  let drmSub = null;
  if (!drm) {
    drmValue = <Spinner className="size-4 border-2" />;
  } else if (drm.error) {
    drmValue = <span className="text-white/55">Couldn’t check</span>;
  } else if (drm.needsRestart) {
    drmValue =
      restart === 'restarting' ? (
        <>
          <Spinner className="size-4 border-2" />
          Restarting…
        </>
      ) : (
        <button onClick={restartNow} className={SMALL_BUTTON}>
          Restart to finish
        </button>
      );
    if (restart === 'manual') drmSub = 'Quit the TV and start it again (npm start).';
  } else if (drm.signed) {
    drmValue = (
      <>
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-green-400/15 text-green-400">
          <Icon name="check" className="size-4" />
        </span>
        Set up
      </>
    );
    drmSub = WIDEVINE_NOTES[drm.widevine] ?? (drm.daysLeft != null ? `Signature valid for ${drm.daysLeft} more days` : null);
  } else {
    drmValue = (
      <button onClick={() => setSettingUp(true)} className={SMALL_BUTTON}>
        Set up
      </button>
    );
    drmSub = 'Needed for Netflix, Prime Video, Disney+ and others';
  }

  const version = info ? [info.version, info.commit && `(${info.commit}${info.date ? `, ${info.date}` : ''})`].filter(Boolean).join(' ') : '…';

  return (
    <div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-black/70 backdrop-blur-xl">
      <div
        role="dialog"
        aria-labelledby={settingUp ? 'drm-title' : 'about-title'}
        className="flex max-h-[calc(100vh-48px)] w-[min(540px,calc(100vw-48px))] animate-rise flex-col overflow-y-auto rounded-[28px] bg-neutral-900/90 px-9 pt-9 pb-8 shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]"
      >
        {settingUp ? (
          <DrmSetup
            status={drm}
            onDone={() => {
              setSettingUp(false);
              setDrm(null);
              loadDrm();
            }}
          />
        ) : (
          <>
            <h2 id="about-title" className="text-[26px] font-bold tracking-[-0.01em]">
              About
            </h2>
            <p className="mt-1 text-[15px] text-white/55">TV {version}</p>

            <div className="mt-6 divide-y divide-white/6 rounded-2xl bg-white/5">
              <Row label="Wi-Fi">
                {wifi === undefined ? (
                  <Spinner className="size-4 border-2" />
                ) : wifi.name ? (
                  <span className="truncate">{wifi.name}</span>
                ) : (
                  <span className="text-white/55">Not connected</span>
                )}
              </Row>
              <Row label="DRM video" sub={drmSub}>
                {drmValue}
              </Row>
              <Row label="Ad blocker">
                {info ? (info.ublock ? `uBlock Origin ${info.ublock}` : <span className="text-white/55">Not installed</span>) : '…'}
              </Row>
              <Row label="Electron">{info?.electron ?? '…'}</Row>
            </div>

            <div className="mt-7">
              <button autoFocus onClick={onClose} className={drm?.needsRestart ? SECONDARY : PRIMARY}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
