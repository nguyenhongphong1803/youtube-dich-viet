/*
 * injected.js — chạy trong world "MAIN" (cùng ngữ cảnh JS với trang YouTube).
 *
 * Nhiệm vụ:
 *  1. Hook window.fetch và XMLHttpRequest để bắt URL /api/timedtext mà player YouTube gửi
 *     (URL này chứa token `pot`, tự dựng URL thì YouTube thường trả rỗng).
 *  2. Trả lời yêu cầu từ content script (world ISOLATED) qua window.postMessage:
 *     - get-tracks: danh sách captionTracks của video hiện tại
 *     - get-captured: các URL timedtext đã bắt được trước khi content script sẵn sàng
 *     - enable-captions: bật phụ đề trên player để player tự tải timedtext
 *
 * Mọi thứ đều bọc try/catch để không bao giờ làm hỏng trang YouTube.
 */
(() => {
  'use strict';
  if (window.__ytdvInjected) return;
  window.__ytdvInjected = true;

  const TAG = '__ytdv';
  const LOG = '[YT-Dịch]';
  const MAX_CAPTURED = 20;
  const captured = []; // các URL timedtext đã bắt được (mới nhất ở cuối)

  function post(data) {
    try {
      window.postMessage(Object.assign({ [TAG]: true, dir: 'to-cs' }, data), location.origin);
    } catch (e) {
      /* bỏ qua */
    }
  }

  // Ghi nhận một URL nếu là request timedtext
  function report(input) {
    try {
      if (!input) return;
      let s = null;
      if (typeof input === 'string') s = input;
      else if (input instanceof URL) s = input.href;
      else if (typeof input === 'object' && typeof input.url === 'string') s = input.url; // Request
      if (!s || s.indexOf('/api/timedtext') === -1) return;
      const abs = new URL(s, location.href).href;
      if (captured[captured.length - 1] !== abs) {
        captured.push(abs);
        if (captured.length > MAX_CAPTURED) captured.shift();
      }
      post({ type: 'timedtext', url: abs });
    } catch (e) {
      /* bỏ qua */
    }
  }

  // ---- Hook fetch ----
  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      const wrappedFetch = function (input, init) {
        report(input);
        return origFetch.apply(this, arguments);
      };
      try {
        wrappedFetch.toString = () => origFetch.toString();
      } catch (e) {
        /* bỏ qua */
      }
      window.fetch = wrappedFetch;
    }
  } catch (e) {
    console.warn(LOG, 'Không hook được fetch', e);
  }

  // ---- Hook XMLHttpRequest ----
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      report(url);
      return origOpen.apply(this, arguments);
    };
  } catch (e) {
    console.warn(LOG, 'Không hook được XMLHttpRequest', e);
  }

  // ---- Truy cập player ----
  function getPlayer(playerId) {
    return (
      (playerId && document.getElementById(playerId)) ||
      document.getElementById('movie_player') ||
      document.querySelector('.html5-video-player')
    );
  }

  function getPlayerResponse(player) {
    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        const r = player.getPlayerResponse();
        if (r) return r;
      }
    } catch (e) {
      /* bỏ qua */
    }
    return window.ytInitialPlayerResponse || null;
  }

  function trackName(t) {
    try {
      if (!t.name) return t.languageCode;
      if (t.name.simpleText) return t.name.simpleText;
      if (Array.isArray(t.name.runs)) return t.name.runs.map((r) => r.text).join('');
    } catch (e) {
      /* bỏ qua */
    }
    return t.languageCode;
  }

  function getTracks(playerId) {
    const player = getPlayer(playerId);
    const pr = getPlayerResponse(player);
    if (!pr) return null;
    const videoId = (pr.videoDetails && pr.videoDetails.videoId) || null;
    const list =
      (pr.captions &&
        pr.captions.playerCaptionsTracklistRenderer &&
        pr.captions.playerCaptionsTracklistRenderer.captionTracks) ||
      [];
    let current = null;
    try {
      if (player && typeof player.getOption === 'function') {
        const cur = player.getOption('captions', 'track');
        if (cur && cur.languageCode) current = { languageCode: cur.languageCode, kind: cur.kind || '' };
      }
    } catch (e) {
      /* bỏ qua */
    }
    return {
      videoId,
      current,
      tracks: list.map((t) => ({
        baseUrl: t.baseUrl || '',
        languageCode: t.languageCode || '',
        kind: t.kind || '',
        name: trackName(t),
        vssId: t.vssId || '',
        isTranslatable: !!t.isTranslatable,
      })),
    };
  }

  function enableCaptions(playerId, languageCode, kind) {
    const p = getPlayer(playerId);
    if (!p) return { ok: false };
    try {
      if (typeof p.loadModule === 'function') p.loadModule('captions');
    } catch (e) {
      /* bỏ qua */
    }
    let ok = false;
    try {
      if (typeof p.setOption === 'function' && languageCode) {
        let track = null;
        try {
          const list = p.getOption('captions', 'tracklist') || [];
          track =
            list.find((t) => t.languageCode === languageCode && (t.kind || '') === (kind || '')) ||
            list.find((t) => t.languageCode === languageCode) ||
            null;
        } catch (e) {
          /* bỏ qua */
        }
        if (!track) {
          track = { languageCode };
          if (kind) track.kind = kind;
        }
        p.setOption('captions', 'track', track);
        ok = true;
      }
    } catch (e) {
      /* bỏ qua */
    }
    try {
      if (!ok && typeof p.toggleSubtitlesOn === 'function') {
        p.toggleSubtitlesOn();
        ok = true;
      }
    } catch (e) {
      /* bỏ qua */
    }
    return { ok };
  }

  // ---- Nhận yêu cầu từ content script ----
  window.addEventListener('message', (ev) => {
    try {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d[TAG] !== true || d.dir !== 'to-main') return;
      let result = null;
      switch (d.action) {
        case 'get-tracks':
          result = getTracks(d.playerId);
          break;
        case 'get-captured':
          result = captured.slice();
          break;
        case 'enable-captions':
          result = enableCaptions(d.playerId, d.languageCode, d.kind);
          break;
        default:
          return;
      }
      post({ type: 'response', id: d.id, result });
    } catch (e) {
      try {
        post({ type: 'response', id: ev.data && ev.data.id, result: null });
      } catch (e2) {
        /* bỏ qua */
      }
    }
  });
})();
