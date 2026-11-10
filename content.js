/*
 * content.js — chạy trong world ISOLATED trên www.youtube.com.
 *
 * Luồng chính cho mỗi video:
 *  1. Hỏi injected.js (MAIN world) danh sách captionTracks và các URL timedtext đã bắt được.
 *  2. Nếu chưa có URL: bật phụ đề trên player để player tự gửi request timedtext (có token pot),
 *     injected.js bắt URL và gửi sang đây.
 *  3. Nguồn phụ đề theo thứ tự ưu tiên:
 *     a. URL bắt được + fmt=json3 + tlang=vi  -> YouTube dịch sẵn.
 *     b. json3 gốc -> gộp câu -> dịch qua background (Google Translate).
 *     c. MutationObserver theo dõi phụ đề YouTube đang hiển thị, dịch từng dòng đã "chốt" (chế độ trực tiếp).
 *  4. Vòng đồng bộ theo video.currentTime: hiển thị overlay + đọc TTS + giảm âm lượng tiếng gốc.
 *     Khi player đang chiếu quảng cáo thì không hiện, không đọc, không giảm âm lượng.
 */
(() => {
  'use strict';
  if (window.__ytdvContentLoaded) return;
  window.__ytdvContentLoaded = true;

  const LOG = '[YT-Dịch]';
  const TAG = '__ytdv';

  // Khóa cài đặt — phải khớp với popup.js
  const DEFAULTS = {
    enabled: true,
    showSub: true,
    bilingual: false,
    speak: true,
    rate: 1.2,
    duckVolume: 20,
    fontSize: 24,
    voiceName: '',
  };

  const TICK_MS = 150;
  const CHARS_PER_SEC = 14; // tốc độ đọc ước lượng của giọng máy tiếng Việt ở rate 1.0
  const BATCH_MAX_ENCODED = 3500; // độ dài tối đa (đã encode) của 1 lô dịch -> URL < ~4000 ký tự
  const BATCH_MAX_ITEMS = 60;

  const log = (...a) => console.log(LOG, ...a);
  const warn = (...a) => console.warn(LOG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  let settings = Object.assign({}, DEFAULTS);

  // ======================================================================
  // Giao tiếp với background
  // ======================================================================
  function sendBg(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false });
        });
      } catch (e) {
        // Thường xảy ra khi extension vừa được tải lại (context invalidated)
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  // ======================================================================
  // Giao tiếp với injected.js (MAIN world)
  // ======================================================================
  let reqSeq = 0;
  const pending = new Map();

  function callMain(action, payload = {}, timeout = 2500) {
    return new Promise((resolve) => {
      const id = ++reqSeq;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, timeout);
      pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      try {
        window.postMessage(Object.assign({ [TAG]: true, dir: 'to-main', id, action }, payload), location.origin);
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        resolve(null);
      }
    });
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d[TAG] !== true || d.dir !== 'to-cs') return;
    if (d.type === 'timedtext') {
      onCapturedUrl(d.url);
    } else if (d.type === 'response') {
      const cb = pending.get(d.id);
      if (cb) {
        pending.delete(d.id);
        cb(d.result);
      }
    }
  });

  // ======================================================================
  // Tiện ích trang
  // ======================================================================
  function isShorts() {
    return location.pathname.startsWith('/shorts/');
  }

  function currentVideoId() {
    try {
      const u = new URL(location.href);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function getPlayerEl() {
    if (isShorts()) {
      return document.querySelector('#shorts-player') || document.querySelector('ytd-reel-video-renderer[is-active] .html5-video-player');
    }
    return document.querySelector('#movie_player');
  }

  function getVideo() {
    const p = getPlayerEl();
    return p ? p.querySelector('video') : null;
  }

  /** Player đang chiếu quảng cáo (currentTime lúc này là của quảng cáo, không phải của video). */
  function isAdShowing() {
    const p = getPlayerEl();
    return !!(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')));
  }

  async function waitFor(fn, timeout = 10000, interval = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const r = fn();
        if (r) return r;
      } catch (e) {
        /* bỏ qua */
      }
      await sleep(interval);
    }
    return null;
  }

  // ======================================================================
  // Trạng thái theo video
  // ======================================================================
  const capturedUrls = new Map(); // videoId -> URL timedtext mới nhất

  function newState(videoId) {
    return {
      videoId,
      tracks: null,
      cues: [], // [{start, end, text (Việt; null = chưa có bản dịch thật), orig (câu gốc), tries}]
      origCues: [], // phụ đề gốc (dùng cho song ngữ ở nguồn a)
      source: null, // 'youtube' | 'youtube-vi' | 'google' | 'live'
      trackKey: null,
      loading: false,
      loaded: false,
      spokenIdx: -1,
      live: null,
      failedUrls: new Set(), // URL đã thử mà không lấy được phụ đề
      gen: 0, // số thế hệ: tăng mỗi lần tải lại phụ đề -> vòng dịch dần cũ tự dừng
      pendingUrl: null, // URL track mới đến khi đang loading, xử lý sau khi tải xong
    };
  }

  let state = newState(null);

  function trackKeyOf(url) {
    try {
      const u = new URL(url, location.origin);
      return (u.searchParams.get('lang') || '') + '|' + (u.searchParams.get('kind') || '');
    } catch (e) {
      return '';
    }
  }

  function onCapturedUrl(url) {
    let vid = null;
    try {
      const u = new URL(url);
      if (u.hostname !== 'www.youtube.com' || u.pathname !== '/api/timedtext') return;
      vid = u.searchParams.get('v');
    } catch (e) {
      return;
    }
    if (!vid) return;
    // delete trước rồi set để key mới nhất nằm cuối Map (thứ tự LRU đúng)
    capturedUrls.delete(vid);
    capturedUrls.set(vid, url);
    if (capturedUrls.size > 30) capturedUrls.delete(capturedUrls.keys().next().value);

    if (!settings.enabled || state.videoId !== vid) return;
    const st = state;
    if (st.loading) {
      // Đang tải track khác: ghi nhớ, xử lý ngay sau khi tải xong (xem loadFromUrl)
      st.pendingUrl = url;
      return;
    }
    if (!st.loaded) {
      loadFromUrl(st, url);
    } else if (st.source !== 'live' && st.trackKey && trackKeyOf(url) !== st.trackKey) {
      // Người dùng đổi ngôn ngữ phụ đề trên player -> tải lại theo track mới
      log('Phát hiện đổi track phụ đề, tải lại', trackKeyOf(url));
      loadFromUrl(st, url);
    }
  }

  // ======================================================================
  // Phân tích json3 + gộp câu
  // ======================================================================
  function parseJson3(json) {
    const events = (json && json.events) || [];
    const out = [];
    for (const ev of events) {
      if (!ev || !Array.isArray(ev.segs)) continue;
      const text = ev.segs
        .map((s) => (s && s.utf8) || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const start = Number(ev.tStartMs) || 0;
      const dur = Number(ev.dDurationMs) || 0;
      out.push({ start, end: start + dur, text });
    }
    out.sort((a, b) => a.start - b.start);
    // Gộp các cue có cùng thời điểm start (vd. 2 dòng hiển thị cùng lúc): nối text bằng dấu cách,
    // lấy end lớn nhất. Nếu không gộp, findCue chỉ thấy cue cuối và dòng kia bị mất.
    const merged = [];
    for (const c of out) {
      const last = merged[merged.length - 1];
      if (last && last.start === c.start) {
        last.text += ' ' + c.text;
        last.end = Math.max(last.end, c.end);
      } else {
        merged.push(c);
      }
    }
    // Chuẩn hóa: không để câu trước đè lên câu sau (phụ đề asr "cuộn" hay chồng thời gian)
    for (let i = 0; i < merged.length; i++) {
      const c = merged[i];
      if (c.end <= c.start) c.end = c.start + 2000;
      const next = merged[i + 1];
      if (next && c.end > next.start && next.start > c.start) c.end = next.start;
    }
    return merged;
  }

  /** Gộp các mảnh ngắn (đặc biệt phụ đề tự động) thành câu ~3–6 giây, ưu tiên ngắt theo dấu câu. */
  function mergeCues(cues) {
    const MAX_DUR = 6000;
    const GAP = 1500;
    const out = [];
    let cur = null;
    for (const c of cues) {
      if (!cur) {
        cur = Object.assign({}, c);
        continue;
      }
      const gap = c.start - cur.end;
      const dur = cur.end - cur.start;
      const endsSentence = /[.!?…。！？]["'”’)\]]*$/.test(cur.text);
      const endsClause = /[,;:，、]["'”’)\]]*$/.test(cur.text);
      const wouldBe = Math.max(cur.end, c.end) - cur.start;
      if (gap > GAP || wouldBe > MAX_DUR || (endsSentence && dur >= 1200) || (endsClause && dur >= 3000)) {
        out.push(cur);
        cur = Object.assign({}, c);
      } else {
        cur.text += ' ' + c.text;
        cur.end = Math.max(cur.end, c.end);
      }
    }
    if (cur) out.push(cur);
    // Giữ phụ đề hiển thị liền mạch nếu khoảng trống giữa 2 câu rất ngắn
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1].start - out[i].end;
      if (gap > 0 && gap < 1000) out[i].end = out[i + 1].start;
    }
    return out;
  }

  async function fetchJson3(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text || !text.trim()) throw new Error('Phản hồi rỗng');
    return JSON.parse(text);
  }

  // ======================================================================
  // Tải phụ đề từ URL timedtext (nguồn a, rồi b)
  // ======================================================================
  async function loadFromUrl(st, rawUrl) {
    if (st.loading || st.failedUrls.has(rawUrl)) return false;
    const ok = await loadFromUrlInner(st, rawUrl);
    if (!ok && st === state) st.failedUrls.add(rawUrl);
    // URL track mới đến trong lúc đang tải -> xử lý bây giờ (onCapturedUrl tự bỏ qua nếu cùng track)
    const next = st.pendingUrl;
    st.pendingUrl = null;
    if (next && next !== rawUrl && st === state) setTimeout(() => onCapturedUrl(next), 0);
    return ok;
  }

  async function loadFromUrlInner(st, rawUrl) {
    if (st.loading) return false;
    st.loading = true;
    try {
      const u = new URL(rawUrl, location.origin);
      const lang = (u.searchParams.get('lang') || '').toLowerCase();
      const isAsr = u.searchParams.get('kind') === 'asr';
      const isVi = lang === 'vi' || lang.startsWith('vi-');
      u.searchParams.set('fmt', 'json3');
      u.searchParams.delete('tlang');
      const origUrl = u.href;

      // Phụ đề gốc (cần cho nhánh b và cho chế độ song ngữ)
      let orig = null;
      try {
        orig = parseJson3(await fetchJson3(origUrl));
        if (isAsr) orig = mergeCues(orig);
      } catch (e) {
        warn('Không tải được phụ đề gốc json3', e && e.message);
      }
      if (st !== state) return false;

      if (isVi) {
        if (!orig || !orig.length) return false;
        st.cues = orig.map((c) => ({ start: c.start, end: c.end, text: c.text, orig: '' }));
        st.origCues = [];
        st.source = 'youtube-vi';
      } else {
        // Nhánh a: YouTube tự dịch (tlang=vi)
        let vi = null;
        try {
          u.searchParams.set('tlang', 'vi');
          vi = parseJson3(await fetchJson3(u.href));
          if (isAsr) vi = mergeCues(vi);
        } catch (e) {
          warn('Không lấy được bản dịch tlang=vi của YouTube, chuyển sang Google Translate', e && e.message);
        }
        if (st !== state) return false;

        if (vi && vi.length) {
          st.cues = vi.map((c) => ({ start: c.start, end: c.end, text: c.text, orig: '' }));
          st.origCues = orig || [];
          st.source = 'youtube';
        } else if (orig && orig.length) {
          // Nhánh b: tự dịch
          st.cues = orig.map((c) => ({ start: c.start, end: c.end, text: null, orig: c.text }));
          st.origCues = [];
          st.source = 'google';
        } else {
          return false;
        }
      }

      st.trackKey = trackKeyOf(rawUrl);
      st.loaded = true;
      st.spokenIdx = -1;
      st.gen++; // vòng dịch dần của track cũ (nếu còn chạy) sẽ tự dừng
      stopLiveMode(st);
      applyCaptionHiding();
      log(`Đã tải ${st.cues.length} câu phụ đề (nguồn: ${st.source}, track: ${st.trackKey})`);
      if (st.source === 'google') {
        showNotice('Đang dịch phụ đề sang tiếng Việt…', 3000);
        translateCuesProgressive(st, st.gen); // chạy nền, không chờ
      }
      return true;
    } catch (e) {
      warn('Lỗi tải phụ đề', e);
      return false;
    } finally {
      st.loading = false;
    }
  }

  /**
   * Dịch dần các câu theo lô, ưu tiên lô gần thời điểm đang xem.
   * - Câu gốc ở c.orig; c.text chỉ được gán khi có bản dịch thật (null = chưa dịch được).
   * - Lỗi (kể cả 429): tăng failures, chờ giãn dần (5s, 15s, 30s) rồi thử lại các câu chưa dịch.
   * - gen: khi track đổi (st.gen tăng) hoặc đổi video, vòng này tự dừng sau mỗi await.
   */
  async function translateCuesProgressive(st, gen) {
    const cues = st.cues;
    const alive = () => st === state && st.gen === gen && st.cues === cues && settings.enabled;
    const MAX_TRIES = 3; // số lần thử tối đa cho một câu bị lỗi riêng lẻ (Google trả rỗng…)
    const BACKOFF_MS = [5000, 15000, 30000];
    const pendingCue = (c) => c.text == null && (c.tries || 0) < MAX_TRIES;

    /** Lô kế tiếp: bắt đầu từ câu chưa dịch gần thời điểm đang xem, lấy tiếp các câu chưa dịch phía sau. */
    function nextBatch() {
      const v = getVideo();
      const now = v ? v.currentTime * 1000 : 0;
      let first = cues.findIndex((c) => pendingCue(c) && c.end >= now);
      if (first < 0) first = cues.findIndex(pendingCue);
      if (first < 0) return null;
      const b = { idxs: [], texts: [], size: 0 };
      for (let i = first; i < cues.length; i++) {
        const c = cues[i];
        if (!pendingCue(c)) continue;
        const enc = encodeURIComponent(c.orig).length + 3;
        if (b.idxs.length && (b.size + enc > BATCH_MAX_ENCODED || b.idxs.length >= BATCH_MAX_ITEMS)) break;
        b.idxs.push(i);
        b.texts.push(c.orig);
        b.size += enc;
      }
      return b;
    }

    let failures = 0;
    for (;;) {
      if (!alive()) return;
      const b = nextBatch();
      if (!b) break;
      const res = await sendBg({ type: 'translate', texts: b.texts });
      if (!alive()) return;
      if (res && res.ok && Array.isArray(res.result)) {
        failures = 0;
        b.idxs.forEach((ci, k) => {
          const c = cues[ci];
          const tr = res.result[k];
          if (typeof tr === 'string' && tr.trim()) c.text = tr.trim();
          else c.tries = (c.tries || 0) + 1; // câu lỗi riêng lẻ: để null, thử lại ở lô sau
        });
        await sleep(300); // nghỉ ngắn giữa các lô để giảm nguy cơ bị giới hạn
      } else {
        failures++;
        const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
        warn(`Dịch lô lỗi (lần ${failures}${res && res.status ? ', HTTP ' + res.status : ''}), thử lại sau ${wait / 1000}s`, res && res.error);
        if (failures >= 2 || (res && res.status === 429)) {
          showNotice('Dịch đang bị giới hạn, thử lại sau…', 5000);
        }
        await sleep(wait);
      }
    }
    if (!alive()) return;
    const missing = cues.filter((c) => c.text == null).length;
    if (missing) log(`Đã dịch xong, còn ${missing} câu không dịch được (hiện câu gốc)`);
    else log('Đã dịch xong toàn bộ phụ đề');
  }

  // ======================================================================
  // Chọn track và bật phụ đề trên player
  // ======================================================================
  function pickTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    const manual = tracks.filter((t) => t.kind !== 'asr');
    const asr = tracks.find((t) => t.kind === 'asr');
    const isVi = (t) => /^vi(-|$)/i.test(t.languageCode);
    return (
      manual.find(isVi) ||
      (asr && manual.find((t) => t.languageCode.split('-')[0] === asr.languageCode.split('-')[0])) ||
      manual[0] ||
      asr ||
      tracks[0]
    );
  }

  // true nếu chính extension đã bật phụ đề (CC) trên player -> tắt lại khi tắt extension / rời video
  let ccEnabledByUs = false;

  function clickSubtitlesButtonIfOff() {
    try {
      const p = getPlayerEl();
      const btn = p && p.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'false' && btn.offsetParent !== null) {
        btn.click();
        ccEnabledByUs = true;
        log('Đã bấm nút phụ đề (CC) để player tải phụ đề');
      }
    } catch (e) {
      /* bỏ qua */
    }
  }

  /** Trả lại trạng thái CC như trước khi extension bật (chỉ khi chính extension đã bật nó). */
  function restoreCaptionsState() {
    if (!ccEnabledByUs) return;
    ccEnabledByUs = false;
    try {
      const p = document.querySelector('#movie_player') || getPlayerEl();
      const btn = p && p.querySelector('.ytp-subtitles-button');
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        btn.click();
        log('Đã tắt lại phụ đề (CC) mà extension đã bật');
      }
    } catch (e) {
      /* bỏ qua */
    }
  }

  // ======================================================================
  // Khởi động cho từng video
  // ======================================================================
  async function run(st) {
    const ok = await waitFor(() => st !== state || (getPlayerEl() && getVideo()), 20000);
    if (st !== state || !ok) return;
    ensureOverlay();

    const playerId = (getPlayerEl() || {}).id || 'movie_player';

    // Chờ lần tải đang chạy (nếu có) kết thúc; trả về true nếu không cần làm tiếp
    const settled = async () => {
      if (st.loading) await waitFor(() => st !== state || !st.loading, 30000);
      return st !== state || st.loaded;
    };
    const usableUrl = () => {
      const u = capturedUrls.get(st.videoId);
      return u && !st.failedUrls.has(u) ? u : null;
    };

    // URL timedtext đã bắt trước khi content script sẵn sàng
    const early = await callMain('get-captured');
    if (st !== state) return;
    if (Array.isArray(early)) early.forEach((u) => onCapturedUrl(u));
    if (await settled()) return;

    // Danh sách track
    let info = null;
    for (let i = 0; i < 12; i++) {
      info = await callMain('get-tracks', { playerId });
      if (st !== state) return;
      if (info && info.videoId === st.videoId) break;
      info = null;
      await sleep(500);
    }
    st.tracks = info ? info.tracks : null;
    if (await settled()) return;

    if (info && info.tracks.length === 0) {
      log('Video không có phụ đề');
      showNotice('Video này không có phụ đề để dịch', 8000);
      return;
    }

    const pick = pickTrack(st.tracks);
    if (!usableUrl()) {
      // Chỉ đổi track khi player chưa bật phụ đề, để tôn trọng lựa chọn của người dùng
      const alreadyOn = info && info.current && info.current.languageCode;
      if (pick && !alreadyOn) {
        const r = await callMain('enable-captions', { playerId, languageCode: pick.languageCode, kind: pick.kind });
        if (r && r.ok) ccEnabledByUs = true;
      }
      await sleep(1500);
      if (await settled()) return;
      if (!usableUrl()) clickSubtitlesButtonIfOff();
    }

    await waitFor(() => st !== state || st.loaded || st.loading || usableUrl(), 7000);
    if (await settled()) return;
    const url = usableUrl();
    if (url && (await loadFromUrl(st, url))) return;
    if (st !== state || st.loaded) return;

    // Thử baseUrl trực tiếp (có thể không chạy nếu YouTube đòi token pot)
    if (pick && pick.baseUrl) {
      if (await loadFromUrl(st, pick.baseUrl)) return;
      if (st !== state || st.loaded) return;
    }

    // Nhánh c: dịch trực tiếp phụ đề đang hiển thị
    startLiveMode(st);
  }

  function teardownVideo() {
    stopSpeaking(); // đồng thời khôi phục âm lượng
    stopLiveMode(state);
    renderOverlay('', '');
    // Gỡ class ẩn phụ đề gốc ở mọi player
    document.querySelectorAll('.ytdv-hide-cc').forEach((el) => el.classList.remove('ytdv-hide-cc'));
  }

  function startForVideo(vid) {
    teardownVideo();
    if (!vid) restoreCaptionsState(); // rời trang video
    state = newState(vid);
    if (!vid || !settings.enabled) return;
    log('Bắt đầu cho video', vid);
    run(state).catch((e) => warn('Lỗi khởi động', e));
  }

  function checkNavigation() {
    if (!settings.enabled) return;
    const vid = currentVideoId();
    if (vid !== state.videoId) startForVideo(vid);
  }

  // ======================================================================
  // Nhánh c: chế độ dịch trực tiếp (MutationObserver)
  //
  // Chỉ dịch một dòng khi dòng đó đã "chốt":
  //  - bị đẩy lên (không còn là dòng cuối) hoặc biến mất khỏi màn hình;
  //  - hoặc là dòng cuối nhưng đứng yên >= 1 giây;
  //  - hoặc kết thúc bằng dấu câu.
  // Các dòng đã chốt vào hàng đợi, gửi dịch tối đa ~1 request/giây (gộp nhiều dòng một lần).
  // Đọc bằng bản dịch của cả dòng đã chốt. Dịch lỗi thì không ẩn phụ đề gốc.
  // ======================================================================
  const liveCache = new Map();
  const LIVE_THROTTLE_MS = 200; // gom các thay đổi DOM liên tiếp (không reset -> không bị trì hoãn vô hạn)
  const LIVE_STABLE_MS = 1000; // dòng cuối đứng yên >= 1s thì coi là đã chốt
  const LIVE_MIN_REQ_GAP = 1000; // tối đa ~1 request dịch mỗi giây
  const LIVE_MAX_ITEMS = 5; // số dòng tối đa gộp trong 1 request
  const LIVE_SPEAK_DEBOUNCE = 500; // gom các bản dịch đến gần nhau thành 1 lần đọc
  const LIVE_SPEAK_MAX_WAIT = 2500; // nhưng không chờ đọc quá 2,5 giây
  const LIVE_SHOW_MS = 4000; // giữ bản dịch trên màn hình thêm một lúc sau khi phụ đề gốc biến mất
  const LIVE_BACKOFF_MS = [5000, 15000, 30000];
  const ENDS_PUNCT = /[.!?…。！？]["'”’)\]]*$/;

  function cacheLive(text, vi) {
    liveCache.delete(text);
    liveCache.set(text, vi);
    if (liveCache.size > 500) liveCache.delete(liveCache.keys().next().value);
  }

  function readCaptionLines(player) {
    const container = player.querySelector('.ytp-caption-window-container');
    if (!container) return [];
    let els = container.querySelectorAll('.caption-visual-line');
    if (!els.length) els = container.querySelectorAll('.ytp-caption-segment');
    return Array.from(els)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function startLiveMode(st) {
    if (st.live || st !== state) return;
    const player = getPlayerEl();
    if (!player) return;
    const live = {
      obs: null,
      timer: null, // throttle xử lý thay đổi DOM
      stableTimer: null, // hẹn chốt dòng cuối khi đứng yên
      workTimer: null, // hẹn gửi request dịch kế tiếp (giới hạn tần suất)
      speakTimer: null,
      lines: [], // các dòng đang hiển thị ở lần đọc DOM trước
      committed: [], // các dòng đã chốt gần đây (chống chốt trùng)
      queue: [], // [{ text, speak }] chờ dịch
      busy: false,
      lastReqAt: 0,
      failures: 0,
      blockedUntil: 0, // đang backoff sau lỗi dịch
      healthy: false, // true khi dịch đang chạy tốt -> mới ẩn phụ đề gốc
      shown: [], // bản dịch các dòng đã chốt gần nhất (tối đa 2)
      shownAt: 0,
      orig: '',
      speakBuf: [],
      speakSince: 0,
    };
    st.live = live;
    st.source = 'live';
    live.obs = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        const el = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        if (el && el.closest && el.closest('.ytp-caption-window-container')) {
          relevant = true;
          break;
        }
      }
      if (!relevant || live.timer) return;
      live.timer = setTimeout(() => {
        live.timer = null;
        processLive(st);
      }, LIVE_THROTTLE_MS);
    });
    live.obs.observe(player, { childList: true, subtree: true, characterData: true });
    applyCaptionHiding(); // chưa ẩn phụ đề gốc cho tới khi dịch thành công
    log('Chuyển sang chế độ dịch trực tiếp phụ đề đang hiển thị');
    showNotice('Đang dịch trực tiếp phụ đề hiển thị trên video', 4000);
    clickSubtitlesButtonIfOff();
  }

  function stopLiveMode(st) {
    if (!st || !st.live) return;
    const live = st.live;
    try {
      live.obs && live.obs.disconnect();
    } catch (e) {
      /* bỏ qua */
    }
    clearTimeout(live.timer);
    clearTimeout(live.stableTimer);
    clearTimeout(live.workTimer);
    clearTimeout(live.speakTimer);
    st.live = null;
  }

  function setLiveHealthy(live, ok) {
    if (live.healthy === ok) return;
    live.healthy = ok;
    applyCaptionHiding();
  }

  function processLive(st) {
    const live = st.live;
    if (!live || st !== state || isAdShowing()) return;
    const player = getPlayerEl();
    if (!player) return;
    const lines = readCaptionLines(player);
    const prev = live.lines;
    live.lines = lines;
    live.orig = lines.join(' ');

    // 1) Dòng cũ đã biến mất (bị đẩy khỏi màn hình) và không phải đang "mọc thêm chữ" -> chốt
    for (const p of prev) {
      if (!lines.some((l) => l.startsWith(p))) commitLine(st, p);
    }
    // 2) Mọi dòng không phải dòng cuối đều đã bị đẩy lên -> chốt
    for (let i = 0; i < lines.length - 1; i++) commitLine(st, lines[i]);
    // 3) Dòng cuối: có dấu câu thì chốt ngay; nếu không, chốt khi đứng yên >= 1 giây
    const last = lines.length ? lines[lines.length - 1] : '';
    const prevLast = prev.length ? prev[prev.length - 1] : '';
    if (last && ENDS_PUNCT.test(last)) {
      clearTimeout(live.stableTimer);
      commitLine(st, last);
    } else if (last !== prevLast) {
      // Chỉ hẹn lại khi dòng cuối thật sự thay đổi
      clearTimeout(live.stableTimer);
      if (last) {
        live.stableTimer = setTimeout(() => {
          if (st.live === live && live.lines[live.lines.length - 1] === last) commitLine(st, last);
        }, LIVE_STABLE_MS);
      }
    }
  }

  /** Đưa một dòng đã chốt vào hàng đợi dịch (bỏ qua nếu đã chốt rồi). */
  function commitLine(st, line) {
    const live = st.live;
    line = (line || '').trim();
    if (!live || !line) return;
    // Đã chốt chính dòng này, hoặc dòng này chỉ là phần đầu của một dòng đã chốt
    if (live.committed.some((c) => c.startsWith(line))) return;
    // Dòng "mọc thêm chữ" từ một dòng đã chốt trước đó (vd. chốt do đứng yên 1s rồi lại có thêm chữ)
    const grownFrom = live.committed.find((c) => line.startsWith(c));
    let item = { text: line, speak: true };
    if (grownFrom) {
      const qi = live.queue.findIndex((q) => q.text === grownFrom);
      if (qi >= 0) {
        live.queue.splice(qi, 1); // phần đầu chưa kịp dịch -> thay bằng cả dòng
      } else {
        // Phần đầu đã dịch/đọc rồi: chỉ dịch + đọc phần chữ mới, tránh đọc lặp
        const extra = line.slice(grownFrom.length).trim();
        item = extra ? { text: extra, speak: true } : null;
      }
    }
    live.committed.push(line);
    if (live.committed.length > 50) live.committed.splice(0, live.committed.length - 50);
    if (!item) return;
    live.queue.push(item);
    pumpLive(st);
  }

  /** Gửi các dòng trong hàng đợi đi dịch, tối đa ~1 request/giây; giãn thời gian chờ khi lỗi. */
  async function pumpLive(st) {
    const live = st.live;
    if (!live || st !== state || live.busy || live.workTimer || !live.queue.length) return;
    const wait = Math.max(live.lastReqAt + LIVE_MIN_REQ_GAP, live.blockedUntil) - Date.now();
    if (wait > 0) {
      live.workTimer = setTimeout(() => {
        live.workTimer = null;
        pumpLive(st);
      }, wait);
      return;
    }
    // Hàng đợi dồn (sau khi bị giới hạn) -> bỏ các dòng cũ, chỉ giữ các dòng mới nhất
    if (live.queue.length > LIVE_MAX_ITEMS) live.queue.splice(0, live.queue.length - LIVE_MAX_ITEMS);
    const items = live.queue.splice(0, LIVE_MAX_ITEMS);
    const need = items.filter((it) => !liveCache.has(it.text));
    if (need.length) {
      live.busy = true;
      live.lastReqAt = Date.now();
      const res = await sendBg({ type: 'translate', texts: need.map((it) => it.text) });
      live.busy = false;
      if (st.live !== live || st !== state) return;
      if (res && res.ok && Array.isArray(res.result)) {
        need.forEach((it, k) => {
          const tr = res.result[k];
          if (typeof tr === 'string' && tr.trim()) cacheLive(it.text, tr.trim());
        });
        live.failures = 0;
        setLiveHealthy(live, true);
      } else {
        live.failures++;
        const backoff = LIVE_BACKOFF_MS[Math.min(live.failures, LIVE_BACKOFF_MS.length) - 1];
        live.blockedUntil = Date.now() + backoff;
        warn(`Dịch trực tiếp lỗi (lần ${live.failures}), tạm dừng ${backoff / 1000}s`, res && res.error);
        setLiveHealthy(live, false); // hiện lại phụ đề gốc
        if (live.failures >= 2 || (res && res.status === 429)) showNotice('Dịch đang bị giới hạn, thử lại sau…', 5000);
      }
    }
    for (const it of items) {
      const vi = liveCache.get(it.text);
      if (!vi) continue; // dịch lỗi: bỏ dòng này (đã cũ), phụ đề gốc vẫn hiện
      live.shown.push(vi);
      if (live.shown.length > 2) live.shown.shift();
      live.shownAt = Date.now();
      if (it.speak) queueLiveSpeech(st, vi);
    }
    if (live.queue.length) pumpLive(st);
  }

  /** Nội dung overlay của chế độ trực tiếp. */
  function liveViewText(live) {
    if (!live.healthy) return '';
    if (!live.lines.length && Date.now() - live.shownAt > LIVE_SHOW_MS) return '';
    return live.shown.join('\n');
  }

  /** Gom bản dịch để đọc; hẹn đọc sau LIVE_SPEAK_DEBOUNCE nhưng không bao giờ chờ quá LIVE_SPEAK_MAX_WAIT. */
  function queueLiveSpeech(st, vi) {
    const live = st.live;
    if (!live || !settings.speak) return;
    live.speakBuf.push(vi);
    if (!live.speakSince) live.speakSince = Date.now();
    clearTimeout(live.speakTimer);
    const delay = Math.max(0, Math.min(LIVE_SPEAK_DEBOUNCE, live.speakSince + LIVE_SPEAK_MAX_WAIT - Date.now()));
    live.speakTimer = setTimeout(() => flushLiveSpeech(st), delay);
  }

  function flushLiveSpeech(st) {
    const live = st.live;
    if (!live || st !== state) return;
    const text = live.speakBuf.join(' ').trim();
    live.speakBuf = [];
    live.speakSince = 0;
    if (!text || !settings.speak) return;
    const v = getVideo();
    if (!v || v.paused || isAdShowing()) return;
    const pr = clamp(v.playbackRate || 1, 0.75, 2);
    const rate = settings.rate * pr * (tts.speaking ? 1.15 : 1);
    speakText(text, rate, (text.length / (CHARS_PER_SEC * rate)) * 1000);
  }

  // ======================================================================
  // Overlay + thông báo
  // ======================================================================
  let overlay = null;
  let overlayVi = null;
  let overlayOrig = null;
  let overlayBox = null;
  let noticeEl = null;
  let noticeTimer = null;

  function ensureOverlay() {
    const player = getPlayerEl();
    if (!player) return null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ytdv-overlay';
      overlayBox = document.createElement('div');
      overlayBox.className = 'ytdv-box ytdv-empty';
      overlayOrig = document.createElement('div');
      overlayOrig.className = 'ytdv-orig';
      overlayVi = document.createElement('div');
      overlayVi.className = 'ytdv-vi';
      overlayBox.appendChild(overlayOrig);
      overlayBox.appendChild(overlayVi);
      overlay.appendChild(overlayBox);
    }
    if (overlay.parentElement !== player) player.appendChild(overlay);
    updateOverlayStyle();
    return overlay;
  }

  function updateOverlayStyle() {
    if (!overlay) return;
    overlay.style.setProperty('--ytdv-fs', clamp(Number(settings.fontSize) || 24, 10, 72) + 'px');
    overlay.classList.toggle('ytdv-hidden', !settings.enabled || !settings.showSub);
  }

  /**
   * Hiển thị phụ đề. pending = true: `vi` thực ra là câu gốc hiện tạm trong lúc chờ/không dịch được
   * (chữ nghiêng, mờ hơn — xem content.css), khi đó không hiện thêm dòng gốc song ngữ để khỏi lặp.
   */
  function renderOverlay(vi, orig, pending = false) {
    if (!overlay) return;
    vi = vi || '';
    orig = settings.bilingual && !pending ? orig || '' : '';
    if (overlayVi.textContent !== vi) overlayVi.textContent = vi;
    if (overlayOrig.textContent !== orig) overlayOrig.textContent = orig;
    overlayVi.classList.toggle('ytdv-pending', !!pending && !!vi);
    overlayBox.classList.toggle('ytdv-empty', !vi && !orig);
  }

  function showNotice(text, ms = 5000) {
    const player = getPlayerEl();
    if (!player) return;
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = 'ytdv-notice';
    }
    if (noticeEl.parentElement !== player) player.appendChild(noticeEl);
    noticeEl.textContent = 'YouTube Dịch Việt: ' + text;
    noticeEl.classList.add('ytdv-show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => noticeEl && noticeEl.classList.remove('ytdv-show'), ms);
  }

  /** Ẩn phụ đề gốc của YouTube khi đang hiển thị phụ đề Việt của mình. */
  function applyCaptionHiding() {
    const player = getPlayerEl();
    document.querySelectorAll('.ytdv-hide-cc').forEach((el) => {
      if (el !== player) el.classList.remove('ytdv-hide-cc');
    });
    if (!player) return;
    // Chế độ trực tiếp: chỉ ẩn phụ đề gốc khi đang dịch được (dịch lỗi thì để người dùng còn xem phụ đề gốc)
    const hide = settings.enabled && settings.showSub && (state.loaded || !!(state.live && state.live.healthy));
    player.classList.toggle('ytdv-hide-cc', hide);
  }

  // ======================================================================
  // TTS + giảm âm lượng tiếng gốc
  // ======================================================================
  const tts = { speaking: false, utteranceId: null, seq: 0, watchdog: null, catchup: 1 };
  /*
   * Giảm âm lượng (ducking). Trạng thái:
   *  - duck.video:  thẻ <video> đang bị giảm (null = không giảm)
   *  - duck.saved:  âm lượng gốc trước khi giảm
   *  - duck.target: mức mà extension đặt (saved * duckVolume%)
   *  - duck.lastVolume: âm lượng ở sự kiện volumechange gần nhất (để bỏ qua sự kiện chỉ đổi muted)
   * Không dùng cờ "expected" một lần: mọi sự kiện được so với target/saved, nên các sự kiện
   * volumechange đến trễ, đến dồn, hay mute/unmute xen giữa đều không làm sai trạng thái.
   */
  const duck = { video: null, saved: null, target: null, lastVolume: null, restoreTimer: null };

  function applyDuck() {
    const v = getVideo();
    if (!v) return;
    clearTimeout(duck.restoreTimer);
    const level = clamp(Number(settings.duckVolume), 0, 100) / 100;
    if (level >= 1) {
      restoreVolume();
      return;
    }
    // Thẻ <video> bị thay thế trong lúc đang giảm: khôi phục thẻ cũ trước
    if (duck.video && duck.video !== v) restoreVolume();
    if (!duck.video) {
      duck.video = v;
      duck.saved = v.volume;
    }
    duck.target = duck.saved * level;
    if (Math.abs(v.volume - duck.target) > 0.001) {
      try {
        v.volume = duck.target;
      } catch (e) {
        /* bỏ qua */
      }
    }
    duck.lastVolume = v.volume;
  }

  function restoreVolume() {
    clearTimeout(duck.restoreTimer);
    const v = duck.video;
    const saved = duck.saved;
    // Xóa trạng thái trước khi đặt âm lượng -> sự kiện volumechange sau đó bị bỏ qua
    duck.video = null;
    duck.saved = null;
    duck.target = null;
    duck.lastVolume = null;
    if (v && saved != null && Math.abs(v.volume - saved) > 0.001) {
      try {
        v.volume = saved;
      } catch (e) {
        /* bỏ qua */
      }
    }
  }

  function scheduleRestore(ms = 400) {
    clearTimeout(duck.restoreTimer);
    duck.restoreTimer = setTimeout(restoreVolume, ms);
  }

  function onVolumeChange(e) {
    const v = e.target;
    if (!duck.video || v !== duck.video) return; // không đang giảm âm lượng thẻ này
    // Sự kiện chỉ đổi muted (volume giữ nguyên) -> bỏ qua
    if (duck.lastVolume != null && Math.abs(v.volume - duck.lastVolume) <= 0.001) return;
    duck.lastVolume = v.volume;
    // Chỉ coi là người dùng (hoặc YouTube) tự chỉnh khi khác hẳn cả mức đích lẫn mức gốc
    if (Math.abs(v.volume - duck.target) > 0.01 && Math.abs(v.volume - duck.saved) > 0.01) {
      // Tôn trọng lựa chọn đó: thôi giảm, không khôi phục đè lên
      clearTimeout(duck.restoreTimer);
      duck.video = null;
      duck.saved = null;
      duck.target = null;
      duck.lastVolume = null;
    }
  }

  function cleanForSpeech(text) {
    return String(text || '')
      .replace(/\[[^\]]*\]|\([^)]*(nhạc|music|vỗ tay|applause|cười|laugh)[^)]*\)/gi, ' ')
      .replace(/[♪♫]+/g, ' ')
      .replace(/\s*>>\s*/g, ' ') // ">>" (đổi người nói) ở mọi vị trí
      .replace(/\s+/g, ' ')
      .trim();
  }

  function speakText(text, rate, estMs) {
    text = cleanForSpeech(text);
    if (!text || isAdShowing()) return; // không bao giờ đọc/giảm âm lượng trong quảng cáo
    const id = 'ytdv-' + ++tts.seq;
    tts.utteranceId = id;
    tts.speaking = true;
    applyDuck();
    clearTimeout(tts.watchdog);
    // Phòng khi mất sự kiện 'end' (service worker bị tắt…): tự coi như đọc xong
    tts.watchdog = setTimeout(() => {
      if (tts.utteranceId === id) {
        tts.speaking = false;
        tts.utteranceId = null;
        scheduleRestore(0);
      }
    }, (estMs || 6000) * 1.6 + 4000);
    sendBg({
      type: 'speak',
      text,
      rate: clamp(rate, 0.5, 4),
      voiceName: settings.voiceName || '',
      utteranceId: id,
    }).then((res) => {
      if ((!res || !res.ok) && tts.utteranceId === id) {
        tts.speaking = false;
        tts.utteranceId = null;
        scheduleRestore(0);
        if (res && res.error && res.error !== 'empty') warn('Không đọc được', res.error);
      }
    });
  }

  function speakCue(idx, nowMs) {
    if (isAdShowing()) return;
    const cue = state.cues[idx];
    state.spokenIdx = idx;
    const text = cleanForSpeech(cue && cue.text);
    if (!text) return;
    const v = getVideo();
    const playbackRate = (v && v.playbackRate) || 1;
    // Câu trước chưa đọc xong -> tăng tốc dần để không bị trễ dồn; rảnh thì trở lại bình thường
    tts.catchup = tts.speaking ? Math.min(tts.catchup + 0.1, 1.4) : 1;
    let rate = settings.rate * clamp(playbackRate, 0.75, 2) * tts.catchup;
    const availMs = Math.max(600, (cue.end - Math.max(cue.start, nowMs)) / playbackRate);
    const needMs = (text.length / (CHARS_PER_SEC * rate)) * 1000;
    if (needMs > availMs) rate *= Math.min(needMs / availMs, 1.6);
    rate = clamp(rate, 0.5, 4);
    speakText(text, rate, (text.length / (CHARS_PER_SEC * rate)) * 1000);
  }

  function stopSpeaking() {
    clearTimeout(tts.watchdog);
    if (tts.speaking || tts.utteranceId) sendBg({ type: 'stop' });
    tts.speaking = false;
    tts.utteranceId = null;
    restoreVolume();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'tts-event') return false;
    if (msg.utteranceId !== tts.utteranceId) return false; // sự kiện của câu cũ
    if (msg.eventType === 'start') {
      tts.speaking = true;
    } else if (['end', 'interrupted', 'cancelled', 'error'].includes(msg.eventType)) {
      tts.speaking = false;
      tts.utteranceId = null; // câu đã kết thúc -> stopSpeaking() không cần gửi 'stop' nữa
      clearTimeout(tts.watchdog);
      if (msg.eventType === 'error') warn('Lỗi TTS', msg.errorMessage);
      scheduleRestore(400);
    }
    return false;
  });

  // ======================================================================
  // Vòng đồng bộ
  // ======================================================================
  let boundVideo = null;

  function bindVideo(v) {
    if (boundVideo === v) return;
    // Thẻ <video> bị thay thế (hoặc bỏ gắn) trong lúc đang giảm âm lượng -> khôi phục thẻ cũ
    if (duck.video && duck.video !== v) restoreVolume();
    if (boundVideo) {
      boundVideo.removeEventListener('pause', onPause);
      boundVideo.removeEventListener('seeking', onSeeking);
      boundVideo.removeEventListener('volumechange', onVolumeChange);
      boundVideo.removeEventListener('timeupdate', tick);
    }
    boundVideo = v;
    if (v) {
      v.addEventListener('pause', onPause);
      v.addEventListener('seeking', onSeeking);
      v.addEventListener('volumechange', onVolumeChange);
      v.addEventListener('timeupdate', tick);
    }
  }

  function onPause() {
    stopSpeaking();
  }

  function onSeeking() {
    stopSpeaking();
    state.spokenIdx = -1;
  }

  /** Tìm câu đang hiển thị tại thời điểm t (ms) — tìm nhị phân câu cuối cùng có start <= t. */
  function findCue(cues, t) {
    let lo = 0;
    let hi = cues.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (ans >= 0 && t < cues[ans].end) return ans;
    return -1;
  }

  function tick() {
    try {
      if (!settings.enabled || !state.videoId) return;
      const v = getVideo();
      if (!v) return;
      bindVideo(v);
      if (overlay && overlay.parentElement !== getPlayerEl()) ensureOverlay();

      // Đang chiếu quảng cáo: currentTime là của quảng cáo -> không hiện phụ đề, không đọc, không giảm âm lượng
      if (isAdShowing()) {
        renderOverlay('', '');
        if (tts.speaking || tts.utteranceId || duck.video) stopSpeaking(); // stopSpeaking tự khôi phục âm lượng
        restoreVolume();
        return;
      }

      if (state.live) {
        renderOverlay(liveViewText(state.live), state.live.orig);
        return;
      }
      if (!state.loaded) return;

      const t = v.currentTime * 1000;
      const idx = findCue(state.cues, t);
      const cue = idx >= 0 ? state.cues[idx] : null;

      let origText = '';
      if (settings.bilingual) {
        if (state.source === 'google') origText = cue ? cue.orig : '';
        else {
          const oi = findCue(state.origCues, t);
          origText = oi >= 0 ? state.origCues[oi].text : '';
        }
      }
      if (cue && !cue.text && cue.orig) {
        // Chưa có bản dịch (đang chờ hoặc dịch lỗi): hiện tạm câu gốc, chữ nghiêng/mờ; KHÔNG đọc
        renderOverlay(cue.orig, '', true);
      } else {
        renderOverlay(cue ? cue.text || '' : '', origText);
      }

      // Chỉ đọc khi có bản dịch thật (cue.text); câu gốc hiện tạm không bao giờ được đọc
      if (cue && cue.text && settings.speak && !v.paused && !v.seeking && state.spokenIdx !== idx) {
        const dur = Math.max(1, cue.end - cue.start);
        // Chỉ đọc khi vừa vào câu (tránh đọc câu đã trôi qua quá nửa sau khi tua)
        if (t - cue.start <= Math.max(1500, dur * 0.35)) speakCue(idx, t);
        else state.spokenIdx = idx;
      }
    } catch (e) {
      warn('Lỗi vòng đồng bộ', e);
    }
  }

  // ======================================================================
  // Cài đặt
  // ======================================================================
  function teardownAll() {
    teardownVideo(); // dừng đọc, khôi phục âm lượng, gỡ class ẩn phụ đề gốc
    restoreCaptionsState(); // tắt lại CC nếu chính extension đã bật
    state = newState(null);
    if (overlay) overlay.remove();
    if (noticeEl) noticeEl.remove();
    bindVideo(null);
  }

  function applySettings(prevEnabled) {
    if (!settings.enabled) {
      if (prevEnabled) teardownAll();
      return;
    }
    if (!prevEnabled) {
      state = newState(null);
      checkNavigation();
    }
    if (state.videoId) ensureOverlay();
    updateOverlayStyle();
    applyCaptionHiding();
    if (!settings.speak) stopSpeaking();
    if (settings.duckVolume >= 100) restoreVolume();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const prevEnabled = settings.enabled;
      let touched = false;
      for (const k of Object.keys(changes)) {
        if (k in DEFAULTS) {
          const nv = changes[k].newValue;
          settings[k] = nv === undefined ? DEFAULTS[k] : nv;
          touched = true;
        }
      }
      if (touched) applySettings(prevEnabled);
    });
  } catch (e) {
    warn('Không đăng ký được storage.onChanged', e);
  }

  // ======================================================================
  // Khởi động
  // ======================================================================
  async function init() {
    try {
      const stored = await chrome.storage.sync.get(DEFAULTS);
      settings = Object.assign({}, DEFAULTS, stored);
    } catch (e) {
      warn('Không đọc được cài đặt, dùng mặc định', e);
    }

    // YouTube là SPA: bắt sự kiện điều hướng
    document.addEventListener('yt-navigate-finish', () => setTimeout(checkNavigation, 50));
    window.addEventListener('popstate', () => setTimeout(checkNavigation, 50));

    // Rời trang / đóng tab: dừng đọc và trả lại âm lượng gốc (tránh lưu âm lượng thấp vào video/YouTube)
    const onLeave = () => {
      stopSpeaking();
      restoreVolume();
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);

    setInterval(tick, TICK_MS);
    // Phòng hờ: kiểm tra đổi video định kỳ (một số luồng điều hướng không bắn sự kiện)
    setInterval(checkNavigation, 1000);

    checkNavigation();
    log('Content script sẵn sàng');
  }

  init();
})();
