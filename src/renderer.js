'use strict';
/* ════════════════════════════════════════════════════════
   SV Browser — Renderer
   ════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  tabs:         new Map(),   // id → { title, url, favicon, loading }
  activeTabId:  null,
  bookmarks:    [],
  settings:     {},
  showFullUrl:  false,
};

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  toolbar:        $('toolbar'),
  tabsContainer:  $('tabs-container'),
  addressBar:     $('address-bar'),
  securityIcon:   $('security-icon'),
  btnBack:        $('btn-back'),
  btnForward:     $('btn-forward'),
  btnReload:      $('btn-reload'),
  btnHome:        $('btn-home'),
  btnNewTab:      $('btn-new-tab'),
  btnBookmarkAdd: $('btn-bookmark-add'),
  btnManageBm:    $('btn-manage-bm'),
  btnSettings:    $('btn-settings'),
  bookmarkBar:    $('bookmark-bar'),
  bookmarksList:  $('bookmarks-list'),
  bmModal:        $('bm-modal'),
  bmModalList:    $('bm-modal-list'),
  bmModalClose:   $('bm-modal-close'),
  statusBar:      $('status-bar'),
  statusText:     $('status-text'),
  findBar:        $('find-bar'),
  findInput:      $('find-input'),
  findCount:      $('find-count'),
  findPrev:       $('find-prev'),
  findNext:       $('find-next'),
  findClose:      $('find-close'),
  downloadShelf:  $('download-shelf'),
};

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info', duration = 3000) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = `toast-${type}`;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
let statusTimer = null;
function setStatus(text) {
  dom.statusText.textContent = text;
  dom.statusBar.classList.toggle('visible', !!text);
  clearTimeout(statusTimer);
  if (!text) return;
}
function clearStatus() {
  statusTimer = setTimeout(() => dom.statusBar.classList.remove('visible'), 400);
}

// ─── URL Utils ────────────────────────────────────────────────────────────────
function isSecure(url) {
  return /^(https|file|about|data):/.test(url) || !url.includes('://');
}

function friendlyUrl(url) {
  if (state.showFullUrl) return url;
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return url;
    let display = u.hostname;
    if (u.pathname && u.pathname !== '/') display += u.pathname;
    if (u.search) display += u.search;
    return display;
  } catch { return url; }
}

function updateSecurity(url) {
  const secure = isSecure(url);
  dom.securityIcon.className = secure ? 'secure' : 'insecure';
  dom.securityIcon.title = secure ? 'Secure connection' : 'Not secure';
}

// ─── Address Bar ──────────────────────────────────────────────────────────────
function setAddressBar(url) {
  if (document.activeElement !== dom.addressBar) {
    dom.addressBar.value = friendlyUrl(url);
  }
  updateSecurity(url);
}

function updateNavButtons(canGoBack, canGoForward) {
  dom.btnBack.disabled    = !canGoBack;
  dom.btnForward.disabled = !canGoForward;
}

// ─── Tab Elements ─────────────────────────────────────────────────────────────
function makeFaviconEl(tabData) {
  if (tabData?.favicon) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tabData.favicon;
    img.onerror = () => { img.replaceWith(makeDefaultFavicon()); };
    img.dataset.role = 'favicon';
    return img;
  }
  return makeDefaultFavicon();
}

function makeDefaultFavicon() {
  const div = document.createElement('div');
  div.className = 'tab-favicon-placeholder';
  div.dataset.role = 'favicon';
  div.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" opacity=".3"/>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
  </svg>`;
  return div;
}

function makeSpinner() {
  const div = document.createElement('div');
  div.className = 'tab-loading-spinner';
  div.dataset.role = 'spinner';
  return div;
}

function createTabEl(id, url, title) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.id = id;

  const favicon = makeDefaultFavicon();
  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = title || 'New Tab';
  titleEl.dataset.role = 'title';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.title = 'Close Tab';
  closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>`;

  closeBtn.addEventListener('click', e => { e.stopPropagation(); window.sv.closeTab(id); });
  tab.addEventListener('click', () => { if (state.activeTabId !== id) window.sv.switchTab(id); });
  tab.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); window.sv.closeTab(id); } });

  tab.append(favicon, titleEl, closeBtn);
  return tab;
}

function getTabEl(id)  { return dom.tabsContainer.querySelector(`.tab[data-id="${id}"]`); }

function setActiveTabEl(id) {
  dom.tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const el = getTabEl(id);
  if (el) { el.classList.add('active'); el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }
}

function setTabLoading(id, loading) {
  const tab = getTabEl(id);
  if (!tab) return;

  const existing = tab.querySelector('[data-role="favicon"],[data-role="spinner"]');
  if (!existing) return;

  if (loading) {
    existing.replaceWith(makeSpinner());
  } else {
    const tabData = state.tabs.get(id);
    existing.replaceWith(makeFaviconEl(tabData));
  }
}

// ─── Bookmark Bar ─────────────────────────────────────────────────────────────
function renderBookmarkBar() {
  dom.bookmarksList.innerHTML = '';
  if (!state.bookmarks.length) {
    const msg = document.createElement('span');
    msg.className = 'bookmark-empty';
    msg.textContent = 'No bookmarks yet — Ctrl+D to save this page';
    dom.bookmarksList.appendChild(msg);
    return;
  }
  for (const bm of state.bookmarks) {
    const btn = document.createElement('button');
    btn.className = 'bookmark-btn';
    btn.title = bm.url;
    if (bm.favicon) {
      const img = document.createElement('img');
      img.src = bm.favicon;
      img.onerror = () => img.remove();
      btn.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = bm.title || bm.url;
    btn.appendChild(label);
    btn.addEventListener('click', () => window.sv.goto(state.activeTabId, bm.url));
    dom.bookmarksList.appendChild(btn);
  }
}

function renderBookmarkModal() {
  dom.bmModalList.innerHTML = '';
  if (!state.bookmarks.length) {
    const empty = document.createElement('div');
    empty.className = 'bm-empty';
    empty.textContent = 'No bookmarks saved yet.';
    dom.bmModalList.appendChild(empty);
    return;
  }
  state.bookmarks.forEach((bm, i) => {
    const item = document.createElement('div');
    item.className = 'bm-modal-item';
    if (bm.favicon) {
      const img = document.createElement('img');
      img.src = bm.favicon;
      img.onerror = () => img.remove();
      item.appendChild(img);
    }
    const info = document.createElement('div');
    info.className = 'bm-modal-info';
    info.innerHTML = `<div class="bm-modal-title">${esc(bm.title || bm.url)}</div>
                      <div class="bm-modal-url">${esc(bm.url)}</div>`;
    info.addEventListener('click', () => { window.sv.goto(state.activeTabId, bm.url); closeModal(); });
    const del = document.createElement('button');
    del.className = 'bm-delete-btn';
    del.title = 'Remove';
    del.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
    del.addEventListener('click', () => {
      state.bookmarks.splice(i, 1);
      window.sv.saveBookmarks(state.bookmarks);
      renderBookmarkBar();
      renderBookmarkModal();
    });
    item.append(info, del);
    dom.bmModalList.appendChild(item);
  });
}

function addBookmark() {
  const tabData = state.tabs.get(state.activeTabId);
  if (!tabData) return;
  const url   = tabData.url || dom.addressBar.value;
  const title = tabData.title || friendlyUrl(url);
  if (state.bookmarks.some(b => b.url === url)) { showToast('Already bookmarked'); return; }
  state.bookmarks.push({ title, url, favicon: tabData.favicon || '' });
  window.sv.saveBookmarks(state.bookmarks);
  renderBookmarkBar();
  // Flash the bookmark icon
  dom.btnBookmarkAdd.classList.add('active');
  setTimeout(() => dom.btnBookmarkAdd.classList.remove('active'), 1200);
  showToast(`✓ Bookmarked: ${title}`);
}

function closeModal() { dom.bmModal.classList.add('hidden'); }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Find In Page ─────────────────────────────────────────────────────────────
let findVisible = false;

function openFind() {
  findVisible = true;
  dom.findBar.classList.add('visible');
  dom.findInput.focus();
  dom.findInput.select();
}

function closeFind() {
  findVisible = false;
  dom.findBar.classList.remove('visible');
  dom.findCount.textContent = '';
  window.sv.findStop(state.activeTabId);
}

dom.findInput.addEventListener('input', () => {
  const q = dom.findInput.value;
  if (q) window.sv.findInPage(state.activeTabId, q, { findNext: true });
  else window.sv.findStop(state.activeTabId);
});

dom.findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { window.sv.findInPage(state.activeTabId, dom.findInput.value, { forward: !e.shiftKey, findNext: false }); }
  if (e.key === 'Escape') closeFind();
});

dom.findNext.addEventListener('click',  () => window.sv.findInPage(state.activeTabId, dom.findInput.value, { forward: true,  findNext: false }));
dom.findPrev.addEventListener('click',  () => window.sv.findInPage(state.activeTabId, dom.findInput.value, { forward: false, findNext: false }));
dom.findClose.addEventListener('click', closeFind);

// ─── Download Shelf ────────────────────────────────────────────────────────────
const downloads = new Map(); // filename → { el, barEl }

function addDownloadItem(filename) {
  const item = document.createElement('div');
  item.className = 'dl-item';

  const name = document.createElement('span');
  name.className = 'dl-name';
  name.textContent = filename.length > 24 ? '…' + filename.slice(-22) : filename;
  name.title = filename;

  const bar = document.createElement('div');
  bar.className = 'dl-bar';
  const fill = document.createElement('div');
  fill.className = 'dl-fill';
  bar.appendChild(fill);

  const status = document.createElement('span');
  status.className = 'dl-status';
  status.textContent = '…';

  item.append(name, bar, status);
  dom.downloadShelf.prepend(item);
  dom.downloadShelf.classList.add('visible');
  downloads.set(filename, { el: item, fillEl: fill, statusEl: status });

  // Auto-hide shelf after 8s of inactivity
  clearTimeout(dom.downloadShelf._timer);
}

window.sv.on('download-started',  filename => addDownloadItem(filename));

window.sv.on('download-progress', (filename, pct) => {
  const d = downloads.get(filename);
  if (!d) return;
  d.fillEl.style.width = pct >= 0 ? `${pct}%` : '60%';
  d.statusEl.textContent = pct >= 0 ? `${pct}%` : 'Downloading…';
});

window.sv.on('download-done', (filename, state_, savePath) => {
  const d = downloads.get(filename);
  if (!d) return;
  d.fillEl.style.width = state_ === 'completed' ? '100%' : '0%';
  d.statusEl.textContent = state_ === 'completed' ? '✓ Done' : '✗ Failed';
  if (state_ === 'completed') {
    d.statusEl.style.color = 'var(--success)';
    d.statusEl.style.cursor = 'pointer';
    d.statusEl.title = 'Open file';
    d.statusEl.addEventListener('click', () => window.sv.openFile(savePath));
  }
  // Auto-remove after 6s
  setTimeout(() => {
    d.el.remove();
    downloads.delete(filename);
    if (!dom.downloadShelf.children.length) dom.downloadShelf.classList.remove('visible');
  }, 6000);
});

// ─── Button Events ────────────────────────────────────────────────────────────
dom.btnBack.addEventListener('click',    () => window.sv.back(state.activeTabId));
dom.btnForward.addEventListener('click', () => window.sv.forward(state.activeTabId));
dom.btnHome.addEventListener('click',    () => window.sv.home(state.activeTabId));

// Reload / Stop toggle
dom.btnReload.addEventListener('click', () => {
  const tabData = state.tabs.get(state.activeTabId);
  if (tabData?.loading) window.sv.stop(state.activeTabId);
  else                   window.sv.reload(state.activeTabId);
});

dom.btnNewTab.addEventListener('click',      () => window.sv.createTab());
dom.btnBookmarkAdd.addEventListener('click', addBookmark);
dom.btnSettings.addEventListener('click',    () => window.sv.createTab('sv-settings'));

dom.btnManageBm.addEventListener('click', () => {
  renderBookmarkModal();
  dom.bmModal.classList.remove('hidden');
});
dom.bmModalClose.addEventListener('click', closeModal);
dom.bmModal.addEventListener('click', e => { if (e.target === dom.bmModal) closeModal(); });

// Address bar
dom.addressBar.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = dom.addressBar.value.trim();
    if (val) window.sv.goto(state.activeTabId, val);
    dom.addressBar.blur();
  }
  if (e.key === 'Escape') { dom.addressBar.blur(); }
});
dom.addressBar.addEventListener('focus', () => {
  // Show full URL on focus
  const tabData = state.tabs.get(state.activeTabId);
  if (tabData?.url) dom.addressBar.value = tabData.url;
  dom.addressBar.select();
});
dom.addressBar.addEventListener('blur', () => {
  const tabData = state.tabs.get(state.activeTabId);
  if (tabData?.url) setAddressBar(tabData.url);
});

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape' && findVisible) { closeFind(); return; }
  if (ctrl && e.key === 't') { e.preventDefault(); window.sv.createTab(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); window.sv.closeTab(state.activeTabId); }
  if (ctrl && e.key === 'r') { e.preventDefault(); window.sv.reload(state.activeTabId); }
  if (ctrl && e.key === 'd') { e.preventDefault(); addBookmark(); }
  if (ctrl && e.key === 'l') { e.preventDefault(); dom.addressBar.focus(); }
  if (ctrl && e.key === 'f') { e.preventDefault(); openFind(); }
  if (ctrl && e.key === 'b') { e.preventDefault(); toggleBookmarkBar(); }
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); window.sv.back(state.activeTabId); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); window.sv.forward(state.activeTabId); }
  if (e.altKey && e.key === 'Home')       { e.preventDefault(); window.sv.home(state.activeTabId); }
  // Ctrl+Tab / Ctrl+Shift+Tab handled by app menu — but also support Ctrl+1-9
  if (ctrl && !e.shiftKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const tabs = dom.tabsContainer.querySelectorAll('.tab');
    const idx  = parseInt(e.key) - 1;
    if (tabs[idx]) window.sv.switchTab(parseInt(tabs[idx].dataset.id));
  }
});

// ─── Bookmark Bar Toggle ──────────────────────────────────────────────────────
function toggleBookmarkBar(force) {
  const show = force !== undefined ? force : !dom.bookmarkBar.classList.contains('visible');
  dom.bookmarkBar.classList.toggle('visible', show);
}

// ─── IPC Event Handlers ───────────────────────────────────────────────────────
window.sv.on('settings-loaded', settings => {
  state.settings   = settings;
  state.bookmarks  = settings.bookmarks || [];
  state.showFullUrl = !!settings.showFullUrl;
  toggleBookmarkBar(settings.showBookmarkBar !== false);
  renderBookmarkBar();
});

window.sv.on('preferences-updated', settings => {
  state.settings    = settings;
  state.showFullUrl = !!settings.showFullUrl;
  toggleBookmarkBar(settings.showBookmarkBar !== false);
});

window.sv.on('tab-created', (id, url, isActive) => {
  state.tabs.set(id, { title: 'New Tab', url, favicon: '', loading: false });
  const el = createTabEl(id, url, 'New Tab');
  dom.tabsContainer.appendChild(el);
  if (isActive) setActiveTabEl(id);
});

window.sv.on('tab-closed', id => {
  state.tabs.delete(id);
  getTabEl(id)?.remove();
});

window.sv.on('tab-switched', (id, info) => {
  state.activeTabId = id;
  setActiveTabEl(id);
  setAddressBar(info.url || '');
  updateNavButtons(info.canGoBack, info.canGoForward);
  const tabData = state.tabs.get(id);
  if (tabData) { tabData.url = info.url; tabData.title = info.title; }
  // Sync reload button
  dom.btnReload.classList.toggle('is-stop', !!info.loading);
});

window.sv.on('tab-cycle', id => {
  state.activeTabId = id;
  setActiveTabEl(id);
});

window.sv.on('tab-state-update', (id, info) => {
  const tabData = state.tabs.get(id);
  if (tabData) tabData.url = info.url;
  if (id === state.activeTabId) {
    setAddressBar(info.url);
    updateNavButtons(info.canGoBack, info.canGoForward);
  }
});

window.sv.on('tab-title-changed', (id, title) => {
  const tabData = state.tabs.get(id);
  if (tabData) tabData.title = title;
  const el = getTabEl(id);
  if (el) { const t = el.querySelector('.tab-title'); if (t) t.textContent = title || 'Untitled'; }
});

window.sv.on('tab-favicon-changed', (id, faviconUrl) => {
  const tabData = state.tabs.get(id);
  if (tabData) tabData.favicon = faviconUrl;
  const el = getTabEl(id);
  if (!el || !faviconUrl) return;
  const existing = el.querySelector('[data-role="favicon"],[data-role="spinner"]');
  if (existing) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = faviconUrl;
    img.dataset.role = 'favicon';
    img.onerror = () => img.replaceWith(makeDefaultFavicon());
    existing.replaceWith(img);
  }
});

window.sv.on('tab-loading', (id, loading) => {
  const tabData = state.tabs.get(id);
  if (tabData) tabData.loading = loading;
  setTabLoading(id, loading);
  if (id === state.activeTabId) {
    dom.btnReload.classList.toggle('is-stop', loading);
    dom.btnReload.title = loading ? 'Stop (Esc)' : 'Reload (Ctrl+R)';
  }
});

window.sv.on('find-start', () => openFind());
window.sv.on('show-toast', msg => showToast(msg));

// ─── Link hover → status ──────────────────────────────────────────────────────
document.addEventListener('mouseover', e => {
  const a = e.target.closest('a[href]');
  if (a) setStatus(a.href);
});
document.addEventListener('mouseout', e => {
  if (e.target.closest('a[href]')) clearStatus();
});
