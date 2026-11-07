(() => {
  const $ = (selector) => document.querySelector(selector);
  const token = new URLSearchParams(location.search).get('t');
  const haptic = () => navigator.vibrate?.(8);

  /* ---------- Connection ---------- */

  const status = $('#status');
  const statusText = $('#status-text');
  let ws = null;
  let retryTimer = null;
  let failedAttempts = 0;
  let poweredOff = false;

  const setStatus = (state, text) => {
    status.dataset.state = state;
    statusText.textContent = text;
  };

  const send = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  function connect() {
    if (!token) {
      setStatus('error', 'Scan the QR code on the TV');
      return;
    }
    clearTimeout(retryTimer);
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws?t=${encodeURIComponent(token)}`);

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
    };
    ws.onclose = () => {
      ws = null;
      if (poweredOff) return;
      failedAttempts++;
      // A restarted TV app has a new QR code, so this link stops working.
      setStatus('wait', failedAttempts > 3 ? 'Can’t reach TV — rescan its QR code' : 'Reconnecting…');
      retryTimer = setTimeout(connect, 1500);
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws && !poweredOff) connect();
  });

  /* ---------- Trackpad ---------- */

  const pad = $('#trackpad');
  const touchDot = $('#touch-dot');
  const pointers = new Map(); // pointerId -> last { x, y }
  let gesture = null; // { start, travel, fingers }
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

  const showTouch = (x, y) => {
    const r = pad.getBoundingClientRect();
    touchDot.style.transform = `translate(${x - r.left}px, ${y - r.top}px)`;
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) gesture = { start: performance.now(), travel: 0, fingers: 1 };
    else if (gesture) gesture.fingers = Math.max(gesture.fingers, pointers.size);
    pad.classList.add('touching');
    showTouch(e.clientX, e.clientY);
  });

  pad.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
    if (gesture) gesture.travel += Math.abs(dx) + Math.abs(dy);

    if (pointers.size === 1) {
      // Pointer acceleration: slow moves are precise, fast swipes go far.
      const gain = 1.6 + Math.min(Math.hypot(dx, dy) / 6, 2.6);
      pending.mx += dx * gain;
      pending.my += dy * gain;
      showTouch(e.clientX, e.clientY);
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
    }
    gesture = null;
  };
  pad.addEventListener('pointerup', endPointer);
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

  $('#power').addEventListener('click', () => {
    if (!confirm('Turn off the TV app?')) return;
    poweredOff = true;
    send({ t: 'power' });
    clearTimeout(retryTimer);
    setStatus('error', 'Turned off');
    $('#off-screen').hidden = false;
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

  const openKeyboard = () => {
    sheet.hidden = false;
    input.value = '';
    typed = '';
    input.focus(); // must happen inside the tap so the phone keyboard opens
  };
  const closeKeyboard = () => {
    input.blur();
    sheet.hidden = true;
  };

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

  const pressEnter = () => {
    send({ t: 'key', key: 'Enter' });
    input.value = '';
    typed = '';
    haptic();
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
