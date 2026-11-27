import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { PRIMARY, SECONDARY, Spinner } from './popupStyles.jsx';

const tv = window.tv;

const INPUT =
  'h-13 w-full rounded-2xl bg-black/40 px-4 text-[17px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/35 disabled:opacity-50';

// A castLabs account name suggested from the email address, until the field is edited.
const accountNameFromEmail = (email) =>
  email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');

function Field({ label, hint, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-white/55">{label}</span>
      <input className={INPUT} autoComplete="off" spellCheck={false} {...props} />
      {hint && <span className="text-[12px] text-white/40">{hint}</span>}
    </label>
  );
}

function PasswordField({ label, value, onChange, disabled, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-white/55">{label}</span>
      <span className="relative">
        <input
          className={`${INPUT} pr-20`}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-xl px-3 py-1.5 text-[14px] font-semibold text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:bg-white/10"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}

/**
 * A form whose Enter key fills it in order: it moves to the first empty field,
 * and submits once all are filled. With the phone remote, each Enter closes the
 * phone keyboard, so this makes "type, Enter, type, Enter" work. While `busy`
 * its fields are disabled, which takes focus away; afterwards (say, a wrong
 * code) the last field gets it back, so the phone keyboard can open again.
 */
function Form({ onSubmit, busy, children, className }) {
  const ref = useRef(null);
  const lastField = useRef(null);
  useEffect(() => {
    const field = lastField.current;
    if (!busy && field?.isConnected && !field.disabled && document.activeElement !== field) field.focus();
  }, [busy]);
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const empty = [...ref.current.querySelectorAll('input')].find((input) => !input.value && !input.disabled);
    if (empty) {
      e.preventDefault();
      empty.focus();
    }
  };
  return (
    <form
      ref={ref}
      className={className}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target.tagName === 'INPUT') lastField.current = e.target;
      }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function ErrorText({ message }) {
  return message ? <p className="text-[14px] text-amber-400">{message}</p> : null;
}

function Buttons({ children }) {
  return <div className="mt-2 grid grid-cols-2 gap-3">{children}</div>;
}

/**
 * Sets up DRM video from the About popup: installs castLabs' tool if needed,
 * creates a castLabs account (or signs in), confirms it with the emailed code,
 * and signs the app. The same as the README's `npm run evs:setup`, `evs:signup`
 * and `sign:vmp`. `status` is from tv.getDrmStatus(); `onDone(signed)` returns to
 * the About page (true once the app is signed, so it shows "Restart").
 */
export default function DrmSetup({ status, onDone }) {
  // 'working' | 'failed' | 'choose' | 'signup' | 'code' | 'signin' | 'done' | 'already'
  const [step, setStep] = useState('working');
  const [working, setWorking] = useState('Getting ready…');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null); // a note, like "We sent a new code"
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    accountName: status.accountName ?? '',
    password: '',
    code: '',
  });
  const [accountNameEdited, setAccountNameEdited] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const set = (key) => (e) => {
    const value = e.target.value;
    setDetails((d) => {
      const next = { ...d, [key]: value };
      if (key === 'email' && !accountNameEdited) next.accountName = accountNameFromEmail(value);
      return next;
    });
    if (key === 'accountName') setAccountNameEdited(true);
  };

  /** Runs a step with a spinner page (or `busy` on the form). Resolves to its result. */
  const run = async (fn, message) => {
    setError(null);
    setInfo(null);
    if (message) {
      setWorking(message);
      setStep('working');
    }
    setBusy(true);
    const result = await fn().catch(() => ({ ok: false, error: 'Something went wrong. Try again.' }));
    if (alive.current) setBusy(false);
    return alive.current ? result : null;
  };

  const sign = async (backTo) => {
    const result = await run(() => tv.drm.sign(), 'Signing the app…');
    if (!result) return;
    if (result.ok) setStep(result.alreadySigned ? 'already' : 'done');
    else if (result.needsSignIn) setStep('choose');
    else {
      setError(result.error);
      setStep(backTo);
    }
  };

  // Start: install the tool if needed (then check again: the signature can only
  // be checked with it, and may be fine already), then sign with a saved
  // sign-in if there is one.
  useEffect(() => {
    (async () => {
      let { accountName } = status;
      if (!status.toolInstalled) {
        const result = await run(() => tv.drm.installTool(), 'Installing castLabs’ tool…');
        if (!result) return;
        if (!result.ok) {
          setError(result.error);
          setStep('failed');
          return;
        }
        const fresh = await run(() => tv.getDrmStatus(), 'Checking the app…');
        if (!fresh) return;
        if (fresh.signed) {
          setStep('already');
          return;
        }
        accountName = fresh.accountName;
        if (accountName) setDetails((d) => ({ ...d, accountName }));
      }
      if (accountName) sign('choose');
      else setStep('choose');
    })();
    // Runs once, when setup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async () => {
    const { firstName, lastName, email, accountName, password } = details;
    const result = await run(() => tv.drm.signUp({ firstName, lastName, email, accountName, password }));
    if (!result) return;
    if (result.ok) {
      setDetails((d) => ({ ...d, code: '' }));
      setStep('code');
    } else setError(result.error);
  };

  const confirm = async () => {
    const { accountName, password, code } = details;
    const result = await run(() => tv.drm.confirm({ accountName, password, code: code.trim() }));
    if (!result) return;
    if (result.ok) sign('code');
    else setError(result.error);
  };

  const resend = async () => {
    const result = await run(() => tv.drm.resendCode({ accountName: details.accountName }));
    if (!result) return;
    if (result.ok) setInfo('A new code is on its way.');
    else setError(result.error);
  };

  const signIn = async () => {
    const { accountName, password } = details;
    const result = await run(() => tv.drm.signIn({ accountName, password }));
    if (!result) return;
    if (result.ok) sign('signin');
    else if (result.code === 'UserNotConfirmedException') {
      // Signed up before but never entered the code.
      setDetails((d) => ({ ...d, code: '' }));
      setInfo('This account isn’t confirmed yet. Enter the code castLabs emailed you, or send a new one.');
      setStep('code');
    } else setError(result.error);
  };

  const back = (to) => () => {
    setError(null);
    setInfo(null);
    setStep(to);
  };

  // Esc goes back a step, or closes setup. (The About popup ignores Esc while setup is open.)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || busy || step === 'working') return;
      if (step === 'signup' || step === 'signin') back('choose')();
      else if (step === 'code') back('signup')();
      else onDone(step === 'done');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const title = (text, sub) => (
    <div className="mb-6">
      <h2 id="drm-title" className="text-[26px] font-bold tracking-[-0.01em]">
        {text}
      </h2>
      {sub && <p className="mt-2 text-[15px] leading-snug text-white/55">{sub}</p>}
    </div>
  );

  if (step === 'working') {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <Spinner />
        <h2 id="drm-title" className="mt-6 text-[22px] font-bold">
          {working}
        </h2>
        {working.startsWith('Signing') && (
          <p className="mt-2 text-[15px] text-white/55">This uploads part of the app to castLabs and can take a minute.</p>
        )}
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <>
        {title('Couldn’t set up DRM video')}
        <ErrorText message={error} />
        <div className="mt-7">
          <button autoFocus onClick={() => onDone(false)} className={SECONDARY}>
            Back
          </button>
        </div>
      </>
    );
  }

  if (step === 'done' || step === 'already') {
    const already = step === 'already';
    return (
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-green-400/15 text-green-400">
          <Icon name="check" className="size-7" />
        </span>
        <h2 id="drm-title" className="mt-5 text-[26px] font-bold tracking-[-0.01em]">
          {already ? 'DRM video was already set up' : 'DRM video is set up'}
        </h2>
        <p className="mt-2 text-[15px] text-white/55">
          {already ? 'This app already has a valid signature.' : 'Restart the TV to start using it.'}
        </p>
        <div className="mt-7 w-full">
          <button autoFocus onClick={() => onDone(true)} className={PRIMARY}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === 'choose') {
    return (
      <>
        {title(
          'Set up DRM video',
          'Netflix, Prime Video, Disney+ and similar services need this to play video. It uses a free castLabs account to sign this app for Widevine.'
        )}
        <ErrorText message={error} />
        <div className="mt-2 flex flex-col gap-3">
          <button data-opens-keyboard autoFocus onClick={back('signup')} className={PRIMARY}>
            Create a castLabs account
          </button>
          <button data-opens-keyboard onClick={back('signin')} className={SECONDARY}>
            I already have an account
          </button>
          <button onClick={() => onDone(false)} className={SECONDARY}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  if (step === 'signup') {
    const { firstName, lastName, email, accountName, password } = details;
    const complete = firstName && lastName && email.includes('@') && accountName && password.length >= 8;
    return (
      <>
        {title('Create a castLabs account', 'castLabs will email you a code to confirm it.')}
        <Form busy={busy} onSubmit={() => complete && signUp()} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={set('firstName')} disabled={busy} autoFocus />
            <Field label="Last name" value={lastName} onChange={set('lastName')} disabled={busy} />
          </div>
          <Field label="Email" type="email" value={email} onChange={set('email')} disabled={busy} />
          <Field
            label="Account name"
            hint="What you sign in with. Suggested from your email."
            value={accountName}
            onChange={set('accountName')}
            disabled={busy}
          />
          <PasswordField label="Password (at least 8 characters)" value={password} onChange={set('password')} disabled={busy} />
          <ErrorText message={error} />
          <Buttons>
            <button type="button" onClick={back('choose')} disabled={busy} className={SECONDARY}>
              Back
            </button>
            <button type="submit" disabled={busy || !complete} className={`${PRIMARY} flex items-center justify-center gap-2`}>
              {busy && <Spinner className="size-4 border-2" dark />}
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </Buttons>
        </Form>
      </>
    );
  }

  if (step === 'code') {
    return (
      <>
        {title(
          'Enter the code',
          details.email ? `castLabs sent a code to ${details.email}.` : 'castLabs emailed you a code when you signed up.'
        )}
        <Form busy={busy} onSubmit={() => details.code.trim() && confirm()} className="flex flex-col gap-4">
          <Field
            label="Verification code"
            inputMode="numeric"
            value={details.code}
            onChange={(e) => setDetails((d) => ({ ...d, code: e.target.value.replace(/\D/g, '') }))}
            maxLength={10}
            disabled={busy}
            autoFocus
          />
          {info && <p className="text-[14px] text-white/55">{info}</p>}
          <ErrorText message={error} />
          <Buttons>
            <button type="button" onClick={resend} disabled={busy} className={SECONDARY}>
              Send a new code
            </button>
            <button
              type="submit"
              disabled={busy || !details.code.trim()}
              className={`${PRIMARY} flex items-center justify-center gap-2`}
            >
              {busy && <Spinner className="size-4 border-2" dark />}
              {busy ? 'Confirming…' : 'Confirm'}
            </button>
          </Buttons>
        </Form>
      </>
    );
  }

  // 'signin'
  const { accountName, password } = details;
  return (
    <>
      {title('Sign in to castLabs')}
      <Form busy={busy} onSubmit={() => accountName && password && signIn()} className="flex flex-col gap-4">
        <Field label="Account name" value={accountName} onChange={set('accountName')} disabled={busy} autoFocus={!accountName} />
        <PasswordField label="Password" value={password} onChange={set('password')} disabled={busy} autoFocus={Boolean(accountName)} />
        <ErrorText message={error} />
        <Buttons>
          <button type="button" onClick={back('choose')} disabled={busy} className={SECONDARY}>
            Back
          </button>
          <button type="submit" disabled={busy || !accountName || !password} className={`${PRIMARY} flex items-center justify-center gap-2`}>
            {busy && <Spinner className="size-4 border-2" dark />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </Buttons>
      </Form>
    </>
  );
}
