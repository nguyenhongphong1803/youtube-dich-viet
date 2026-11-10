/*
 * background.js — service worker của extension.
 *
 * Message nhận từ content script:
 *  - { type: 'translate', texts: string[] }  -> { ok:true, result: (string|null)[], failed?: number[] }
 *                                              | { ok:false, error, status? }  (status 429 = bị giới hạn)
 *  - { type: 'speak', text, rate, voiceName, utteranceId }   -> { ok }
 *  - { type: 'stop' }                                         -> { ok }
 *  - { type: 'getVoices' }                                    -> { ok, voices }
 * Message gửi về content script:
 *  - { type: 'tts-event', utteranceId, eventType, errorMessage }
 *
 * Chỉ gửi dữ liệu (văn bản phụ đề) tới endpoint dịch translate.googleapis.com, không gửi đi đâu khác.
 */
'use strict';

const LOG = '[YT-Dịch]';
const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const MAX_GET_URL = 4000;
const FETCH_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Dịch ----------------

// Tổng thời gian tối đa cho một message 'translate' (phải dưới ~60 giây để không treo content script)
const TRANSLATE_BUDGET_MS = 45000;
const MAX_ATTEMPTS = 3;

/** Lỗi dịch có kèm mã HTTP (nếu có), ví dụ 429 = bị giới hạn. */
function httpError(status) {
  const e = new Error('HTTP ' + status);
  e.status = status;
  return e;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs));
  try {
    return await fetch(url, Object.assign({}, options, { signal: ctrl.signal, credentials: 'omit' }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dịch một chuỗi sang tiếng Việt qua Google Translate (client=gtx). Tự dùng POST nếu URL quá dài.
 * - 429: ném lỗi ngay (status 429), không thử lại — thử lại chỉ làm bị chặn lâu hơn.
 * - 5xx / lỗi mạng: thử lại tối đa MAX_ATTEMPTS lần, không sleep sau lần thử cuối,
 *   không vượt quá thời điểm `deadline`.
 */
async function googleTranslate(text, deadline = Date.now() + TRANSLATE_BUDGET_MS, tl = 'vi') {
  if (!text) return '';
  const params = `client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t`;
  const q = encodeURIComponent(text);
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remain = deadline - Date.now();
    if (remain <= 500) break; // hết thời gian cho message này
    try {
      let res;
      const timeout = Math.min(FETCH_TIMEOUT_MS, remain);
      if (TRANSLATE_URL.length + params.length + q.length + 4 < MAX_GET_URL) {
        res = await fetchWithTimeout(`${TRANSLATE_URL}?${params}&q=${q}`, {}, timeout);
      } else {
        res = await fetchWithTimeout(
          `${TRANSLATE_URL}?${params}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: 'q=' + q,
          },
          timeout
        );
      }
      if (res.status === 429) throw httpError(429); // bị giới hạn: dừng ngay
      if (!res.ok) throw httpError(res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Phản hồi dịch không hợp lệ');
      return data[0].map((s) => (Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '')).join('');
    } catch (e) {
      lastErr = e;
      if (e && e.status === 429) throw e;
      // Lỗi 4xx khác (trừ 408) thử lại cũng vô ích
      if (e && e.status >= 400 && e.status < 500 && e.status !== 408) throw e;
      const wait = 1000 * (attempt + 1);
      // Không sleep sau lần thử cuối, và không sleep nếu sleep xong đã quá hạn
      if (attempt < MAX_ATTEMPTS - 1 && Date.now() + wait < deadline - 500) await sleep(wait);
      else if (attempt < MAX_ATTEMPTS - 1) break;
    }
  }
  throw lastErr || new Error('Hết thời gian dịch');
}

/**
 * Dịch một mảng câu: gộp bằng '\n' thành 1 request; nếu số dòng trả về lệch (hoặc lỗi khác 429)
 * thì dịch từng câu trong thời gian còn lại.
 * Trả về { result, failed }:
 *  - result[i]: bản dịch, '' nếu câu gốc rỗng, null nếu câu đó dịch lỗi (KHÔNG bao giờ '' do lỗi);
 *  - failed: danh sách chỉ số các câu dịch lỗi.
 * Ném lỗi (kèm status nếu có) khi bị 429 hoặc khi không dịch được câu nào.
 */
async function translateTexts(texts) {
  const deadline = Date.now() + TRANSLATE_BUDGET_MS;
  const clean = (Array.isArray(texts) ? texts : []).map((t) =>
    String(t == null ? '' : t)
      .replace(/\s*\n\s*/g, ' ')
      .trim()
  );
  if (clean.length === 0) return { result: [], failed: [] };
  if (clean.length === 1) {
    const r = await googleTranslate(clean[0], deadline);
    if (clean[0] && !r.trim()) throw new Error('Bản dịch rỗng');
    return { result: [r], failed: [] };
  }

  // Lỗi mạng / HTTP (kể cả 429) của request gộp: ném luôn để content script backoff rồi thử lại,
  // KHÔNG chuyển sang dịch từng câu (sẽ gửi dồn hàng chục request khi server đang lỗi).
  const joined = await googleTranslate(clean.join('\n'), deadline);
  const out = joined.split('\n').map((s) => s.trim());
  if (out.length === clean.length) {
    const failed = [];
    const result = out.map((s, i) => {
      if (!clean[i]) return ''; // câu gốc rỗng
      if (!s) {
        failed.push(i); // Google trả rỗng cho câu này -> đánh dấu lỗi riêng
        return null;
      }
      return s;
    });
    if (failed.length === clean.filter(Boolean).length) throw new Error('Bản dịch rỗng');
    return { result, failed };
  }

  // Số dòng trả về lệch (Google gộp/tách dòng): dịch từng câu trong thời gian còn lại
  console.warn(LOG, `Số dòng dịch lệch (${out.length} != ${clean.length}), chuyển sang dịch từng câu`);
  const result = [];
  const failed = [];
  let okCount = 0;
  let errStreak = 0;
  let lastErr = null;
  for (let i = 0; i < clean.length; i++) {
    const t = clean[i];
    if (!t) {
      result.push('');
      continue;
    }
    // Hết thời gian, hoặc lỗi liên tiếp: đánh dấu lỗi phần còn lại để content script thử lại sau
    if (Date.now() >= deadline - 500 || errStreak >= 2) {
      result.push(null);
      failed.push(i);
      continue;
    }
    try {
      const r = (await googleTranslate(t, deadline)).trim();
      if (r) {
        result.push(r);
        okCount++;
        errStreak = 0;
      } else {
        result.push(null);
        failed.push(i);
      }
    } catch (e) {
      if (e && e.status === 429) throw e; // bị giới hạn: trả lỗi ngay
      console.warn(LOG, 'Dịch câu lỗi', e);
      lastErr = e;
      errStreak++;
      result.push(null);
      failed.push(i);
    }
  }
  if (okCount === 0 && failed.length) throw lastErr || new Error('Không dịch được câu nào');
  return { result, failed };
}

// ---------------- Đọc (TTS) ----------------

// Lần đọc đang chạy: thuộc tab nào, câu nào. 'stop' từ một tab chỉ dừng lần đọc của chính tab đó.
let currentTts = null; // { tabId, utteranceId }
const stopSeq = new Map(); // tabId -> số lần nhận 'stop' (để hủy lệnh 'speak' đang chờ chọn giọng)

function getVoices() {
  return new Promise((resolve) => {
    try {
      chrome.tts.getVoices((v) => resolve(Array.isArray(v) ? v : []));
    } catch (e) {
      resolve([]);
    }
  });
}

function isVietnameseVoice(v) {
  const lang = (v.lang || '').toLowerCase();
  return lang === 'vi' || lang.startsWith('vi-') || lang.startsWith('vi_') || /tiếng việt|vietnam/i.test(v.voiceName || '');
}

/**
 * Điểm ưu tiên của một giọng tiếng Việt (càng nhỏ càng ưu tiên). Không giả định máy có "Google Tiếng Việt":
 *  0: lang bắt đầu bằng 'vi' + tên có "Microsoft" + Natural/Online (vd. "Microsoft HoaiMy Online (Natural)", NamMinh — Edge)
 *  1: lang 'vi' + tên có "Microsoft" (vd. "Microsoft An" trên Windows)
 *  2: các giọng còn lại có lang 'vi'
 *  3: giọng chỉ nhận ra qua tên (không có lang 'vi')
 */
function voiceRank(v) {
  const name = v.voiceName || '';
  const langVi = /^vi([-_]|$)/i.test(v.lang || '');
  if (!langVi) return 3;
  if (/microsoft/i.test(name)) return /natural|online/i.test(name) ? 0 : 1;
  return 2;
}

/** Chọn giọng: giọng người dùng chọn (nếu còn tồn tại) > theo thứ tự ưu tiên của voiceRank. */
async function pickVoice(preferredName) {
  const vi = (await getVoices()).filter(isVietnameseVoice);
  if (preferredName) {
    const found = vi.find((v) => v.voiceName === preferredName);
    if (found) return found;
  }
  let best = null;
  for (const v of vi) if (!best || voiceRank(v) < voiceRank(best)) best = v;
  return best;
}

function notifyTab(sender, payload) {
  try {
    if (!sender || !sender.tab || sender.tab.id == null) return;
    const opts = typeof sender.frameId === 'number' ? { frameId: sender.frameId } : undefined;
    const p = chrome.tabs.sendMessage(sender.tab.id, payload, opts);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    /* tab đã đóng — bỏ qua */
  }
}

async function speak(msg, sender) {
  const text = String(msg.text || '').trim();
  if (!text) return { ok: false, error: 'empty' };
  const tabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
  const seqAtStart = stopSeq.get(tabId) || 0;
  const voice = await pickVoice(msg.voiceName);
  // Tab đã gửi 'stop' trong lúc đang chọn giọng -> bỏ lệnh đọc này
  if ((stopSeq.get(tabId) || 0) !== seqAtStart) return { ok: false, error: 'stopped' };
  let rate = Number(msg.rate) || 1;
  rate = Math.max(0.1, Math.min(10, rate));
  const me = { tabId, utteranceId: msg.utteranceId };
  const options = {
    lang: (voice && voice.lang) || 'vi-VN',
    rate,
    volume: 1,
    enqueue: false,
    onEvent: (ev) => {
      if (['start', 'end', 'interrupted', 'cancelled', 'error'].includes(ev.type)) {
        // Lần đọc này kết thúc -> không còn là lần đọc hiện tại
        if (ev.type !== 'start' && currentTts === me) currentTts = null;
        notifyTab(sender, {
          type: 'tts-event',
          utteranceId: msg.utteranceId,
          eventType: ev.type,
          errorMessage: ev.errorMessage || '',
        });
      }
    },
  };
  if (voice && voice.voiceName) options.voiceName = voice.voiceName;
  currentTts = me;
  return new Promise((resolve) => {
    try {
      chrome.tts.speak(text, options, () => {
        if (chrome.runtime.lastError) {
          if (currentTts === me) currentTts = null;
          console.warn(LOG, 'TTS lỗi', chrome.runtime.lastError.message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ ok: true });
        }
      });
    } catch (e) {
      if (currentTts === me) currentTts = null;
      resolve({ ok: false, error: String(e) });
    }
  });
}

/** 'stop' từ một tab: chỉ dừng khi lần đọc hiện tại thuộc về đúng tab đó (không cắt lời tab khác). */
function stopForSender(sender) {
  const tabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
  stopSeq.set(tabId, (stopSeq.get(tabId) || 0) + 1);
  if (!currentTts || currentTts.tabId !== tabId) return false;
  currentTts = null;
  try {
    chrome.tts.stop();
  } catch (e) {
    /* bỏ qua */
  }
  return true;
}

// ---------------- Router message ----------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;
  switch (msg.type) {
    case 'translate':
      translateTexts(msg.texts)
        .then(({ result, failed }) => {
          const res = { ok: true, result };
          if (failed.length) res.failed = failed; // các câu lỗi có result[i] === null
          sendResponse(res);
        })
        .catch((e) => {
          console.warn(LOG, 'Dịch lỗi', e);
          const res = { ok: false, error: String(e && e.message ? e.message : e) };
          if (e && e.status) res.status = e.status;
          sendResponse(res);
        });
      return true;
    case 'speak':
      speak(msg, sender).then(sendResponse);
      return true;
    case 'stop':
      sendResponse({ ok: true, stopped: stopForSender(sender) });
      return false;
    case 'getVoices':
      getVoices().then((voices) =>
        sendResponse({
          ok: true,
          voices: voices.filter(isVietnameseVoice).map((v) => ({ voiceName: v.voiceName, lang: v.lang })),
        })
      );
      return true;
    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log(LOG, 'Đã cài đặt / cập nhật extension');
});
