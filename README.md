# tv

A TV-style home screen built with Electron, React and Vite. Streaming sites open inside the app, with ads blocked by [uBlock Origin](https://github.com/gorhill/uBlock).

## Setup

1. **Install Node.js** 20.19 or newer (22+ recommended). Check with:

   ```bash
   node -v
   ```

2. **Clone the project** and go into its folder:

   ```bash
   git clone <repo-url> tv
   cd tv
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

   This also downloads uBlock Origin into `extensions/ublock-origin/`. You should see:

   ```
   uBlock Origin 1.75.4 installed to extensions/ublock-origin
   ```

   If the download failed (for example, you were offline), run it again with:

   ```bash
   npm run fetch:ublock
   ```

4. **Start the app** in development mode, with live reload for the React UI:

   ```bash
   npm run dev
   ```

   Or build and run the production version:

   ```bash
   npm start
   ```

5. **Connect your phone as a remote (optional).** When the app starts, it shows a QR code. Scan it with your phone's camera; the phone must be on the same Wi‑Fi network as the computer. To skip, choose **Continue without connecting controller**. The phone icon in the top bar shows the QR code again.

   While a phone is connected, a green dot appears in the top right instead, and the QR code doesn't pop up. Click the dot to see "Remote control connected".

## DRM video (Prime Video, Netflix, Disney+, …)

Most streaming services protect their video with Google's Widevine DRM. Regular Electron doesn't include Widevine, so these services refuse to play. The app uses castLabs' [Electron for Content Security](https://github.com/castlabs/electron-releases) instead: a drop-in replacement for Electron that adds Widevine.

1. **Install castLabs Electron** in place of regular Electron:

   ```bash
   npm install "https://github.com/castlabs/electron-releases#v45.2.1+wvcus" --save-dev
   ```

   The first launch afterwards downloads castLabs' Electron app (about 100 MB) and then Widevine, so it takes longer than usual. After that, the terminal should show `Widevine ready` instead of `Widevine unavailable`.

2. **Sign the app for production (macOS and Windows).** castLabs' builds are only signed for development. Services like Prime Video and Netflix need a production "VMP" signature, which castLabs provides for free through their EVS service:

   ```bash
   npm run evs:setup    # one time: installs castLabs' signing tool into .venv-evs
   npm run evs:signup   # one time: asks for your email, then a confirmation code
   npm run sign:vmp
   ```

   Without this step, Prime Video shows "You are running an old or unsupported version of this browser", because it rejects the development signature.

   Run `npm run sign:vmp` again whenever Electron is reinstalled (for example, after deleting `node_modules`), because reinstalling removes the signature.

## Phone remote

The remote page runs in the phone's browser, so no app install is needed. It has:

- **Trackpad:** drag to move the on-screen pointer, tap to click, and swipe with two fingers to scroll.
- **Back / Home / Forward:** move through the website's history, or return to the home screen.
- **Skip back / Play-pause / Skip forward:** press the Left, Space and Right keys.
- **Volume:** controls the Mac's system volume. When that can't be changed (for example, on a TV connected by HDMI) or on other systems, it controls the app's own volume instead. See [Volume on a TV or monitor](#volume-on-a-tv-or-monitor).
- **Type:** sends text to the selected text box on the TV.
- **Refresh:** reloads the current page.
- **Power:** quits the app and stops the remote server. In `npm run dev` it stops the Vite dev server too.

Notes:

- The link includes a random code that changes every launch, so only phones that scanned the current QR code can connect. After restarting the app, scan the new code.
- The remote server uses port 8765, or any free port if 8765 is busy. On first launch, macOS may ask whether to allow incoming connections; choose **Allow**.
- The code lives in [electron/remote/](electron/remote/): `server.cjs` (server and QR code), `control.cjs` (turns remote commands into clicks and key presses), `pointer.html` (the on-screen pointer) and `public/` (the phone page).

### Volume on a TV or monitor

When a Mac sends sound to a TV or monitor over HDMI or DisplayPort, macOS turns off its own volume control. The volume keys and the menu bar slider stop working. The Mac sends sound at full level and expects the TV's own remote to set how loud it is.

The phone remote handles this automatically. Each time you change the volume, the app checks whether the Mac's volume can be changed:

- **It can** (built-in speakers, headphones, most Bluetooth speakers): the remote changes the Mac's system volume.
- **It can't** (a TV or monitor over HDMI or DisplayPort): the remote changes the volume of sound played in the app. The home screen and website show no difference; videos just play quieter.

The app volume can only make sound **quieter** than the TV's own setting, never louder. So the first time you connect to a TV:

1. Set the remote's volume to 100.
2. Use the TV's own remote to set the TV to the loudest volume you'd want.
3. From then on, use the phone remote to turn it down from there.

Notes:

- The number is how loud it sounds compared with 100: 50 sounds half as loud, 10 sounds a tenth as loud, and 1 sounds 1% as loud. (The sound signal itself is turned down more than that, because ears hear a signal at half strength as only a little quieter.)
- The site's own volume slider still works. The remote's volume is applied on top of it, so a site that resets its volume when a video loads (YouTube does) stays at the remote's level.
- If you switch the Mac's sound output (for example, unplug the TV), the next volume change moves to the new mode. The app volume goes back to full, so sound isn't turned down twice.
- The Mac's volume keys still can't change a TV's volume. Only the phone remote can.
