// ==UserScript==
// @name         YouTube Hide Watched Videos
// @namespace    https://github.com/n3yne/yt-hide-watched
// @author       Esscey
// @homepageURL  https://github.com/n3yne/yt-hide-watched
// @supportURL   https://github.com/n3yne/yt-hide-watched/issues
// @downloadURL  https://raw.githubusercontent.com/n3yne/yt-hide-watched/main/yt-hide-watched.user.js
// @updateURL    https://raw.githubusercontent.com/n3yne/yt-hide-watched/main/yt-hide-watched.user.js
// @version      1.2.1
// @description  Hides fully watched videos (progress bar at 100%) and repeated copies of the same video on all YouTube pages, with an on/off switch next to the Create button.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  // Videos with a watched percentage at or above this value are hidden.
  const THRESHOLD = 100;

  // Pages where hiding is skipped. Hiding on watch history would empty the page.
  const EXCLUDED_PATHS = [/^\/feed\/history/];

  const STORAGE_KEY = 'ythw_enabled';
  const ROOT_CLASS = 'ythw-on';
  const HIDDEN_ATTR = 'data-ythw-hidden';

  // Elements that draw the red watched progress bar on a thumbnail.
  // The first is the classic renderer, the others are the newer view model.
  const PROGRESS_SELECTORS = [
    'ytd-thumbnail-overlay-resume-playback-renderer #progress',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
    'yt-thumbnail-overlay-progress-bar-view-model [style*="width"]'
  ];

  // Video card containers, checked in order. The outermost match is hidden
  // so no empty grid cell or margin is left behind.
  const CARD_SELECTORS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'yt-lockup-view-model',
    'ytm-video-with-context-renderer',
    'ytm-compact-video-renderer'
  ];

  // Cards inside these are never hidden (for example the playing playlist panel).
  const NEVER_HIDE_INSIDE = 'ytd-playlist-panel-renderer';

  // Repeated copies of the same video inside one list are hidden too, because
  // YouTube sometimes delivers the same batch of videos twice while loading more.
  // Set to false to turn this off.
  const HIDE_DUPLICATES = true;

  // Containers that define one list of videos. A repeat is only matched inside the same list.
  const LIST_SCOPE_SELECTOR = [
    'ytd-rich-grid-renderer',
    'ytd-item-section-renderer',
    'ytd-playlist-video-list-renderer',
    'ytd-section-list-renderer'
  ].join(',');

  const CARD_SELECTOR_ALL = CARD_SELECTORS.join(',');

  // The switch is inserted as the first child of this container, which puts it
  // directly to the left of the Create button.
  const MASTHEAD_BUTTONS = 'ytd-masthead #buttons';

  // ---------- storage with a fallback so the script also runs outside a userscript manager ----------

  function loadEnabled() {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(STORAGE_KEY, true);
      }
    } catch (e) { /* ignore */ }
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  }

  function saveEnabled(value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_KEY, value);
        return;
      }
    } catch (e) { /* ignore */ }
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  let enabled = loadEnabled();

  // ---------- styles ----------

  const style = document.createElement('style');
  style.id = 'ythw-style';
  style.textContent = [
    'html.' + ROOT_CLASS + ' [' + HIDDEN_ATTR + '] { display: none !important; }',

    '#ythw-toggle { display: inline-flex; align-items: center; gap: 8px; flex: none;',
    '  height: 36px; margin: 0 12px 0 0; padding: 0 4px; box-sizing: border-box;',
    '  font: 500 14px/20px Roboto, Arial, sans-serif; color: #0f0f0f;',
    '  cursor: pointer; user-select: none; white-space: nowrap; }',
    'html[dark] #ythw-toggle { color: #f1f1f1; }',
    '#ythw-toggle:focus-visible { outline: 2px solid #3ea6ff; outline-offset: 2px; border-radius: 18px; }',

    '#ythw-track { position: relative; flex: none; width: 36px; height: 20px; border-radius: 10px;',
    '  background: rgba(128, 128, 128, 0.55); transition: background 0.15s ease; }',
    '#ythw-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;',
    '  background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); transition: transform 0.15s ease; }',
    '#ythw-toggle[aria-checked="true"] #ythw-track { background: #065fd4; }',
    'html[dark] #ythw-toggle[aria-checked="true"] #ythw-track { background: #3ea6ff; }',
    '#ythw-toggle[aria-checked="true"] #ythw-thumb { transform: translateX(16px); }',

    // Fallback when the masthead is not available (for example on the mobile site).
    '#ythw-toggle[data-placement="floating"] { position: fixed; left: 12px; bottom: 12px;',
    '  z-index: 2147483647; height: auto; margin: 0; padding: 6px 10px; border-radius: 18px;',
    '  background: rgba(33, 33, 33, 0.92); color: #fff; }',
    'html[dark] #ythw-toggle[data-placement="floating"] { color: #fff; }'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  // ---------- helpers ----------

  function isExcludedPage() {
    return EXCLUDED_PATHS.some(function (re) { return re.test(location.pathname); });
  }

  function readPercent(el) {
    const w = el.style && el.style.width;
    if (!w) return 0;
    const n = parseFloat(w);
    return isNaN(n) ? 0 : n;
  }

  function findCard(el) {
    if (el.closest(NEVER_HIDE_INSIDE)) return null;
    for (let i = 0; i < CARD_SELECTORS.length; i++) {
      const card = el.closest(CARD_SELECTORS[i]);
      if (card) return card;
    }
    return null;
  }

  // Reads the video id from the first watch or shorts link in a card.
  // Links that belong to a playlist (list=) are skipped so playlists are never treated as repeats.
  function getVideoId(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    if (href.indexOf('list=') !== -1) return null;
    const m = href.match(/[?&]v=([\w-]{11})/) || href.match(/\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
  }

  // Returns the cards that repeat a video already shown earlier in the same list.
  function findDuplicates() {
    const duplicates = new Set();
    const seenByScope = new Map();
    document.querySelectorAll(CARD_SELECTOR_ALL).forEach(function (card) {
      if (card.closest(NEVER_HIDE_INSIDE)) return;
      // Only the outermost card counts, so a card wrapped by another card is not matched twice.
      if (card.parentElement && card.parentElement.closest(CARD_SELECTOR_ALL)) return;
      const id = getVideoId(card);
      if (!id) return;
      const scope = card.closest(LIST_SCOPE_SELECTOR) || document.body;
      let seen = seenByScope.get(scope);
      if (!seen) {
        seen = new Set();
        seenByScope.set(scope, seen);
      }
      if (seen.has(id)) {
        duplicates.add(card);
      } else {
        seen.add(id);
      }
    });
    return duplicates;
  }

  let hiddenCount = 0;
  let duplicatesHidden = 0;
  let button = null;

  function updateButton() {
    if (!button) return;
    button.setAttribute('aria-checked', enabled ? 'true' : 'false');
    button.title = 'Hide fully watched videos (' + hiddenCount + ' watched, ' +
      duplicatesHidden + ' repeats found on this page)';
  }

  function applyRootClass() {
    document.documentElement.classList.toggle(ROOT_CLASS, enabled && !isExcludedPage());
  }

  // ---------- switch placement ----------

  function placeButton() {
    if (!button) return;
    const container = document.querySelector(MASTHEAD_BUTTONS);
    if (container && container.firstElementChild) {
      if (container.firstElementChild !== button) {
        container.insertBefore(button, container.firstElementChild);
      }
      if (button.getAttribute('data-placement') !== 'masthead') {
        button.setAttribute('data-placement', 'masthead');
      }
    } else if (document.body) {
      if (button.parentElement !== document.body) {
        document.body.appendChild(button);
      }
      if (button.getAttribute('data-placement') !== 'floating') {
        button.setAttribute('data-placement', 'floating');
      }
    }
  }

  // ---------- main scan ----------

  function scan() {
    const marked = new Set();
    const bars = document.querySelectorAll(PROGRESS_SELECTORS.join(','));

    bars.forEach(function (bar) {
      if (readPercent(bar) >= THRESHOLD) {
        const card = findCard(bar);
        if (card) marked.add(card);
      }
    });

    const watchedCount = marked.size;
    let repeatCount = 0;
    if (HIDE_DUPLICATES) {
      findDuplicates().forEach(function (card) {
        if (!marked.has(card)) {
          marked.add(card);
          repeatCount++;
        }
      });
    }

    // Unmark cards that were hidden but no longer qualify (for example recycled cards).
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach(function (card) {
      if (!marked.has(card)) card.removeAttribute(HIDDEN_ATTR);
    });

    marked.forEach(function (card) {
      if (!card.hasAttribute(HIDDEN_ATTR)) card.setAttribute(HIDDEN_ATTR, '1');
    });

    hiddenCount = watchedCount;
    duplicatesHidden = repeatCount;
    applyRootClass();
    placeButton();
    updateButton();
  }

  let timer = null;
  function scheduleScan() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      scan();
    }, 250);
  }

  // ---------- switch ----------

  function createButton() {
    if (document.getElementById('ythw-toggle')) {
      button = document.getElementById('ythw-toggle');
      return;
    }
    button = document.createElement('div');
    button.id = 'ythw-toggle';
    button.setAttribute('role', 'switch');
    button.setAttribute('tabindex', '0');
    button.setAttribute('data-placement', 'floating');

    const label = document.createElement('span');
    label.id = 'ythw-label';
    label.textContent = 'Hide watched';

    const track = document.createElement('span');
    track.id = 'ythw-track';
    const thumb = document.createElement('span');
    thumb.id = 'ythw-thumb';
    track.appendChild(thumb);

    button.appendChild(label);
    button.appendChild(track);

    button.addEventListener('click', toggle);
    button.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    updateButton();
  }

  function toggle() {
    enabled = !enabled;
    saveEnabled(enabled);
    applyRootClass();
    updateButton();
  }

  // ---------- start ----------

  function start() {
    createButton();
    placeButton();
    applyRootClass();
    scan();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('yt-navigate-finish', function () {
      applyRootClass();
      scheduleScan();
    });
    window.addEventListener('scroll', scheduleScan, { passive: true });
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();
