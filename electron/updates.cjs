// Checking for and installing updates: new commits on GitHub (git) and a newer
// uBlock Origin. The TV app checks (the gear button in the top bar); the remote
// server installs, since it has to turn the TV app off first and restart
// itself afterwards (see updateAndRestart() in remote/server.cjs).
const { execFile, spawn } = require('child_process');
const path = require('path');
const { installedVersion, latestRelease } = require('../scripts/fetch-ublock.cjs');

const ROOT = path.join(__dirname, '..');
const FETCH_UBLOCK = path.join(ROOT, 'scripts', 'fetch-ublock.cjs');
const isWindows = process.platform === 'win32';
// Never wait for a password prompt nobody can see.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
const MAX_COMMITS = 5; // commit messages listed in the popup

function git(args, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, env: GIT_ENV, timeout }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve(String(stdout).trim());
    });
  });
}

/** A message for the person at the TV instead of git's own. */
function explainGitError(err) {
  const text = `${err.stderr ?? ''} ${err.message ?? ''}`;
  if (err.code === 'ENOENT') return 'Git isn’t installed, so the TV app can’t update itself.';
  if (/not a git repository/i.test(text)) return 'This copy wasn’t downloaded with git clone, so it can’t update itself.';
  if (/no upstream|no such branch|@\{u\}/i.test(text)) return 'This copy isn’t on a branch that follows GitHub.';
  if (/would be overwritten|local changes/i.test(text))
    return 'Some files were changed on this computer. Commit or stash those changes, then try again.';
  if (/not possible to fast-forward|diverg/i.test(text))
    return 'This copy has its own commits that aren’t on GitHub. Pull it by hand in the terminal.';
  if (err.killed || /could not resolve|unable to access|timed out|network/i.test(text))
    return 'Couldn’t reach GitHub. Check the internet connection.';
  return (err.stderr || err.message || 'Unknown git error').trim().split('\n')[0];
}

/** { behind, commits } (commits on GitHub that this copy doesn't have yet), or { error }. */
async function checkApp() {
  try {
    await git(['fetch', '--quiet'], 30_000);
    const log = await git(['log', '--format=%s', 'HEAD..@{u}']);
    const commits = log ? log.split('\n') : [];
    return { behind: commits.length, commits: commits.slice(0, MAX_COMMITS) };
  } catch (err) {
    return { error: explainGitError(err) };
  }
}

/** { installed, latest, available }, or null if GitHub can't be asked. */
async function checkUblock() {
  try {
    const installed = installedVersion();
    const { version: latest } = await latestRelease();
    return { installed, latest, available: installed !== latest };
  } catch {
    return null;
  }
}

/**
 * What can be updated:
 * { app: { behind, commits } | { error }, ublock: { installed, latest, available } | null }
 */
async function checkForUpdates() {
  const [app, ublock] = await Promise.all([checkApp(), checkUblock()]);
  return { app, ublock };
}

/** Runs a command with its output in the terminal; rejects if it fails. */
function run(command, args, label) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, args, {
      cwd: ROOT,
      env: GIT_ENV,
      shell: isWindows && command === 'npm', // npm is npm.cmd on Windows
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${label} failed (exit code ${code})`), { stderr }));
    });
  });
}

/**
 * Pulls new commits (then `npm install`, which also updates uBlock Origin) and
 * updates uBlock Origin. Call only while the TV app is off. Rejects with a
 * message for the person at the TV if something fails.
 */
async function applyUpdates() {
  const app = await checkApp();
  if (app.behind > 0) {
    console.log(`Pulling ${app.behind} new commit${app.behind === 1 ? '' : 's'} from GitHub`);
    try {
      await run('git', ['pull', '--ff-only'], 'git pull');
    } catch (err) {
      throw new Error(explainGitError(err));
    }
    try {
      await run('npm', ['install'], 'npm install');
    } catch {
      throw new Error('npm install failed. See the terminal for details.');
    }
  }
  // Already done by npm install's postinstall if it ran; then this does nothing.
  await run(process.execPath, [FETCH_UBLOCK], 'Updating uBlock Origin');
}

module.exports = { checkForUpdates, applyUpdates };
