#!/usr/bin/env node
// Runs the remote server (electron/remote/server.cjs) and starts it again after
// an update. The server installs an update, then exits with RESTART_CODE, so
// the new version of its code is the one that runs. With --build (npm start),
// the home screen is built first, and again after each update.
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'electron', 'remote', 'server.cjs');
const RESTART_CODE = 75; // keep in sync with server.cjs
const build = process.argv.includes('--build');

let child = null;
let stopping = false;

function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command === 'npm', // npm is npm.cmd on Windows
    });
    child.on('error', (err) => {
      console.error(`Could not run ${command}:`, err.message);
      child = null;
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      child = null;
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main() {
  for (let first = true; ; first = false) {
    if (build) {
      const code = await run('npm', ['run', 'build']);
      if (stopping) process.exit(code);
      if (code !== 0) {
        if (first) process.exit(code);
        console.error('The build failed after the update. Starting anyway.');
      }
    }
    const code = await run(process.execPath, [SERVER], { ...process.env, TV_SUPERVISED: '1' });
    if (stopping || code !== RESTART_CODE) process.exit(code);
    console.log('Restarting with the update');
  }
}

// Ctrl+C reaches the server (and the TV app) too, since they share the
// terminal; let it shut them down, then exit with it.
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
  child?.kill('SIGTERM');
});

main();
