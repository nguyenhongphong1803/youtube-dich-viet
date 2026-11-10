/*
 * popup.js — giao diện cài đặt. Lưu vào chrome.storage.sync;
 * content.js lắng nghe chrome.storage.onChanged để áp dụng ngay.
 */
'use strict';

const LOG = '[YT-Dịch]';

// Khóa cài đặt — phải khớp với content.js
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

const $ = (id) => document.getElementById(id);
const CHECKBOXES = ['enabled', 'showSub', 'bilingual', 'speak'];
const RANGES = {
  rate: (v) => Number(v).toFixed(1) + '×',
  duckVolume: (v) => Math.round(v) + '%',
  fontSize: (v) => Math.round(v) + 'px',
};

let current = Object.assign({}, DEFAULTS);
const saveTimers = {};
const unsaved = {}; // các giá trị đang chờ debounce, chưa ghi vào storage

function writeNow(key, value) {
  clearTimeout(saveTimers[key]);
  delete saveTimers[key];
  delete unsaved[key];
  chrome.storage.sync.set({ [key]: value }).catch((e) => console.warn(LOG, 'Lưu cài đặt lỗi', e));
}

/** Lưu cài đặt. delay > 0: debounce (dùng cho sự kiện 'input' của thanh trượt); delay = 0: lưu ngay. */
function save(key, value, delay = 0) {
  current[key] = value;
  if (!delay) {
    writeNow(key, value);
    return;
  }
  clearTimeout(saveTimers[key]);
  unsaved[key] = value;
  saveTimers[key] = setTimeout(() => writeNow(key, value), delay);
}

/** Ghi ngay mọi giá trị còn đang debounce (popup sắp đóng). */
function flushSaves() {
  Object.keys(unsaved).forEach((key) => writeNow(key, unsaved[key]));
}

function updateDisabledState() {
  $('settings').classList.toggle('disabled', !current.enabled);
  $('bilingual').disabled = !current.showSub;
}

function isVietnameseVoice(v) {
  const lang = (v.lang || '').toLowerCase();
  return lang === 'vi' || lang.startsWith('vi-') || lang.startsWith('vi_') || /tiếng việt|vietnam/i.test(v.voiceName || '');
}

/**
 * Điểm ưu tiên giọng (giống background.js, càng nhỏ càng ưu tiên). Không giả định có "Google Tiếng Việt":
 * 0: lang 'vi' + Microsoft Natural/Online (HoaiMy, NamMinh — Edge); 1: lang 'vi' + Microsoft (An — Windows);
 * 2: các giọng lang 'vi' khác; 3: giọng chỉ nhận ra qua tên.
 */
function voiceRank(v) {
  const name = v.voiceName || '';
  if (!/^vi([-_]|$)/i.test(v.lang || '')) return 3;
  if (/microsoft/i.test(name)) return /natural|online/i.test(name) ? 0 : 1;
  return 2;
}

/** Giọng tự động: giọng có điểm ưu tiên tốt nhất. */
function autoVoice(voices) {
  let best = null;
  for (const v of voices) if (!best || voiceRank(v) < voiceRank(best)) best = v;
  return best;
}

function loadVoices() {
  return new Promise((resolve) => {
    try {
      chrome.tts.getVoices((voices) => resolve((voices || []).filter(isVietnameseVoice)));
    } catch (e) {
      resolve([]);
    }
  });
}

async function fillVoices() {
  const select = $('voiceName');
  select.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Tự động';
  select.appendChild(auto);

  const voices = await loadVoices();
  const best = autoVoice(voices);
  if (best) auto.textContent = `Tự động (${best.voiceName})`;
  // Sắp xếp theo thứ tự ưu tiên (sort ổn định nên giữ nguyên thứ tự trong cùng nhóm)
  voices.sort((a, b) => voiceRank(a) - voiceRank(b));
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.voiceName;
    opt.textContent = `${v.voiceName}${v.lang ? ' (' + v.lang + ')' : ''}${v.remote ? ' — online' : ''}`;
    select.appendChild(opt);
  });
  // Giọng đã lưu nhưng không còn trên máy -> vẫn hiện để không mất lựa chọn
  if (current.voiceName && !voices.some((v) => v.voiceName === current.voiceName)) {
    const opt = document.createElement('option');
    opt.value = current.voiceName;
    opt.textContent = current.voiceName + ' (không còn trên máy)';
    select.appendChild(opt);
  }
  select.value = current.voiceName || '';
  $('noVoice').hidden = voices.length > 0;
}

function testVoice() {
  const voiceName = $('voiceName').value;
  loadVoices().then((voices) => {
    const voice = voices.find((v) => v.voiceName === voiceName) || autoVoice(voices);
    const opts = { lang: (voice && voice.lang) || 'vi-VN', rate: Number(current.rate) || 1.2, enqueue: false };
    if (voice) opts.voiceName = voice.voiceName;
    try {
      chrome.tts.speak('Xin chào, đây là giọng đọc tiếng Việt của YouTube Dịch Việt.', opts, () => {
        if (chrome.runtime.lastError) console.warn(LOG, 'Thử giọng lỗi', chrome.runtime.lastError.message);
      });
    } catch (e) {
      console.warn(LOG, 'Thử giọng lỗi', e);
    }
  });
}

async function init() {
  try {
    current = Object.assign({}, DEFAULTS, await chrome.storage.sync.get(DEFAULTS));
  } catch (e) {
    console.warn(LOG, 'Không đọc được cài đặt', e);
  }

  CHECKBOXES.forEach((key) => {
    const el = $(key);
    el.checked = !!current[key];
    el.addEventListener('change', () => {
      save(key, el.checked);
      updateDisabledState();
    });
  });

  Object.keys(RANGES).forEach((key) => {
    const el = $(key);
    const label = $(key + 'Val');
    el.value = current[key];
    label.textContent = RANGES[key](current[key]);
    el.addEventListener('input', () => {
      const v = Number(el.value);
      label.textContent = RANGES[key](v);
      save(key, v, 250); // debounce để không vượt hạn mức ghi của storage.sync
    });
    // Thả thanh trượt: lưu ngay (popup có thể đóng trước khi hết debounce)
    el.addEventListener('change', () => save(key, Number(el.value)));
  });

  $('voiceName').addEventListener('change', (e) => save('voiceName', e.target.value));
  $('testVoice').addEventListener('click', testVoice);

  // Popup đóng: ghi nốt các giá trị còn đang debounce
  window.addEventListener('pagehide', flushSaves);

  updateDisabledState();
  await fillVoices();
}

document.addEventListener('DOMContentLoaded', init);
