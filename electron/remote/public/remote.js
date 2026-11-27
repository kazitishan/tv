(() => {
  const $ = (selector) => document.querySelector(selector);
  const haptic = () => navigator.vibrate?.(8);

  /* ---------- Icons ---------- */

  // Each <i data-icon="name"> becomes the SVG from the shared src/icons/
  // folder (served at /icons/), inlined so remote.css can colour and size it.
  // Its classes (like "filled") carry over to the <svg>.
  const iconFiles = new Map();
  for (const placeholder of document.querySelectorAll('i[data-icon]')) {
    const name = placeholder.dataset.icon;
    if (!iconFiles.has(name)) {
      iconFiles.set(name, fetch(`/icons/${name}.svg`).then((res) => (res.ok ? res.text() : Promise.reject())));
    }
    iconFiles
      .get(name)
      .then((text) => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        if (svg.nodeName !== 'svg') return;
        svg.setAttribute('aria-hidden', 'true');
        if (placeholder.className) svg.setAttribute('class', placeholder.className);
        placeholder.replaceWith(document.importNode(svg, true));
      })
      .catch(() => {}); // the button still has its label
  }

  /* ---------- Portrait lock ---------- */

  // A web page can't lock its orientation on a phone (only Android, in
  // fullscreen), so when a phone is turned sideways the page is turned back the
  // other way and stays upright on the phone. While the typing sheet is open it
  // isn't turned, because the phone's keyboard follows the screen and would
  // cover the text box. Touch positions come in screen coordinates, so the
  // trackpad turns them into page coordinates with toPage().
  const root = document.documentElement;
  const isPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  let turn = 0; // how far the page is rotated: 0, -90 or 90 degrees
  screen.orientation?.lock?.('portrait').catch(() => {});

  const screenAngle = () => {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    return ((angle % 360) + 360) % 360;
  };

  const updateTurn = () => {
    const angle = screenAngle();
    const typing = !document.getElementById('sheet').hidden;
    turn = !isPhone || typing ? 0 : angle === 90 ? -90 : angle === 270 ? 90 : 0;
    const width = turn ? innerHeight : innerWidth;
    const height = turn ? innerWidth : innerHeight;
    if (turn) {
      root.dataset.turn = String(turn);
      root.style.setProperty('--page-w', `${width}px`);
      root.style.setProperty('--page-h', `${height}px`);
    } else {
      delete root.dataset.turn;
      root.style.removeProperty('--page-w');
      root.style.removeProperty('--page-h');
    }
    // Compact layout for short pages (a media query would see the screen, not the page).
    root.classList.toggle('short', height <= 640);
  };
  updateTurn();
  addEventListener('resize', updateTurn);
  addEventListener('orientationchange', updateTurn);
  screen.orientation?.addEventListener('change', updateTurn);

  /** A point on the screen (like a touch's clientX/clientY) in the page's own coordinates. */
  const toPage = (x, y) => {
    if (turn === -90) return { x: innerHeight - y, y: x };
    if (turn === 90) return { x: y, y: innerWidth - x };
    return { x, y };
  };

  /* ---------- Connection ---------- */

  const status = $('#status');
  const statusText = $('#status-text');
  let ws = null;
  let retryTimer = null;
  let failedAttempts = 0;
  let tvState = null; // 'off' | 'starting' | 'on' | 'stopping' | 'updating', from the server

  const setStatus = (state, text) => {
    status.dataset.state = state;
    statusText.textContent = text;
  };

  const send = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  function connect() {
    clearTimeout(retryTimer);
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws`);

    ws.onopen = () => {
      failedAttempts = 0;
      setStatus('ok', 'Connected');
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === 'state') applyVolumeState(msg);
      else if (msg.t === 'tv') applyTvState(msg.state);
      else if (msg.t === 'keyboard') applyTvKeyboard(msg.open);
      else if (msg.t === 'textHover') pointerOverTextField = Boolean(msg.over);
    };
    ws.onclose = () => {
      ws = null;
      failedAttempts++;
      // The remote server was stopped in the terminal, or the phone left the Wi-Fi.
      setStatus('wait', failedAttempts > 3 ? 'Can’t reach the TV' : 'Reconnecting…');
      retryTimer = setTimeout(connect, 1500);
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws) connect();
  });

  /* ---------- Power ---------- */

  const offScreen = $('#off-screen');
  const powerOn = $('#power-on');
  const OFF_SCREEN_TEXT = {
    off: ['TV is off', 'Tap to turn it on.'],
    starting: ['Turning on…', 'This takes a few seconds.'],
    stopping: ['Turning off…', ''],
    updating: ['Updating…', 'The TV turns back on by itself when it’s done.'],
  };

  function applyTvState(state) {
    tvState = state;
    const text = OFF_SCREEN_TEXT[state];
    offScreen.hidden = !text;
    if (!text) return;
    $('#off-title').textContent = text[0];
    $('#off-text').textContent = text[1];
    powerOn.disabled = state !== 'off';
  }

  // Power toggles the TV app; the remote server keeps running either way.
  $('#power').addEventListener('click', () => {
    if (!confirm('Turn off the TV?')) return;
    send({ t: 'power' });
    haptic();
  });
  powerOn.addEventListener('click', () => {
    if (tvState !== 'off') return;
    send({ t: 'power' });
    applyTvState('starting'); // until the server confirms
    haptic();
  });

  /* ---------- Trackpad ---------- */

  const pad = $('#trackpad');
  const touchDot = $('#touch-dot');
  const pointers = new Map(); // pointerId -> last { x, y }
  let gesture = null; // { start, travel, fingers }
  let pointerOverTextField = false; // the TV's pointer is over a text field (from the TV)
  const pending = { mx: 0, my: 0, sx: 0, sy: 0 };
  let frame = 0;

  const flush = () => {
    frame = 0;
    if (pending.mx || pending.my) send({ t: 'move', dx: pending.mx, dy: pending.my });
    if (pending.sx || pending.sy) send({ t: 'scroll', dx: pending.sx, dy: pending.sy });
    pending.mx = pending.my = pending.sx = pending.sy = 0;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(flush);
  };

  // x, y in page coordinates (see toPage()).
  const showTouch = (x, y) => {
    const r = pad.getBoundingClientRect();
    const a = toPage(r.left, r.top);
    const b = toPage(r.right, r.bottom);
    touchDot.style.transform = `translate(${x - Math.min(a.x, b.x)}px, ${y - Math.min(a.y, b.y)}px)`;
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    const p = toPage(e.clientX, e.clientY);
    pointers.set(e.pointerId, { x: p.x, y: p.y, turn });
    if (pointers.size === 1) gesture = { start: performance.now(), travel: 0, fingers: 1 };
    else if (gesture) gesture.fingers = Math.max(gesture.fingers, pointers.size);
    pad.classList.add('touching');
    showTouch(p.x, p.y);
  });

  pad.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const p = toPage(e.clientX, e.clientY);
    // The page turned mid-swipe: start again from here instead of jumping.
    const dx = last.turn === turn ? p.x - last.x : 0;
    const dy = last.turn === turn ? p.y - last.y : 0;
    last.x = p.x;
    last.y = p.y;
    last.turn = turn;
    if (gesture) gesture.travel += Math.abs(dx) + Math.abs(dy);

    if (pointers.size === 1) {
      // Pointer acceleration: slow moves are precise, fast swipes go far.
      const gain = 1.6 + Math.min(Math.hypot(dx, dy) / 6, 2.6);
      pending.mx += dx * gain;
      pending.my += dy * gain;
      showTouch(p.x, p.y);
    } else {
      pending.sx += (dx * 3) / pointers.size;
      pending.sy += (dy * 3) / pointers.size;
    }
    schedule();
  });

  const endPointer = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size > 0) return;
    pad.classList.remove('touching');
    const isTap =
      e.type === 'pointerup' &&
      gesture &&
      gesture.fingers === 1 &&
      gesture.travel < 12 &&
      performance.now() - gesture.start < 300;
    if (isTap) {
      flush();
      send({ t: 'click' });
      haptic();
      // Open the keyboard now, inside the tap: the TV's "text field focused"
      // message arrives too late for the phone to show its keyboard.
      if (pointerOverTextField) openKeyboardForTap();
    }
    gesture = null;
  };
  pad.addEventListener('pointerup', endPointer);
  // iPhones show the keyboard reliably only for a focus() in touchend; focus again there.
  pad.addEventListener('touchend', () => {
    if (!sheet.hidden && document.activeElement !== input) input.focus();
  });
  pad.addEventListener('pointercancel', endPointer);

  /* ---------- Buttons ---------- */

  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      send({ t: 'nav', action: button.dataset.nav });
      haptic();
    });
  });

  document.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      send({ t: 'key', key: button.dataset.key });
      haptic();
    });
  });

  /* ---------- Volume ---------- */

  const volumeRow = $('.volume');
  const slider = $('#volume');
  const volumeValue = $('#volume-value');
  let muted = false;
  let dragging = false;
  let volumeTimer = null;

  const renderVolume = () => {
    slider.style.setProperty('--p', `${slider.value}%`);
    volumeValue.textContent = slider.value;
    volumeRow.classList.toggle('muted', muted);
    $('#mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  };

  function applyVolumeState({ volume, muted: isMuted }) {
    muted = Boolean(isMuted);
    if (!dragging && Number.isFinite(volume)) slider.value = volume;
    renderVolume();
  }

  const sendVolume = () => {
    volumeTimer = null;
    send({ t: 'volume', value: Number(slider.value) });
  };

  slider.addEventListener('pointerdown', () => (dragging = true));
  slider.addEventListener('pointerup', () => (dragging = false));
  slider.addEventListener('pointercancel', () => (dragging = false));
  slider.addEventListener('input', () => {
    muted = false;
    renderVolume();
    if (!volumeTimer) volumeTimer = setTimeout(sendVolume, 60);
  });
  slider.addEventListener('change', () => {
    dragging = false;
    clearTimeout(volumeTimer);
    sendVolume();
  });

  $('#mute').addEventListener('click', () => {
    muted = !muted;
    renderVolume();
    send({ t: 'mute', muted });
    haptic();
  });

  /* ---------- Typing ---------- */

  const sheet = $('#sheet');
  const input = $('#type-input');
  let typed = ''; // what the TV has received so far

  const PLACEHOLDER = input.placeholder;

  const openKeyboard = () => {
    sheet.hidden = false;
    updateTurn();
    input.value = '';
    typed = '';
    input.focus(); // opens the phone keyboard only inside a tap (see applyTvKeyboard)
    input.placeholder = document.activeElement === input ? PLACEHOLDER : 'Tap here to type…';
  };
  const closeKeyboard = () => {
    clearTimeout(tapOpenTimer);
    tapOpenTimer = null;
    input.blur();
    sheet.hidden = true;
    updateTurn();
  };

  // Opened by a trackpad tap on a text field, before the TV confirms the field
  // got focus. If it doesn't (the tap missed), close again unless typing started.
  let tapOpenTimer = null;
  const TAP_CONFIRM_MS = 2500;
  function openKeyboardForTap() {
    openKeyboard();
    tapOpenTimer = setTimeout(() => {
      tapOpenTimer = null;
      if (!input.value) closeKeyboard();
    }, TAP_CONFIRM_MS);
  }

  // A text field on the TV got focus (true) or lost it (false). Focus that didn't
  // come from a trackpad tap (the site focused a field itself) opens the sheet
  // without the phone keyboard, since phones only show it for a focus() inside a
  // tap; iPhones then need one tap on the text box.
  function applyTvKeyboard(open) {
    if (open && tapOpenTimer) {
      // The field this tap opened the keyboard for; keep what's been typed.
      clearTimeout(tapOpenTimer);
      tapOpenTimer = null;
    } else if (open) {
      openKeyboard();
    } else if (!sheet.hidden) {
      closeKeyboard();
    }
  }

  input.addEventListener('focus', () => (input.placeholder = PLACEHOLDER));
  $('#open-keyboard').addEventListener('click', openKeyboard);
  $('#close-keyboard').addEventListener('click', closeKeyboard);
  $('#sheet-backdrop').addEventListener('click', closeKeyboard);

  // Send only what changed, so autocorrect and predictive text work too.
  input.addEventListener('input', () => {
    const now = input.value;
    let same = 0;
    while (same < typed.length && same < now.length && typed[same] === now[same]) same++;
    const removed = typed.length - same;
    const added = now.slice(same);
    if (removed > 0) send({ t: 'key', key: 'Backspace', repeat: removed });
    if (added) send({ t: 'text', text: added });
    typed = now;
  });

  // Enter (or the keyboard's Go) submits on the TV and closes the keyboard.
  const pressEnter = () => {
    send({ t: 'key', key: 'Enter' });
    input.value = '';
    typed = '';
    haptic();
    closeKeyboard();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pressEnter();
    } else if (e.key === 'Backspace' && input.value === '') {
      send({ t: 'key', key: 'Backspace' }); // delete text already on the TV
    }
  });

  // Keep the phone keyboard open when tapping these buttons.
  for (const id of ['#key-delete', '#key-enter']) {
    $(id).addEventListener('pointerdown', (e) => e.preventDefault());
  }
  $('#key-delete').addEventListener('click', () => {
    if (input.value) {
      input.value = input.value.slice(0, -1);
      typed = input.value;
    }
    send({ t: 'key', key: 'Backspace' });
    haptic();
  });
  $('#key-enter').addEventListener('click', pressEnter);

  renderVolume();
  connect();
})();
