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

   The first launch is slow: it downloads castLabs' Electron (about 100 MB) and Widevine, the DRM module. The terminal shows `Widevine ready` when it's done.

4. **Sign Electron for DRM video (one time).** Netflix, Prime Video, Disney+ and similar services need this, or they refuse to play. Quit the app, then run:

   ```bash
   npm run evs:setup    # installs castLabs' signing tool
   npm run evs:signup   # creates a free castLabs account (email + confirmation code)
   npm run sign:vmp     # signs Electron
   ```

   Run this after the first launch, because that's when Electron is downloaded. Then start the app again.

5. **Connect your phone (optional).** Scan the QR code with your phone's camera. The phone must be on the same Wi‑Fi. To skip, choose **Continue without connecting controller**.

## Quirks

**Setup and launch**

- After reinstalling `node_modules`, launch the app once, then run `npm run sign:vmp` again, because reinstalling removes the signature. Without it, Prime Video says "You are running an old or unsupported version of this browser".

**Phone remote**

- The QR code changes every launch. After restarting the app, scan it again.
- The remote uses port 8765, or another free port if 8765 is busy.
- The remote's Power button quits the app. In `npm run dev` it stops the dev server too.
- While a phone is connected, the computer's mouse cursor hides after 5 seconds without moving. Move the mouse to bring it back.

**Volume on a TV**

- macOS sometimes turns off its volume control when sound goes to a TV or monitor over HDMI or DisplayPort. The Mac's volume keys don't work there.
- The phone remote's volume still works: it turns down the app's own audio instead. That can only make sound quieter than the TV's setting, never louder. So I recommend to set the TV/monitor volume to the loudest you'd want, then turn it down from the phone.
- The remote's number is how loud it sounds: 50 is half as loud as 100, 1 is 1% as loud.

