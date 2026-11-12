# Architecture

This document explains how the project works: what runs where, how the pieces talk to each other, and why things are built the way they are. For setup, see [README.md](README.md).

## Overview

The app is a TV-style home screen for a computer plugged into a TV. It shows a grid of streaming services. Picking one opens the service's website inside the app window. A phone can act as the remote: it scans a QR code, opens a web page served by the remote server, and sends trackpad, keyboard, navigation, volume and power commands over a WebSocket.

There are two processes. The **remote server** is a plain Node program that runs until it's stopped in the terminal. It serves the phone remote and starts and stops the **TV app** (Electron) as a child process when a phone presses Power. The TV app connects back to the server to receive the phones' commands.

It is built with:

- **Electron** (castLabs' build, which adds Widevine DRM) for the window and the embedded websites.
- **Node** (plain, outside Electron) for the remote server.
- **React 19 + Vite + Tailwind CSS 4** for the home screen.
- **uBlock Origin**, loaded as a Chrome extension, to block ads on the embedded websites.
- **Plain HTML/CSS/JS** for the phone remote page (no build step).

```
┌──────────────────────────── Computer ─────────────────────────────┐
│                                                                    │
│  Remote server (node electron/remote/server.cjs, always running)   │
│   HTTP + WebSocket on port 8765                                    │
│     │ starts / stops (child process)    ▲ /app WebSocket (loopback)│
│     ▼                                   │                          │
│  TV app: Electron main process (electron/main.cjs)                 │
│   ├─ Link to the remote server (electron/remote/link.cjs)          │
│   ├─ Main window (BrowserWindow)                                   │
│   │   ├─ Home screen renderer: React app (src/)    ← preload.cjs   │
│   │   └─ In-app website (WebContentsView, sandboxed)               │
│   │        ↑ uBlock Origin filters its requests                    │
│   ├─ Pointer overlay (transparent BrowserWindow, pointer.html)     │
│   ├─ Remote control (electron/remote/control.cjs)                  │
│   └─ Cursor hider (electron/cursor.cjs)                            │
│                                                                    │
└────────────────────────────────▲───────────────────────────────────┘
                                 │ same Wi‑Fi, http://<lan-ip>:8765/  (/ws)
                      ┌──────────┴──────────┐
                      │ Phone browser        │
                      │ electron/remote/     │
                      │ public/ (remote page)│
                      └─────────────────────┘
```

## Folder layout

```
electron/
  main.cjs                     Main process: startup, window, in-app websites, IPC, remote wiring, uBO, Widevine
  preload.cjs                  Exposes window.tv to the React app
  extension-shim.preload.cjs   Fixes that let uBlock Origin run in Electron
  text-focus.preload.cjs       Tells the main process when a text field on an in-app website has focus
  cursor.cjs                   Hides the computer's mouse cursor when idle (while a phone is connected)
  updates.cjs                  Checks for and installs updates (git and uBlock Origin); see Updates
  remote/
    server.cjs                 The remote server (plain Node entry point): phone page, WebSockets, QR code, starts/stops Electron
    link.cjs                   The TV app's connection to the remote server
    keep-awake.cjs             Keeps the computer from sleeping while the remote server runs
    control.cjs                Turns phone commands into mouse/keyboard input and volume changes
    pointer.html               The on-screen pointer drawn for the phone's trackpad
    public/                    The phone remote page (index.html, remote.css, remote.js)
src/
  main.jsx, App.jsx            React entry point and root component
  components/                  Home screen UI (TopBar, Hero, CardGrid, Card, Backdrop, Clock, RemotePrompt, RemoteStatus, UpdatePopup)
  hooks/useWideImage.js        React hook around utils/wideImage.js
  utils/wideImage.js           Turns square app icons into wide tiles on a canvas
  data/apps.json               The list of streaming services on the home screen
  index.css                    Tailwind setup, theme, animations
public/                        App icons (copied as-is into dist/)
scripts/start.cjs              Runs the remote server and restarts it after an update (npm start / npm run dev)
scripts/fetch-ublock.cjs       Downloads the latest uBlock Origin on npm install and on updates
index.html, vite.config.js     Vite entry and config
extensions/ublock-origin/      Downloaded uBlock Origin (git-ignored)
dist/                          Vite build output (git-ignored)
.venv-evs/                     Python venv for castLabs' signing tool (git-ignored)
```

All Electron code is CommonJS (`.cjs`) because `package.json` sets `"type": "module"` for Vite and React. `server.cjs` lives in `electron/remote/` with the rest of the remote code, but runs in plain Node, not Electron.

## Processes and windows

| What | Created in | Runs | Has Node access? |
|---|---|---|---|
| Launcher | `npm start` / `npm run dev` | `scripts/start.cjs` (plain Node) | Yes |
| Remote server | The launcher | `electron/remote/server.cjs` (plain Node) | Yes |
| Main process | The remote server (`startTv()`) | `electron/main.cjs` and everything it requires | Yes |
| Home screen renderer | `createWindow()` | The React app (`dist/index.html` or the Vite dev server) | No; only `window.tv` from `preload.cjs` |
| In-app website | `createInAppController().open()` | Any streaming site | No; sandboxed, only `text-focus.preload.cjs` (exposes nothing) |
| Pointer overlay | `createPointerOverlay()` in `control.cjs` | `electron/remote/pointer.html` | No; sandboxed |
| uBlock Origin background page | `session.extensions.loadExtension()` | uBO's own code | No; gets `extension-shim.preload.cjs` |
| Phone remote page | The phone's browser | `electron/remote/public/` | It's on another device |

## Startup sequence

`npm start` and `npm run dev` (once Vite is up) run the launcher, [scripts/start.cjs](scripts/start.cjs). For `npm start` (`--build`) it builds the home screen first. Then it runs `node electron/remote/server.cjs`, and runs it again whenever the server exits with code 75 (after installing an update; see [Updates](#updates)), rebuilding first for `npm start`. Any other exit, or Ctrl+C, ends the launcher too. The remote server listens on port 8765, prints the phone link, and starts Electron (`startTv()`). See [Remote server](#remote-server-servercjs).

Then `app.whenReady()` in [main.cjs](electron/main.cjs):

1. **`startRemote()`** connects to the remote server (`createRemoteLink()`, using `TV_REMOTE_LINK` from the environment). It doesn't wait; `remote.ready` resolves once the server has sent the phone link and whether a phone is connected (or `null` after 3 seconds, or right away when Electron was started without the server). IPC handlers that need it wait on it.
2. **`loadAdBlocker()` and `loadWidevine()`** run in parallel, and the window waits for both:
   - uBlock Origin must be loaded before any site opens, or the first site would load unfiltered.
   - Widevine must be installed before DRM video can play. On the first launch, `components.whenReady()` downloads it.
3. **`createWindow()`** creates the main window, the in-app controller, the remote control and the cursor hider, then loads the home screen. If a phone is already connected (it turned the TV on), it gets the current volume.
4. On macOS, `app.focus({ steal: true })` brings the app to the front, since it was started in the background by the server.

Closing the last window quits the app on every system (including macOS), so the remote server sees the TV as off and Power turns it back on.

## Main window

`createWindow()` creates a `BrowserWindow` with:

- `fullscreen: true`: native macOS fullscreen, the same as the green button (its own Space, menu bar and Dock hidden).
- `titleBarStyle: 'hiddenInset'` on macOS: no title bar, but the traffic-light buttons stay. The top bar leaves room for them with `pl-24`, and is a drag region (`app-drag` in [index.css](src/index.css)).
- `contextIsolation: true`, `nodeIntegration: false` and `preload.cjs`, so the React app only sees `window.tv`.
- `minWidth: 960`, `minHeight: 700`, black background.

In development (`VITE_DEV_SERVER_URL` set by `npm run dev`), it loads `http://localhost:5173`. Otherwise it loads `dist/index.html`, which is why `npm start` builds first. Vite's `base: './'` makes asset paths relative so they work from `file://`.

`window.open()` from the home screen is denied, and `http(s)` URLs open in the default browser instead.

## In-app websites

`createInAppController(win)` in [main.cjs](electron/main.cjs) shows one website at a time on top of the home screen.

**Opening** (`open(url)`):

1. Only `http:` and `https:` URLs are allowed (`isWebUrl`).
2. Any open site is closed first.
3. A `WebContentsView` is created with `sandbox: true`, `contextIsolation: true` and [text-focus.preload.cjs](electron/text-focus.preload.cjs), and added as a child view of the window. The preload exposes nothing to the site; see [Text field focus](#text-field-focus).
4. It is placed below the 56 px top bar (`TOP_BAR_HEIGHT`), so the React top bar with its Home button stays visible. **`TOP_BAR_HEIGHT` must match the top bar's `h-14` in [TopBar.jsx](src/components/TopBar.jsx).**
5. Its user agent is Electron's with `Electron/…` and `tv/…` removed, so sites see plain Chrome and don't show "unsupported browser" pages.
6. Pop-ups (`window.open`, `target="_blank"`) open in the default browser.
7. It is registered with `electron-chrome-extensions` as the active tab, so uBlock Origin treats it like a browser tab.

The home screen stays loaded underneath, so its state (which card is focused) is kept.

**Video fullscreen.** When a page's video goes fullscreen (`enter-html-full-screen`), the view is resized to cover the top bar too. Because the window already starts fullscreen, it usually stays as it is. If the user had left window fullscreen, the window goes fullscreen just for the video; `ownsWindowFullscreen` remembers this so it can be undone when the video leaves fullscreen or the site closes.

<a id="text-field-focus"></a>**Text field focus.** [text-focus.preload.cjs](electron/text-focus.preload.cjs) watches `focusin`/`focusout` in the site's main frame (including inside shadow roots) and sends `text-focus` over `wc.ipc` with `true` each time a different text field gets focus (text-like `<input>` types, `<textarea>`, `contenteditable`; not disabled or read-only), and `false` when focus leaves text fields or the page unloads. It also sends `true` when an already focused field is clicked, so the phone keyboard can be brought back after Done. Focus moving between two fields doesn't report `false` in between (it checks after the event). The controller passes these to `onTextFocus(open)`, which `main.cjs` broadcasts to the phones as `{ t: 'keyboard', open }`. Closing the site sends `false`. It also sends `text-hover` whenever the pointer moves onto or off a text field (or its `<label>`), which the controller passes to `onTextHover(over)`. `main.cjs` combines it with whether the phone's pointer is on the site at all (`onPointerOnPage` from the remote control, since the site doesn't see the pointer move onto the top bar) and broadcasts changes as `{ t: 'textHover', over }`. Fields inside iframes aren't detected (preloads only run in the main frame).

**Closing** (`close()`): removes the view, closes its `webContents`, undoes window fullscreen if the video owned it, sends `in-app:closed` to the React app, and focuses the home screen. Closing happens through the Home button (top bar or phone remote), or Back on the site's first page. The Esc key is deliberately left to the website (for example, to leave video fullscreen); it does not go home.

**Navigation** (`navigate(action)`): the one place that handles browser-style navigation, used by both the top bar and the phone remote. `back` goes back in the site's history, or closes the site on its first page. `forward` goes forward if it can. `refresh` reloads, `stop` stops loading, and `home` closes the site. Whenever the site starts or stops loading or navigates (including in-page navigation in single-page apps), `sendNavState()` sends `{ canGoBack, canGoForward, loading }` to the React app, so the top bar can disable Forward and switch between Reload and Stop.

**`page()`** returns `{ wc, htmlFullscreen }` for the open site, or `null`. The remote control and cursor hider use it to find the page.

The window's `webContents.id` maps to its controller in `controllers`, so IPC messages reach the right window.

## IPC between the home screen and the main process

[preload.cjs](electron/preload.cjs) exposes `window.tv`:

| `window.tv` method | Channel | Direction | Purpose |
|---|---|---|---|
| `openInApp(url)` | `in-app:open` | renderer → main | Open a site inside the window |
| `closeInApp()` | `in-app:close` | renderer → main | Return to the home screen |
| `navigateInApp(action)` | `in-app:navigate` | renderer → main | `back`, `forward`, `refresh` or `stop` on the open site |
| `onInAppNavState(cb)` | `in-app:nav-state` | main → renderer | `{ canGoBack, canGoForward, loading }` whenever the site navigates or starts/stops loading |
| `onInAppClosed(cb)` | `in-app:closed` | main → renderer | The site was closed (by any means), so clear the app name and nav state in the top bar |
| `getRemoteInfo()` | `remote:info` (invoke) | renderer → main | `{ url, qr, lanAvailable }` for the QR popup, or `null` if the remote server can't be reached |
| `getRemoteStatus()` | `remote:status` (invoke) | renderer → main | `{ available, connected }` |
| `onRemoteStatus(cb)` | `remote:status` | main → renderer | Sent when a phone connects or disconnects |
| `checkForUpdates()` | `update:check` (invoke) | renderer → main | `{ app, ublock, canInstall, lastError }`; see [Updates](#updates) |
| `installUpdates()` | `update:install` (invoke) | renderer → main | Asks the remote server to update; `false` if it can't be reached |

The `on…` methods return an unsubscribe function, which the React effects return as cleanup.

If `window.tv` is missing (the React app opened in a plain browser tab with `npx vite`), the app still renders, and picking a card opens the site in a new tab.

## Home screen (React)

[App.jsx](src/App.jsx) holds the state:

- `focused`: index of the focused card. Drives the hero title and the backdrop.
- `openAppName`: name of the open site, shown in the top bar (null on the home screen).
- `navState`: `{ canGoBack, canGoForward, loading }` of the open site, from `in-app:nav-state`. Starts as loading when a site opens, and resets when it closes.
- `remoteConnected`: whether a phone is connected (green dot in the top bar).
- `showRemotePrompt`: the QR popup. It is shown only while no phone is connected: on startup if none is (so not when a phone turned the TV on, or on the remote's Refresh), and 3 seconds after the last phone disconnects (`RECONNECT_GRACE_MS`, so a phone that drops for a moment doesn't flash it). It closes as soon as a phone connects. "Continue without connecting controller" closes it until the next time a phone connects and leaves.

Components:

| Component | What it does |
|---|---|
| [TopBar](src/components/TopBar.jsx) | Drag region. While a site is open, shows browser-style icon buttons (Home, Back, Forward, and Reload, which becomes Stop while loading; same icons as the phone remote) and the app name. Back is never disabled, because on the first page it goes home; Forward is disabled when there's nothing to go forward to. Also shows the green dot (`RemoteStatus`) or a phone button that reopens the QR popup (home screen only, since a site would cover the popup); the clock; and the gear button that opens `UpdatePopup` (home screen only, for the same reason). |
| [Hero](src/components/Hero.jsx) | Large title and tagline of the focused app. Keyed on the title so the entrance animation replays. |
| [CardGrid](src/components/CardGrid.jsx) | 4 columns (6 on `xl`). Arrow keys move focus; the column count is read from the computed grid, so it follows the breakpoint. Keeps real DOM focus on the focused card so Enter/Space click it. Disabled while the QR popup is open. |
| [Card](src/components/Card.jsx) | A tile that zooms, tilts and shows glare toward the mouse (CSS variables `--rx`, `--ry`, `--gx`, `--gy`), with a press animation on select. |
| [Backdrop](src/components/Backdrop.jsx) | Every app icon stacked, heavily blurred, cross-fading to the focused one, with a dark gradient on top. |
| [Clock](src/components/Clock.jsx) | Day, date and time, like "Sun Nov 8 2:48 PM" (in the system's language and 12/24-hour setting), updated every second. |
| [RemotePrompt](src/components/RemotePrompt.jsx) | QR code popup with the link, a warning when the computer has no network, and "Continue without connecting controller". Esc closes it. |
| [RemoteStatus](src/components/RemoteStatus.jsx) | The green dot; clicking it shows "Remote control connected" for 3 seconds. |
| [UpdatePopup](src/components/UpdatePopup.jsx) | Checks for updates when opened. Shows "Up to date", or what's new (the first 5 commit messages and the uBlock Origin version) with "Update and restart", or why the check failed. Also shows why the last update failed, if it did. |

**Wide tiles.** App icons in `public/` are square, but tiles are 5:3. [wideImage.js](src/utils/wideImage.js) draws each icon centered on a 750×450 canvas and fills the sides by stretching and blurring a thin strip from the icon's left and right edges, so the background looks seamless. If an app sets `bg` in `apps.json`, the sides are that solid colour instead (for logos that touch the icon's edges). Results are cached per image, and the tile shows the original icon until the wide version is ready.

**Styling.** Tailwind 4 through `@tailwindcss/vite`. [index.css](src/index.css) defines the font stack, the `ease-tv` easing, the `rise`/`fade`/`press` animations and the `app-drag`/`app-no-drag` utilities.

### Adding a streaming service

Add an entry to [src/data/apps.json](src/data/apps.json) and put its icon (square PNG) in `public/`:

```json
{
  "name": "Example",
  "img": "example.png",
  "url": "https://www.example.com",
  "tagline": "Short description",
  "bg": "#000"
}
```

`bg` is optional. `name` must be unique (it's the React key).

## Phone remote

### Remote server ([server.cjs](electron/remote/server.cjs))

A plain Node program, separate from Electron, that runs until it's stopped in the terminal (Ctrl+C, or `concurrently -k` stopping it in `npm run dev`). Keeping it outside the TV app is what lets the Power button turn the app off and back on, with phones staying connected the whole time.

- **Address.** Listens on `0.0.0.0:8765` (or `TV_REMOTE_PORT`). If the port is taken, it exits with an error instead of picking another port, because the phone link must stay the same, and the port being taken usually means another copy is already running. The link uses the computer's LAN IPv4 address, preferring Wi‑Fi/Ethernet adapters (`en*`, `eth*`, `wl*`) over VPN and virtual ones, and skipping link-local `169.254.*`. With no network, it falls back to `localhost` and `lanAvailable: false`, which the QR popup warns about. The link is `http://<lan-ip>:8765/`, with no token, so it stays the same across restarts.
- **Static files.** Only `/`, `/remote.css` and `/remote.js` are served (from `public/`), with `Cache-Control: no-store` so phones always get the current version. Anything else is 404.
- **WebSockets.** `ws` with a 64 KB message limit, on two paths:
  - `/ws` for phones. Open to anyone who can reach the port.
  - `/app` for the TV app. Only accepted from loopback with the right key (`?k=`, a random key made each time the server starts and passed to Electron in `TV_REMOTE_LINK`; compared in constant time), so a phone can't pose as the app. Only one app connection at a time.
- **Power** (`togglePower()`). The TV app's state is `off`, `starting` (process started, not yet connected back), `on` or `stopping`, and every change is sent to the phones. Power when off starts Electron (`startTv()`: spawns the binary from `require('electron')` on the project folder, inheriting the terminal and environment, so `VITE_DEV_SERVER_URL` carries through in dev). Power when starting or on stops it (`stopTv()`: sends `quit` to the app, or `SIGTERM` if it hasn't connected yet, then `SIGKILL` after 10 seconds). Power while stopping or updating is ignored. If the app exits any other way (Cmd+Q, closing the window, a crash), the state becomes `off`.
- **Updates** (`updateAndRestart()`), when the TV app sends `update`: see [Updates](#updates).
- **Keeping the computer awake** ([keep-awake.cjs](electron/remote/keep-awake.cjs)). Once listening, the server starts the system's own sleep blocker, which watches the server's PID and stops when it exits (even on `SIGKILL`): `caffeinate -i -w` on macOS, a hidden PowerShell holding `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` until `Wait-Process` returns on Windows, and `systemd-inhibit --what=idle:sleep` on Linux. It only stops idle *system* sleep, so a phone can turn the TV on at any time; the screen can still turn off. While the TV app runs, `powerSaveBlocker.start('prevent-display-sleep')` in `main.cjs` keeps the screen on too. Neither stops sleep from closing a laptop's lid (see the README).
- **Stopping the server.** `SIGINT`/`SIGTERM` closes every connection, stops the TV app and exits once it's gone (or after 5 seconds).
- **Commands.** Phone messages are JSON with a string `t` field; anything else is ignored. `power` is handled by the server; everything else is forwarded to the TV app, or dropped while it's off.

The traffic is plain HTTP on the local network, and there is no token: anyone on the same network who opens the link can use the remote, including turning the TV app on.

### Link to the remote server ([link.cjs](electron/remote/link.cjs))

`createRemoteLink({ url, onCommand, onPhoneConnected, onStatusChange, onQuit })` connects the TV app to the server's `/app` WebSocket, and reconnects every second if the connection drops. It returns `ready`, `info()` (`{ url, qr, lanAvailable }` for the QR popup), `connected()` (whether any phone is connected), `broadcast(msg)` and `close()`.

Server → app:

| Message | Meaning |
|---|---|
| `{ t: 'hello', url, qr, lanAvailable, connected, updates, updateError }` | Sent on connect: the phone link, its QR code (PNG data URL), whether a phone is already connected, that the server can install updates (`updates: true`), and why the last update failed (or `null`) |
| `{ t: 'status', connected }` | A phone connected or left |
| `{ t: 'phone-connected' }` | A phone connected (or one was already connected when the app connected); the app replies with its volume state |
| `{ t: 'command', msg }` | A phone command (see below) |
| `{ t: 'quit' }` | Power was pressed; the app calls `app.quit()` |

App → server: `{ t: 'broadcast', msg }` sends `msg` to every phone (used for `state` and `keyboard`). `{ t: 'update' }` asks the server to install updates (the gear popup's "Update and restart").

### Message protocol

Phone → computer:

| Message | Meaning |
|---|---|
| `{ t: 'move', dx, dy }` | Move the virtual pointer (clamped to ±400 per message) |
| `{ t: 'click' }` | Left click at the pointer |
| `{ t: 'scroll', dx, dy }` | Scroll at the pointer (clamped to ±2000) |
| `{ t: 'key', key, repeat? }` | Press `Left`, `Right`, `Space`, `Enter`, `Backspace`, `F` or `Escape`, up to 100 times |
| `{ t: 'text', text }` | Type text (up to 500 characters per message) |
| `{ t: 'nav', action }` | `back`, `forward`, `home` or `refresh` |
| `{ t: 'volume', value }` | Set volume 0–100 |
| `{ t: 'mute', muted }` | Mute or unmute |
| `{ t: 'power' }` | Turn the TV app off or on (handled by the remote server) |

Computer → phone:

| Message | Meaning |
|---|---|
| `{ t: 'state', volume, muted }` | Current volume. Sent when a phone connects, when the TV app starts with a phone connected, and when the volume changes. Sent by the TV app, through the server. |
| `{ t: 'tv', state }` | The TV app is `off`, `starting`, `on`, `stopping` or `updating`. Sent by the server when a phone connects and whenever it changes. |
| `{ t: 'textHover', over }` | Whether the pointer is over a text field on the open website. Sent when it changes and when a phone connects. Sent by the TV app, through the server. |
| `{ t: 'keyboard', open }` | A text field on the open website got focus (`true`, sent again for each new field) or lost it (`false`). Sent by the TV app, through the server. |

The remote server handles `power` itself. Everything else reaches `main.cjs` as a `command` and goes to `remoteControl.handle()`.

### Phone page ([public/](electron/remote/public/))

[remote.js](electron/remote/public/remote.js) is a single script with no dependencies:

- **Connection.** Connects to `/ws`. On disconnect it retries every 1.5 seconds, forever; after 3 failures it says it can't reach the TV (the remote server was stopped, or the phone left the Wi‑Fi). It reconnects when the page becomes visible again (phones suspend background tabs).
- **Trackpad.** Pointer events with pointer capture. One finger moves the pointer, with acceleration (`gain = 1.6 + min(speed / 6, 2.6)`): slow moves are precise, fast swipes go far. Two or more fingers scroll. Moves and scrolls are added up and sent once per animation frame. A tap (one finger, under 12 px of travel, under 300 ms) sends a click.
- **Buttons.** `data-nav` buttons send `nav`, `data-key` buttons send `key`. Power asks for confirmation, then sends `power`.
- **Off screen.** While the TV app is `off`, `starting`, `stopping` or `updating` (from `tv` messages), a full-screen overlay covers the remote, with a large power button that turns the TV on (enabled only when `off`). The connection status stays visible above it.
- **Volume.** The slider sends at most every 60 ms while dragging, and once more on release. Incoming `state` messages don't move the slider while the user is dragging it.
- **Typing.** A text box in a bottom sheet. On each change it compares the new text with what was sent so far and sends only the difference: backspaces for removed characters, then the added text. That way autocorrect and predictive text (which replace whole words) work. Backspace on an empty box deletes text on the TV. The Delete and Enter buttons cancel `pointerdown` so the phone keyboard stays open. Enter (the button or the keyboard's Go) sends Enter to the TV and closes the sheet. Phones only show their keyboard for a `focus()` inside a tap, and `keyboard` arrives too late for that, so:
  - A trackpad tap while `textHover` says the pointer is over a text field opens the sheet and focuses the box during the tap itself (in `pointerup`, and again in `touchend` for iPhones), so the keyboard is up right away. The `keyboard: true` that follows is the confirmation; if none arrives within 2.5 seconds (the tap missed) and nothing was typed, the sheet closes.
  - Any other `keyboard: true` (the site focused a field itself) opens the sheet with an empty box but without the phone keyboard; iPhones show "Tap here to type…" and need one tap on the box.
  - `keyboard: false` closes the sheet.

### Remote control ([control.cjs](electron/remote/control.cjs))

`createRemoteControl({ win, inApp, topBarHeight, onStateChange })` turns messages into input. It doesn't use OS-level input (no accessibility permission, no native modules): every event is sent straight to a page with `webContents.sendInputEvent()`.

**Virtual pointer.** The pointer position lives in `cursor` (window content coordinates), starting at the window's center. It keeps fractions so slow movements add up. `mouseTarget()` decides where a mouse event goes:

- With a site open and the pointer below the top bar (or anywhere, while a video is fullscreen): the site, with the y coordinate shifted up by the top bar height.
- Otherwise: the home screen renderer, which draws the top bar.

Clicks focus the target first, then send `mouseDown` + `mouseUp`. Scrolls send `mouseWheel`.

**Pointer overlay.** Because the real cursor doesn't move, the pointer is drawn separately: a transparent, frameless, click-through (`setIgnoreMouseEvents(true)`), non-focusable child window over the main window's content area, kept in place on move/resize/fullscreen. [pointer.html](electron/remote/pointer.html) draws an arrow, positioned so its tip is exactly at the pointer, shrinks it briefly on click, and fades it out after 3 seconds without movement. It is created the first time the pointer is used.

**Keys and text** go to the open site, or the home screen if none is open. The home screen's arrow keys move between cards; on sites, Left/Right/Space are the usual video player shortcuts, and the phone's Full screen and Exit full screen buttons press F and Esc. Text is sent as `char` events through the same input queue as key presses, so a Backspace followed by new text arrives in order.

**Navigation.** `back`, `forward`, `home` and `refresh` go to the in-app controller's `navigate()`, the same as the top bar's buttons (see [In-app websites](#in-app-websites)). The one difference: `refresh` with no site open reloads the home screen.

### Volume

Volume has two modes, chosen fresh each time the volume changes and each time a phone connects (`checkVolumeMode()`):

- **System mode** (macOS, when the output device has a volume: built-in speakers, headphones, most Bluetooth speakers). `osascript` reads and sets the Mac's output volume. This is what a TV remote would change.
- **App mode** (other systems, and Macs sending audio over HDMI or DisplayPort). macOS turns its volume control off for HDMI and DisplayPort outputs; `get volume settings` returns `output volume:missing value`, so `readSystemVolume()` returns null. Instead, the app turns down its own audio. This can only make sound quieter than the TV's own volume setting.

The remote's number is perceived loudness, not signal strength. `loudnessToLevel()` maps 0–100 to a gain of `(volume / 100) ^ 1.66`: a sound seems half as loud when it is 10 dB quieter, so 50 → −10 dB, 25 → −20 dB, 10 → −33 dB, 1 → −66 dB.

In app mode, `applyPageVolume()`:

- Mutes or unmutes the home screen and the site with `webContents.setAudioMuted()`.
- Runs `scalePageVolume(level)` in every frame of the site. That function replaces the `volume` property on `HTMLMediaElement.prototype`. When the site sets a volume, the element really plays at `site volume × level`, but reading `volume` returns what the site set. So the site's own volume slider keeps working, and sites that reset their volume when a video loads (YouTube) can't undo the remote's level. Elements the site never touches are caught by capture-phase `loadstart` and `play` listeners on the document. Pages and frames that load later get it on `dom-ready` and `did-frame-finish-load` (through `app`'s `web-contents-created`).

Switching from app mode back to system mode (for example, unplugging the TV) sets the app's level back to full, so sound isn't turned down twice. The app mode volume (`appVolume`) is kept separately and comes back if the output switches to the TV again.

`osascript` calls run one at a time through `serialRunner()`, which keeps only the latest pending task, so dragging the slider doesn't queue hundreds of calls.

## Cursor hider ([cursor.cjs](electron/cursor.cjs))

While at least one phone is connected, the computer's own mouse cursor hides after 5 seconds without moving, so it doesn't sit on top of a video.

- It checks `screen.getCursorScreenPoint()` every 250 ms. The phone remote never moves the real cursor (it sends events straight to pages), so only the real mouse counts as movement.
- Hiding adds a constructed stylesheet (`*, *::before, *::after { cursor: none !important }`) to `document.adoptedStyleSheets` in every frame of the home screen and the open site. A constructed stylesheet is used because a site's Content Security Policy can block an injected `<style>` element, but not this. Showing removes it.
- Pages and frames that load while it's hidden get the stylesheet on `dom-ready` / `did-frame-finish-load`. The home screen's `webContents` is hooked directly, because it was created before the `web-contents-created` listener.
- `sendRemoteStatus()` in `main.cjs` turns it on or off whenever a phone connects or disconnects, and `createWindow()` sets it from the current status.

It only affects the app's own pages; the cursor still shows over other apps and the menu bar.

## Ad blocking (uBlock Origin)

**Download.** [fetch-ublock.cjs](scripts/fetch-ublock.cjs) runs on `npm install` (`postinstall`). It also runs when the app updates. It asks GitHub's API for the latest stable uBlock Origin release and downloads its official Chromium build. If GitHub can't be asked, it keeps the installed version, or installs `FALLBACK_VERSION` if there is none. It unzips it (with `unzip`, or `tar` where there's no `unzip`) into `extensions/ublock-origin/`, skipping the download if the latest version is already there. A failed download prints a warning instead of failing `npm install`; the app then runs without the ad blocker. `npm run fetch:ublock` forces a fresh download.

**Loading** (`loadAdBlocker()` in `main.cjs`). Electron only supports part of the Chrome extension APIs, so the [`electron-chrome-extensions`](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions) library adds the rest (`browserAction`, `tabs`, `webNavigation`, …) to the default session. Each in-app site is registered as a tab (`addTab`, `selectTab`), so uBO knows which page a request belongs to.

**Shim** ([extension-shim.preload.cjs](electron/extension-shim.preload.cjs)). Registered as a frame preload on the default session before `ElectronChromeExtensions` is created, so it runs before the library's own preload. It only does anything in extension pages (`chrome-extension:`) without context isolation, which means uBO's background page. It fixes two problems with uBlock Origin (a Manifest V2 extension) in Electron 45:

1. The library adds the missing APIs to `window.chrome`, but Electron then replaces `window.chrome` with a new object before the extension's scripts run, so the APIs disappear and uBO crashes on startup. The shim defines a `chrome` getter/setter on the global object; when Electron assigns the new object, the shim copies over everything the library added or changed.
2. Electron's `chrome.storage.managed` is the same object as `chrome.storage.local`. uBO reads "managed" (admin) settings and caches them into `storage.local`, so every launch nests the whole store inside itself: hundreds of MB per launch, and slower startups each time. The shim removes `storage.managed`, so uBO takes its normal "no admin settings" path.

## DRM video (Widevine)

Most streaming services encrypt video with Google's Widevine DRM. Stock Electron doesn't include Widevine, so the project uses castLabs' [Electron for Content Security](https://github.com/castlabs/electron-releases) (ECS), installed from GitHub in `package.json` (`electron: github:castlabs/electron-releases#v45.2.1+wvcus`). It's a drop-in replacement with an extra `components` API. Unlike stock Electron, the package doesn't download its binary during `npm install`; it downloads it into `node_modules/electron/dist` the first time Electron is launched.

- `loadWidevine()` waits for `components.whenReady()`, which downloads or updates the Widevine module on first launch, then logs `Widevine ready`. On stock Electron, `components` is undefined and it logs `Widevine unavailable`.
- **VMP signing.** Widevine has security levels. castLabs' builds are signed for development only, and services like Prime Video and Netflix reject that ("You are running an old or unsupported version of this browser"). castLabs' free EVS service signs the Electron app for production (Verified Media Path). The `evs:*` and `sign:vmp` scripts install castLabs' Python tool into `.venv-evs/` and sign `node_modules/electron/dist`. That folder only exists after the first launch, and reinstalling Electron replaces it, so signing happens after the first launch and again after every reinstall.

## Updates

The gear button on the home screen opens [UpdatePopup](src/components/UpdatePopup.jsx), which calls `checkForUpdates()` in [updates.cjs](electron/updates.cjs) through `update:check`. The check runs in the TV app's main process:

- **App.** `git fetch`, then `git log HEAD..@{u}` lists the commits on GitHub that this copy doesn't have (`{ behind, commits }`). If git fails, the result is `{ error }` with a plain-language reason (`explainGitError()`): git not installed, not a git clone, no upstream branch, local changes in the way, local commits, or no network. Git never prompts for a password (`GIT_TERMINAL_PROMPT=0`), and the fetch gives up after 30 seconds.
- **uBlock Origin.** The installed version (its `manifest.json`) against the latest release on GitHub (`{ installed, latest, available }`), or `null` if GitHub can't be asked.

"Update and restart" sends `update` to the remote server, which runs `updateAndRestart()` in [server.cjs](electron/remote/server.cjs):

1. Turns the TV app off (`stopTv()`) and sets the state to `updating`, so the phones show "Updating…" and Power is ignored.
2. Runs `applyUpdates()` from updates.cjs: if there are new commits, `git pull --ff-only` and then `npm install` (whose `postinstall` updates uBlock Origin); then `fetch-ublock.cjs`, which does nothing if uBlock Origin is already the latest. Their output goes to the terminal.
3. Exits with code 75. The launcher rebuilds (for `npm start`) and starts the new server, which turns the TV app on as usual. Phones reconnect by themselves.

`canInstall` is true only if the server said `updates: true` in `hello`. A server started before this feature existed doesn't, and would ignore `update`. That happens when the code is pulled by hand and only Power is used to restart, since Power restarts the TV app but not the server. The popup then asks for the terminal command to be restarted. If the app is still running 20 seconds after "Update and restart", the popup says the update didn't start.

If a step fails, the server turns the TV app back on without restarting and keeps the reason in `updateError`, which goes to the app in `hello` and shows in the popup. If the server wasn't started by the launcher (`TV_SUPERVISED` unset), it turns the TV app back on after updating, and says in the terminal that it needs restarting by hand.

In `npm run dev`, Vite keeps running through the update and reloads the changed React code itself.

## Build and scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts Vite on port 5173 (`strictPort`) and, once it's up (`wait-on`), the launcher (and so the remote server) with `VITE_DEV_SERVER_URL` set, which starts Electron. React changes hot-reload. Changes in `electron/` need the TV turned off and on (Power), except `server.cjs`, which needs `npm run dev` restarted. Power leaves Vite and the server running; `concurrently -k` stops both when either exits (Ctrl+C). |
| `npm run build` | Builds the React app into `dist/`. |
| `npm start` | Runs the launcher with `--build`: builds, then starts the remote server, which runs Electron on `dist/`. |
| `npm run fetch:ublock` | Re-downloads the latest uBlock Origin. |
| `npm run evs:setup` | Creates `.venv-evs` and installs castLabs' `castlabs-evs` tool. |
| `npm run evs:signup` | Creates a castLabs EVS account (one time). |
| `npm run sign:vmp` | Signs `node_modules/electron/dist` for production Widevine. |

There's no packaging step (no installer or `.app` bundle); the app runs from the project folder.

## Security model

- **Websites** run in a sandboxed `WebContentsView` with context isolation and only the text-focus preload (which exposes nothing), so they can't reach Node or `window.tv`. Only `http(s)` URLs can be opened, and pop-ups go to the default browser.
- **The home screen** has context isolation and only the small `window.tv` API.
- **The phone remote** has no token: anyone on the local network who opens the link can use it. It can control the app's pages (pointer, keys, text, navigation, volume) and turn the TV app off and on, but can't reach other apps or the file system. The connection is unencrypted HTTP on the local network.
- **The TV app's link** to the remote server only accepts loopback connections with the per-run key, so phones can't send it messages that pose as the server's.
- **The remote control** runs JavaScript in site frames (`executeJavaScript`) for the volume and cursor features; those scripts only touch media volume and stylesheets.

## Things to keep in sync

- `TOP_BAR_HEIGHT` in [main.cjs](electron/main.cjs) and the top bar's height (`h-14`, 56 px) in [TopBar.jsx](src/components/TopBar.jsx). The remote control also uses it to decide whether a click goes to the top bar or the site.
- The Electron version in `package.json` and the castLabs release tag (`v45.2.1+wvcus`). After changing it, run `npm run sign:vmp` again.
- `RESTART_CODE` (75) in [server.cjs](electron/remote/server.cjs) and [start.cjs](scripts/start.cjs).
- New remote commands: add the message to the phone page ([remote.js](electron/remote/public/remote.js)), handle it in `handle()` in [control.cjs](electron/remote/control.cjs) (or in the phone connection handler in [server.cjs](electron/remote/server.cjs) for ones that must work while the TV app is off, like `power`), and validate and clamp its fields there.
