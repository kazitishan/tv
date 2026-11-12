# TV

Turn any PC or laptop into a TV with built-in ad blocking, and use your phone as the remote.

## Before setting up

Make sure you have Node.js and Git downloaded

**Node.js**: download the **LTS** installer from [nodejs.org](https://nodejs.org/) and run it.

**Git**:

- **Mac:** open Terminal and run `xcode-select --install`, then click **Install**.
- **Windows:** download the installer from [git-scm.com](https://git-scm.com/downloads) and run it. The default options are fine.

## Setting up

**1. Download and install the app**

```bash
git clone https://github.com/kazitishan/tv tv
cd tv
npm install
```

**2. Start it**

```bash
npm run dev    # development, with live reload for the UI
npm start      # or: build and run the production version
```

The first launch takes a few minutes, because it downloads the video player. Leave the terminal open while you use the TV. To stop the app completely, press **Ctrl+C** in the terminal.

**3. Connect your phone (optional)**

Scan the QR code on the TV with your phone's camera. Your phone needs to be on the same Wi‑Fi as the computer. Bookmark the page so you can open the remote again later.

**4. Turn on DRM video (one time)**

Netflix, Prime Video, Disney+ and similar services won't play video until you do this. Without it, you may see something like "You are running an old or unsupported version of this browser".

Do this after the app has launched once. Make sure Python is downloaded from [python.org](https://www.python.org/downloads/). Quit the app with **Ctrl+C**, then run:

```bash
npm run evs:setup
npm run evs:signup
npm run sign:vmp
```

`evs:signup` creates a free castLabs account: enter your email, then the code they send you. Then run `npm start` again.

If DRM video stops working after an update, run `npm run sign:vmp` again.

## Updating

Click the **gear** at the top right of the TV's home screen. If there's an update, click **Update and restart**. This will pull the latest changes from this repo and update the ad-blocker.

## Volume on a TV

- On a Mac, the volume keys may stop working when sound goes to a TV or monitor over HDMI or DisplayPort.
- The phone remote's volume works anyway, but it can only make sound quieter than the TV's own setting, not louder. Set the TV or monitor volume to the loudest you'd want, then turn it down from your phone.

## Keeping the laptop closed

While the app is running, the computer won't go to sleep on its own, and the screen stays on while the TV is on. Closing the lid still puts it to sleep unless you do this:

**Windows:** run this in Command Prompt:

```bat
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```

To undo it, run the same commands with `1` instead of `0`.

**Mac:** use clamshell mode. Connect the charger, the TV or monitor, and an external keyboard and mouse, then close the lid. Without the keyboard and mouse, the Mac goes to sleep when you close the lid.
