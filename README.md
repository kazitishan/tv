# TV

Turn any pc/laptop into a tv with built in ad-blocking and use your phone as a remote control

## Setup

1. **Install Node.js**

2. **Clone and install:**

   ```bash
   git clone https://github.com/kazitishan/tv tv
   cd tv
   npm install
   ```

   This also downloads uBlock Origin. If that download fails, run `npm run fetch:ublock`.

3. **Start the app:**

   ```bash
   npm run dev    # development, with live reload for the UI
   npm start      # or: build and run the production version
   ```

   This starts the phone remote server, which then turns the TV app on. Keep the terminal open: the remote server runs until you press Ctrl+C there, so the phone can turn the TV off and back on.

   The first launch is slow: it downloads castLabs' Electron (about 100 MB) and Widevine, the DRM module. The terminal shows `Widevine ready` when it's done.

4. **Sign Electron for DRM video (one time).** Netflix, Prime Video, Disney+ and similar services need this, or they refuse to play. Quit the app, then run:

   ```bash
   npm run evs:setup    # installs castLabs' signing tool
   npm run evs:signup   # creates a free castLabs account (email + confirmation code)
   npm run sign:vmp     # signs Electron
   ```

   Run this after the first launch, because that's when Electron is downloaded. Then start the app again.

5. **Connect your phone (optional).** Scan the QR code with your phone's camera. The phone must be on the same Wi‑Fi. To skip, choose **Continue without connecting controller**. The link (`http://<computer's IP>:8765/`) stays the same, so you can bookmark it or add it to your home screen.

## Updating

1. **Stop the app.** Press Ctrl+C in the terminal where it's running.

2. **Pull the latest changes and install any new dependencies:**

   ```bash
   cd tv
   git pull
   npm install
   ```

   If `git pull` complains about local changes, either commit them first or run `git stash` before pulling and `git stash pop` after.

3. **Start the app again** with `npm run dev` or `npm start`.

4. **Re-sign Electron if DRM video stops working.** If the update changed the Electron version, `npm install` replaces it and removes the signature. Launch the app once, quit it, then run `npm run sign:vmp`.

## Quirks

**Setup and launch**

- After reinstalling `node_modules`, launch the app once, then run `npm run sign:vmp` again, because reinstalling removes the signature. Without it, Prime Video says "You are running an old or unsupported version of this browser".

**Phone remote**

- The remote's link stays the same across restarts. It only changes if the computer's IP address on the network changes.
- The remote uses port 8765. If that port is busy, the remote server won't start; set `TV_REMOTE_PORT` to use another port.
- The remote's Power button turns the TV app off and on. The remote server keeps running until you press Ctrl+C in the terminal. In `npm run dev` the Vite dev server keeps running too.
- The QR code shows only while no phone is connected, including a few seconds after the last phone disconnects.
- The link has no password: anyone on the same Wi‑Fi who opens it can use the remote.
- While a phone is connected, the computer's mouse cursor hides after 5 seconds without moving. Move the mouse to bring it back.

**Volume on a TV**

- macOS sometimes turns off its volume control when sound goes to a TV or monitor over HDMI or DisplayPort. The Mac's volume keys don't work there.
- The phone remote's volume still works: it turns down the app's own audio instead. That can only make sound quieter than the TV's setting, never louder. So I recommend to set the TV/monitor volume to the loudest you'd want, then turn it down from the phone.
- The remote's number is how loud it sounds: 50 is half as loud as 100, 1 is 1% as loud.

