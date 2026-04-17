// Local-only Task Tracker. Storage: localStorage (key: tt_tasks_v1)
(() => {
  const STORAGE_KEY = 'tt_tasks_v1';
  const STATUSES = [
    { id: 'todo', label: 'To Do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'in_review', label: 'In Review' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'done', label: 'Done' },
  ];
  const PRIORITIES = [
    { id: 'highest', label: 'Highest', rank: 5 },
    { id: 'high', label: 'High', rank: 4 },
    { id: 'medium', label: 'Medium', rank: 3 },
    { id: 'low', label: 'Low', rank: 2 },
    { id: 'lowest', label: 'Lowest', rank: 1 },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- State ----------
  let state = {
    tasks: [],
    view: 'board', // board | list | completed
    filters: { search: '', status: 'all', priority: 'all', sortBy: 'created_desc', showCompleted: true },
    editingId: null,
  };

  function uid() { return 'T-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function now() { return new Date().toISOString(); }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.tasks = JSON.parse(raw);
    } catch (e) { console.error('Load failed', e); state.tasks = []; }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks)); }

  function findTask(id) { return state.tasks.find(t => t.id === id); }

  function createTask(partial = {}) {
    const t = {
      id: uid(),
      title: partial.title || 'Untitled task',
      description: partial.description || '',
      status: partial.status || 'todo',
      priority: partial.priority || 'medium',
      due: partial.due || '',
      labels: partial.labels || [],
      subtasks: partial.subtasks || [],
      notes: partial.notes || [],
      createdAt: now(),
      updatedAt: now(),
    };
    state.tasks.push(t);
    save();
    return t;
  }

  function updateTask(id, patch) {
    const t = findTask(id); if (!t) return;
    Object.assign(t, patch, { updatedAt: now() });
    save();
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save();
  }

  // ---------- Derived ----------
  function filteredTasks(scope = 'active') {
    const q = state.filters.search.trim().toLowerCase();
    let list = state.tasks.slice();

    if (scope === 'completed') list = list.filter(t => t.status === 'done');
    else if (scope === 'active') {
      if (!state.filters.showCompleted) list = list.filter(t => t.status !== 'done');
    }

    if (state.filters.status !== 'all') list = list.filter(t => t.status === state.filters.status);
    if (state.filters.priority !== 'all') list = list.filter(t => t.priority === state.filters.priority);

    if (q) {
      list = list.filter(t => {
        const hay = [
          t.title, t.description, t.id,
          ...(t.labels || []),
          ...(t.subtasks || []).map(s => s.title),
          ...(t.notes || []).map(n => n.text),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    const sortBy = state.filters.sortBy;
    const priRank = id => (PRIORITIES.find(p => p.id === id)?.rank || 0);
    const statusRank = id => STATUSES.findIndex(s => s.id === id);
    list.sort((a, b) => {
      switch (sortBy) {
        case 'created_asc': return a.createdAt.localeCompare(b.createdAt);
        case 'created_desc': return b.createdAt.localeCompare(a.createdAt);
        case 'due_asc': return (a.due || '9999').localeCompare(b.due || '9999');
        case 'due_desc': return (b.due || '0').localeCompare(a.due || '0');
        case 'priority': return priRank(b.priority) - priRank(a.priority);
        case 'title': return a.title.localeCompare(b.title);
        case 'status': return statusRank(a.status) - statusRank(b.status);
        default: return 0;
      }
    });
    return list;
  }

  // ---------- Render ----------
  function render() {
    const main = $('#main');
    main.innerHTML = '';
    if (state.view === 'board') renderBoard(main);
    else if (state.view === 'list') renderList(main);
    else if (state.view === 'completed') renderCompleted(main);
  }

  function renderBoard(root) {
    const list = filteredTasks('active');
    const board = document.createElement('div');
    board.className = 'board';
    STATUSES.forEach(s => {
      const col = document.createElement('div');
      col.className = 'column';
      col.dataset.status = s.id;
      const items = list.filter(t => t.status === s.id);
      col.innerHTML = `
        <div class="col-header">
          <div class="col-title"><span class="pill st-${s.id}"><span class="dot"></span>${s.label}</span></div>
          <span class="col-count">${items.length}</span>
        </div>
        <div class="col-body"></div>
      `;
      const body = $('.col-body', col);
      items.forEach(t => body.appendChild(card(t)));
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.style.padding = '8px 4px';
        empty.textContent = 'Drop tasks here';
        body.appendChild(empty);
      }
      // Drop target wiring
      body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        body.classList.add('drop-target');
      });
      body.addEventListener('dragleave', (e) => {
        if (!body.contains(e.relatedTarget)) body.classList.remove('drop-target');
      });
      body.addEventListener('drop', (e) => {
        e.preventDefault();
        body.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        const task = findTask(id);
        if (!task || task.status === s.id) return;
        updateTask(id, { status: s.id });
        render();
        toast(`Moved to ${s.label}`);
      });
      board.appendChild(col);
    });
    root.appendChild(board);
    if (!list.length) root.appendChild(emptyState('No tasks match your filters. Create one to get started.'));
  }

  function renderList(root) {
    const list = filteredTasks('active');
    if (!list.length) { root.appendChild(emptyState('Nothing here yet.')); return; }
    const wrap = document.createElement('div');
    wrap.className = 'list';
    list.forEach(t => wrap.appendChild(card(t, true)));
    root.appendChild(wrap);
  }

  function renderCompleted(root) {
    const list = filteredTasks('completed');
    if (!list.length) { root.appendChild(emptyState('No completed tasks yet. Finish something!')); return; }
    const wrap = document.createElement('div');
    wrap.className = 'completed-grid';
    list.forEach(t => wrap.appendChild(card(t)));
    root.appendChild(wrap);
  }

  function emptyState(msg) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = msg;
    return d;
  }

  function card(t, listMode = false) {
    const el = document.createElement('div');
    el.className = `card pri-${t.priority}`;
    el.draggable = true;
    el.dataset.id = t.id;
    el.addEventListener('dragstart', (e) => {
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    const subDone = (t.subtasks || []).filter(s => s.done).length;
    const subTotal = (t.subtasks || []).length;
    const pct = subTotal ? Math.round((subDone / subTotal) * 100) : 0;
    const dueInfo = dueBadge(t.due, t.status);
    const pri = PRIORITIES.find(p => p.id === t.priority);
    const stat = STATUSES.find(s => s.id === t.status);
    el.innerHTML = `
      <div class="title">${escapeHtml(t.title)}</div>
      ${t.description ? `<div class="desc">${escapeHtml(t.description)}</div>` : ''}
      <div class="card-row">
        <div class="card-meta">
          <span class="pill st-${t.status}"><span class="dot"></span>${stat?.label || t.status}</span>
          <span class="pill pri-${t.priority}"><span class="dot"></span>${pri?.label || t.priority}</span>
        </div>
        <div class="card-meta">
          ${dueInfo ? `<span class="due ${dueInfo.cls}">${dueInfo.text}</span>` : ''}
          <span class="task-id">${t.id}</span>
        </div>
      </div>
      ${(t.labels || []).length ? `<div class="labels">${t.labels.map(l => `<span class="label">${escapeHtml(l)}</span>`).join('')}</div>` : ''}
      ${subTotal ? `
        <div class="card-meta" style="margin-top:8px; justify-content: space-between;">
          <span>Subtasks ${subDone}/${subTotal}</span>
          <span>${pct}%</span>
        </div>
        <div class="progress"><span style="width:${pct}%"></span></div>
      ` : ''}
    `;
    el.addEventListener('click', () => openModal(t.id));
    return el;
  }

  function dueBadge(due, status) {
    if (!due) return null;
    const d = new Date(due + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((d - today) / (1000*60*60*24));
    if (status === 'done') return { cls: '', text: 'Due ' + formatDate(d) };
    if (diff < 0) return { cls: 'overdue', text: `Overdue ${Math.abs(diff)}d` };
    if (diff === 0) return { cls: 'soon', text: 'Due today' };
    if (diff <= 3) return { cls: 'soon', text: `Due in ${diff}d` };
    return { cls: '', text: 'Due ' + formatDate(d) };
  }
  function formatDate(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // Detect URLs and classify them into services for chip rendering
  const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/g;
  function classifyUrl(url) {
    let u;
    try { u = new URL(url); } catch { return { svc: 'web', icon: '🔗', label: url }; }
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;

    if (host === 'docs.google.com') {
      if (path.startsWith('/document'))     return { svc: 'doc',   icon: 'D', label: 'Google Doc' };
      if (path.startsWith('/spreadsheets')) return { svc: 'sheet', icon: 'S', label: 'Google Sheet' };
      if (path.startsWith('/presentation'))return { svc: 'slide', icon: 'P', label: 'Google Slides' };
      if (path.startsWith('/forms'))        return { svc: 'form',  icon: 'F', label: 'Google Form' };
      return { svc: 'doc', icon: 'G', label: 'Google Docs' };
    }
    if (host === 'drive.google.com')   return { svc: 'drive',  icon: 'D', label: 'Google Drive' };
    if (host === 'meet.google.com')    return { svc: 'doc',    icon: 'M', label: 'Google Meet' };
    if (host === 'calendar.google.com')return { svc: 'doc',    icon: 'C', label: 'Google Calendar' };
    if (host === 'mail.google.com' || host === 'gmail.com') return { svc: 'doc', icon: 'M', label: 'Gmail' };
    if (host === 'youtube.com' || host === 'youtu.be')      return { svc: 'yt',  icon: '▶', label: 'YouTube' };
    if (host === 'github.com') {
      const parts = path.split('/').filter(Boolean);
      const label = parts.length >= 2 ? `GitHub · ${parts[0]}/${parts[1]}` : 'GitHub';
      return { svc: 'gh', icon: 'G', label };
    }
    if (host.endsWith('figma.com'))   return { svc: 'fig',    icon: 'F', label: 'Figma' };
    if (host.endsWith('notion.so') || host.endsWith('notion.site')) return { svc: 'notion', icon: 'N', label: 'Notion' };
    if (host.endsWith('slack.com'))   return { svc: 'slack',  icon: 'S', label: 'Slack' };
    if (host.endsWith('atlassian.net') || host.endsWith('jira.com')) return { svc: 'doc', icon: 'J', label: 'Jira' };
    if (host.endsWith('linear.app')) return { svc: 'notion', icon: 'L', label: 'Linear' };
    return { svc: 'web', icon: '🔗', label: host };
  }
  function chipHtml(url) {
    const info = classifyUrl(url);
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="link-chip" data-svc="${info.svc}" title="${escapeHtml(url)}" onclick="event.stopPropagation()"><span class="chip-icon">${escapeHtml(info.icon)}</span><span class="chip-label">${escapeHtml(info.label)}</span></a>`;
  }
  function renderRichText(text) {
    if (!text) return '';
    const parts = String(text).split(URL_REGEX);
    return parts.map(part => {
      if (!part) return '';
      if (/^https?:\/\//.test(part)) return chipHtml(part);
      return escapeHtml(part);
    }).join('');
  }

  // ---------- Modal ----------
  function openModal(id) {
    let t;
    if (id) { t = findTask(id); if (!t) return; }
    else { t = { id: '', title: '', description: '', status: 'todo', priority: 'medium', due: '', labels: [], subtasks: [], notes: [] }; }
    state.editingId = id || null;

    $('#modalTitle').textContent = id ? `Edit ${t.id}` : 'New Task';
    $('#fTitle').value = t.title;
    $('#fDesc').value = t.description;
    $('#fStatus').value = t.status;
    $('#fPriority').value = t.priority;
    $('#fDue').value = t.due || '';
    $('#fLabels').value = (t.labels || []).join(', ');
    renderSubList(t.subtasks || []);
    renderNoteList(t.notes || []);
    $('#metaCreated').textContent = id ? `Created: ${formatDateTime(t.createdAt)}` : '';
    $('#metaUpdated').textContent = id ? `Updated: ${formatDateTime(t.updatedAt)}` : '';
    $('#btnDelete').style.visibility = id ? 'visible' : 'hidden';

    $('#modal').classList.remove('hidden');
    setTimeout(() => $('#fTitle').focus(), 50);
  }
  function closeModal() {
    $('#modal').classList.add('hidden');
    state.editingId = null;
  }

  function renderSubList(subs) {
    const ul = $('#subList'); ul.innerHTML = '';
    subs.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'sub-item' + (s.done ? ' done' : '');
      li.innerHTML = `
        <input type="checkbox" ${s.done ? 'checked' : ''} data-i="${i}" class="sub-chk" />
        <input type="text" value="${escapeHtml(s.title)}" data-i="${i}" class="sub-title" />
        <button class="icon-btn sub-del" data-i="${i}" title="Remove">&times;</button>
      `;
      ul.appendChild(li);
    });
  }
  function renderNoteList(notes) {
    const ul = $('#noteList'); ul.innerHTML = '';
    notes.forEach((n, i) => {
      const li = document.createElement('li');
      li.className = 'note-item';
      const rendered = renderRichText(n.text);
      li.innerHTML = `
        <div class="note-view rich-text" data-i="${i}">${rendered || '<span class="note-placeholder">Click to edit...</span>'}</div>
        <textarea data-i="${i}" class="note-text" rows="2" style="display:none;">${escapeHtml(n.text)}</textarea>
        <div class="note-meta">
          <span>${formatDateTime(n.at)}</span>
          <button class="btn small ghost note-del" data-i="${i}">Delete</button>
        </div>
      `;
      ul.appendChild(li);
    });
  }

  function enterNoteEdit(view) {
    const li = view.closest('.note-item');
    const ta = $('.note-text', li);
    view.style.display = 'none';
    ta.style.display = '';
    ta.focus();
    // Place cursor at end
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
  function exitNoteEdit(ta) {
    const li = ta.closest('.note-item');
    const view = $('.note-view', li);
    view.innerHTML = renderRichText(ta.value) || '<span class="note-placeholder">Click to edit...</span>';
    ta.style.display = 'none';
    view.style.display = '';
  }

  function collectFormSubs() {
    const ul = $('#subList');
    return $$('.sub-item', ul).map(li => ({
      title: $('.sub-title', li).value.trim(),
      done: $('.sub-chk', li).checked,
    })).filter(s => s.title);
  }
  function collectFormNotes(existing) {
    const ul = $('#noteList');
    return $$('.note-item', ul).map((li, i) => ({
      text: $('.note-text', li).value.trim(),
      at: existing[i]?.at || now(),
    })).filter(n => n.text);
  }

  function saveFromModal() {
    const title = $('#fTitle').value.trim();
    if (!title) { toast('Title is required'); return; }
    const labels = $('#fLabels').value.split(',').map(s => s.trim()).filter(Boolean);
    const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
    const data = {
      title,
      description: $('#fDesc').value.trim(),
      status: $('#fStatus').value,
      priority: $('#fPriority').value,
      due: $('#fDue').value,
      labels,
      subtasks: collectFormSubs(),
      notes: collectFormNotes(existing),
    };
    if (state.editingId) {
      updateTask(state.editingId, data);
      toast('Task updated');
    } else {
      createTask(data);
      toast('Task created');
    }
    closeModal();
    render();
  }

  function deleteFromModal() {
    if (!state.editingId) return;
    if (!confirm('Delete this task permanently?')) return;
    deleteTask(state.editingId);
    closeModal();
    render();
    toast('Task deleted');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  // ---------- Export / Import ----------
  // IndexedDB helpers to persist the chosen backup directory handle
  const IDB_NAME = 'tt_meta';
  const IDB_STORE = 'handles';
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function verifyPermission(dirHandle, readWrite = true) {
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
    if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  async function pickBackupFolder() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support choosing a folder (Safari/Firefox). Backups will go to your Downloads folder instead. For folder support, try Chrome, Edge, or Brave.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet('backupDir', handle);
      toast(`Backup folder set: ${handle.name}`);
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not set folder: ' + e.message);
    }
  }

  function backupFilename() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `tasks-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
  }

  async function exportJson() {
    const json = JSON.stringify(state.tasks, null, 2);
    const filename = backupFilename();

    // Try saving into the chosen folder's /backup subfolder
    if ('showDirectoryPicker' in window) {
      try {
        const dir = await idbGet('backupDir');
        if (dir && await verifyPermission(dir, true)) {
          const backupDir = await dir.getDirectoryHandle('backup', { create: true });
          const fileHandle = await backupDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(json);
          await writable.close();
          toast(`Saved to ${dir.name}/backup/${filename}`);
          return;
        }
      } catch (e) {
        console.warn('Folder save failed, falling back to download', e);
      }
    }

    // Fallback: normal browser download
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename}`);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Invalid file');
        if (!confirm(`Import ${data.length} tasks? This will replace your current tasks.`)) return;
        // minimal normalization
        state.tasks = data.map(t => ({
          id: t.id || uid(),
          title: t.title || 'Untitled',
          description: t.description || '',
          status: t.status || 'todo',
          priority: t.priority || 'medium',
          due: t.due || '',
          labels: t.labels || [],
          subtasks: t.subtasks || [],
          notes: t.notes || [],
          createdAt: t.createdAt || now(),
          updatedAt: t.updatedAt || now(),
        }));
        save(); render(); toast('Import complete');
      } catch (e) { alert('Import failed: ' + e.message); }
    };
    reader.readAsText(file);
  }

  // ---------- Events ----------
  function bind() {
    $('#btnNew').addEventListener('click', () => openModal(null));
    $('#modalClose').addEventListener('click', closeModal);
    $('#btnCancel').addEventListener('click', closeModal);
    $('#btnSave').addEventListener('click', saveFromModal);
    $('#btnDelete').addEventListener('click', deleteFromModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('#modal').classList.contains('hidden')) saveFromModal();
    });

    $('#btnAddSub').addEventListener('click', () => {
      const subs = collectFormSubs();
      subs.push({ title: '', done: false });
      renderSubList(subs);
      const inputs = $$('.sub-title');
      inputs[inputs.length - 1]?.focus();
    });
    $('#subList').addEventListener('click', (e) => {
      if (e.target.classList.contains('sub-del')) {
        const subs = collectFormSubs();
        const i = Number(e.target.dataset.i);
        subs.splice(i, 1);
        renderSubList(subs);
      }
    });
    $('#subList').addEventListener('change', (e) => {
      if (e.target.classList.contains('sub-chk')) {
        const li = e.target.closest('.sub-item');
        li.classList.toggle('done', e.target.checked);
      }
    });

    $('#btnAddNote').addEventListener('click', () => {
      const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
      const notes = collectFormNotes(existing);
      notes.push({ text: '', at: now() });
      renderNoteList(notes);
      const views = $$('.note-view');
      if (views.length) enterNoteEdit(views[views.length - 1]);
    });
    $('#noteList').addEventListener('click', (e) => {
      if (e.target.classList.contains('note-del')) {
        const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
        const notes = collectFormNotes(existing);
        const i = Number(e.target.dataset.i);
        notes.splice(i, 1);
        renderNoteList(notes);
        return;
      }
      // Don't steal clicks on chip links
      if (e.target.closest('.link-chip')) return;
      const view = e.target.closest('.note-view');
      if (view) enterNoteEdit(view);
    });
    $('#noteList').addEventListener('blur', (e) => {
      if (e.target.classList.contains('note-text')) exitNoteEdit(e.target);
    }, true);

    // Controls
    $('#search').addEventListener('input', (e) => { state.filters.search = e.target.value; render(); });
    $('#filterStatus').addEventListener('change', (e) => { state.filters.status = e.target.value; render(); });
    $('#filterPriority').addEventListener('change', (e) => { state.filters.priority = e.target.value; render(); });
    $('#sortBy').addEventListener('change', (e) => { state.filters.sortBy = e.target.value; render(); });
    $('#showCompleted').addEventListener('change', (e) => { state.filters.showCompleted = e.target.checked; render(); });

    $$('.view-toggle .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.view-toggle .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.view = btn.dataset.view;
        render();
      });
    });

    $('#btnExport').addEventListener('click', exportJson);
    $('#btnBackupDir').addEventListener('click', pickBackupFolder);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '';
    });
  }

  function seedIfEmpty() {
    if (state.tasks.length) return;
    createTask({
      title: 'Welcome to your local Task Tracker',
      description: 'Click this card to edit. Add subtasks, notes, labels, a due date, and move it through statuses like in JIRA.',
      status: 'todo',
      priority: 'high',
      labels: ['welcome', 'demo'],
      subtasks: [
        { title: 'Create your first real task', done: false },
        { title: 'Try changing status and priority', done: false },
        { title: 'Export your data as backup', done: false },
      ],
      notes: [{ text: 'Tip: Cmd/Ctrl + Enter saves the modal. Esc closes it.', at: now() }],
    });
  }

  // ---------- Init ----------
  load();
  seedIfEmpty();
  bind();
  render();
})();
