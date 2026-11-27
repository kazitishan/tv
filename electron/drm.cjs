// DRM video setup for the About popup: the same steps as `npm run evs:setup`,
// `evs:signup` and `sign:vmp` in the README, without a terminal.
//
// Streaming services only play DRM video in an Electron build whose framework
// is signed for Widevine VMP by castLabs' free EVS service. That needs a castLabs
// account and their Python tool (castlabs-evs), installed in .venv-evs.
// evs-helper.py does the EVS calls, reading its input as JSON on stdin so
// passwords stay out of the process list.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const VENV = path.join(ROOT, '.venv-evs');
const VENV_PYTHON = path.join(VENV, isWindows ? 'Scripts/python.exe' : 'bin/python');
const HELPER = path.join(__dirname, 'evs-helper.py');
// The Electron build that's signed (same as `npm run sign:vmp`).
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');

const HELPER_TIMEOUT_MS = 60_000;
const SIGN_TIMEOUT_MS = 10 * 60_000; // uploads the Electron framework (~200 MB)
const INSTALL_TIMEOUT_MS = 5 * 60_000;

const toolInstalled = () => fs.existsSync(VENV_PYTHON);

/** Runs evs-helper.py with one request. Resolves to its reply ({ ok, ... }). */
function helper(request, timeout = HELPER_TIMEOUT_MS) {
  return new Promise((resolve) => {
    // -I: ignore the environment and the current folder when importing.
    const child = spawn(VENV_PYTHON, ['-I', HELPER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 'SpawnError', message: err.message });
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()));
      } catch {
        resolve({ ok: false, code: 'NoReply', message: 'The castLabs tool stopped without an answer.' });
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

// Messages for the person at the TV instead of AWS Cognito's own.
const MESSAGES = {
  UsernameExistsException: 'That account name is taken. Pick another one, or sign in if it’s yours.',
  CodeMismatchException: 'That code isn’t right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Send a new one.',
  NotAuthorizedException: 'Wrong account name or password.',
  UserNotFoundException: 'There’s no castLabs account with that name.',
  LimitExceededException: 'Too many tries. Wait a few minutes, then try again.',
  TooManyRequestsException: 'Too many tries. Wait a few minutes, then try again.',
  TooManyFailedAttemptsException: 'Too many tries. Wait a few minutes, then try again.',
  EndpointConnectionError: 'Can’t reach castLabs. Check the internet connection.',
  ConnectTimeoutError: 'Can’t reach castLabs. Check the internet connection.',
  ReadTimeoutError: 'castLabs took too long to answer. Try again.',
};

/** { ok: true } or { ok: false, code, error } with a message for the screen. */
function result(reply, fallback) {
  if (reply.ok) return { ok: true };
  console.error(`DRM setup: ${reply.code}: ${reply.message}`);
  let error = MESSAGES[reply.code];
  // Cognito explains bad passwords and fields itself ("Password must have uppercase characters").
  if (!error && /^(InvalidPasswordException|InvalidParameterException)$/.test(reply.code)) {
    error = String(reply.message).replace(/^.*?:\s*(?=Password)/, '');
  }
  return { ok: false, code: reply.code, error: error || fallback };
}

let signedThisRun = false; // the new signature takes effect when the app restarts

/**
 * { toolInstalled, signed, daysLeft, needsRestart, accountName }. Signed means
 * the Electron build has a valid production VMP signature (checked offline).
 */
async function getDrmStatus() {
  if (!toolInstalled()) {
    // Without the tool the signature can't be checked, and a signature file
    // proves nothing: castLabs' builds come with a development-only one. So it
    // counts as not set up; setup installs the tool and keeps a valid signature.
    return { toolInstalled: false, signed: false, daysLeft: null, needsRestart: false, accountName: null };
  }
  const reply = await helper({ op: 'status', pkg: ELECTRON_DIST });
  return {
    toolInstalled: true,
    signed: Boolean(reply.ok && reply.signed),
    daysLeft: reply.daysLeft ?? null,
    needsRestart: signedThisRun,
    accountName: reply.accountName ?? null,
  };
}

const exec = (cmd, args, timeout) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { output: `${stdout}${stderr}` }));
      else resolve();
    });
  });

/** Installs the castLabs tool in .venv-evs, like `npm run evs:setup`. */
async function installTool() {
  if (toolInstalled()) return { ok: true };
  console.log('DRM setup: installing the castLabs tool in .venv-evs');
  const pythons = isWindows ? [['py', ['-3']], ['python', []]] : [['python3', []]];
  let created = false;
  for (const [cmd, pre] of pythons) {
    try {
      await exec(cmd, [...pre, '-m', 'venv', VENV], INSTALL_TIMEOUT_MS);
      created = true;
      break;
    } catch (err) {
      console.error(`DRM setup: ${cmd} -m venv failed: ${err.output || err.message}`);
    }
  }
  if (!created) {
    return { ok: false, error: 'Python isn’t installed. Download it from python.org, then try again.' };
  }
  try {
    await exec(VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'castlabs-evs'], INSTALL_TIMEOUT_MS);
    return { ok: true };
  } catch (err) {
    console.error(`DRM setup: installing castlabs-evs failed: ${err.output || err.message}`);
    return { ok: false, error: 'Couldn’t install the castLabs tool. Check the internet connection and try again.' };
  }
}

/**
 * Signs the Electron build with the saved castLabs sign-in. `needsSignIn` if
 * there's none; `alreadySigned` if it had a valid signature (nothing changed).
 */
async function signApp() {
  console.log('DRM setup: signing the app (uploads the Electron framework, this takes a minute)');
  const reply = await helper({ op: 'sign', pkg: ELECTRON_DIST }, SIGN_TIMEOUT_MS);
  if (reply.ok) {
    if (!reply.retained) signedThisRun = true;
    return { ok: true, alreadySigned: Boolean(reply.retained) };
  }
  // No saved sign-in (or it expired): EVS wanted to ask for the account name or password.
  if (reply.code === 'NonInteractiveError' || reply.code === 'NotAuthorizedException') {
    return { ok: false, needsSignIn: true, error: null };
  }
  return result(reply, 'Couldn’t sign the app. Try again.');
}

/** Creates a castLabs account; castLabs then emails a confirmation code. */
async function signUp({ accountName, password, email, firstName, lastName }) {
  const reply = await helper({
    op: 'signup',
    accountName,
    password,
    email,
    firstName,
    lastName,
    organization: 'Personal', // required by EVS; this app is for personal use
  });
  return result(reply, 'Couldn’t create the account. Try again.');
}

const resendCode = async ({ accountName }) =>
  result(await helper({ op: 'resend', accountName }), 'Couldn’t send a new code. Try again.');

/** Confirms the account with the emailed code and signs in. */
const confirmAccount = async ({ accountName, password, code }) =>
  result(await helper({ op: 'confirm', accountName, password, code }), 'Couldn’t confirm the account. Try again.');

const signIn = async ({ accountName, password }) =>
  result(await helper({ op: 'signin', accountName, password }), 'Couldn’t sign in. Try again.');

module.exports = { getDrmStatus, installTool, signApp, signUp, resendCode, confirmAccount, signIn };
