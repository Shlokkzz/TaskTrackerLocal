// Local-only Task Tracker. Storage: localStorage (tt_tasks_v1, tt_sprints_v1)
(() => {
  const STORAGE_KEY = 'tt_tasks_v1';
  const SPRINTS_KEY = 'tt_sprints_v1';

  const STATUSES = [
    { id: 'todo',        label: 'To Do'       },
    { id: 'in_progress', label: 'In Progress'  },
    { id: 'in_review',   label: 'In Review'   },
    { id: 'blocked',     label: 'Blocked'     },
    { id: 'done',        label: 'Done'        },
  ];
  const PRIORITIES = [
    { id: 'highest', label: 'Highest', rank: 5 },
    { id: 'high',    label: 'High',    rank: 4 },
    { id: 'medium',  label: 'Medium',  rank: 3 },
    { id: 'low',     label: 'Low',     rank: 2 },
    { id: 'lowest',  label: 'Lowest',  rank: 1 },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- State ----------
  let state = {
    tasks:   [],
    sprints: [],
    view:    'board',
    filters: { search: '', status: 'all', priority: 'all', sortBy: 'created_desc', showCompleted: false, sprint: 'active' },
    editingId: null,
  };

  function uid()       { return 'T-'  + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function sprintUid() { return 'SP-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  function now()       { return new Date().toISOString(); }
  function todayStr()  { return new Date().toISOString().split('T')[0]; }

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.tasks = JSON.parse(raw);
    } catch(e) { console.error('Load tasks failed', e); state.tasks = []; }
    try {
      const raw = localStorage.getItem(SPRINTS_KEY);
      if (raw) state.sprints = JSON.parse(raw);
    } catch(e) { console.error('Load sprints failed', e); state.sprints = []; }
  }
  function save()        { localStorage.setItem(STORAGE_KEY,  JSON.stringify(state.tasks));   }
  function saveSprints() { localStorage.setItem(SPRINTS_KEY,  JSON.stringify(state.sprints)); }

  // ---------- Migration: old data → default sprint ----------
  function migrateToSprints() {
    if (state.tasks.length === 0 || state.sprints.length > 0) return;
    const earliest = state.tasks.reduce(
      (min, t) => (t.createdAt < min ? t.createdAt : min),
      state.tasks[0].createdAt
    );
    const sprint = {
      id:        sprintUid(),
      name:      'Sprint 1',
      startDate: earliest.split('T')[0],
      endDate:   null,
      status:    'active',
      collapsed: false,
      createdAt: now(),
    };
    state.sprints.push(sprint);
    state.tasks.forEach(t => { if (!t.sprintId) t.sprintId = sprint.id; });
    save();
    saveSprints();
  }

  function findTask(id)   { return state.tasks.find(t => t.id === id); }
  function findSprint(id) { return state.sprints.find(s => s.id === id); }

  // ---------- Task CRUD ----------
  function createTask(partial = {}) {
    const activeSprint = state.sprints.find(s => s.status === 'active');
    const t = {
      id:          uid(),
      title:       partial.title       || 'Untitled task',
      description: partial.description || '',
      status:      partial.status      || 'todo',
      priority:    partial.priority    || 'medium',
      due:         partial.due         || '',
      labels:      partial.labels      || [],
      subtasks:    partial.subtasks    || [],
      notes:       partial.notes       || [],
      focused:     partial.focused     || false,
      sprintId:    partial.sprintId !== undefined ? partial.sprintId : (activeSprint?.id || null),
      createdAt:   now(),
      updatedAt:   now(),
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

  // ---------- Sprint CRUD ----------
  function createSprint(partial = {}) {
    const name = partial.name || `Sprint · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const s = {
      id:        sprintUid(),
      name,
      startDate: partial.startDate || todayStr(),
      endDate:   partial.endDate   || null,
      status:    partial.status    || 'planned',
      collapsed: false,
      createdAt: now(),
    };
    state.sprints.push(s);
    saveSprints();
    return s;
  }
  function updateSprint(id, patch) {
    const s = findSprint(id); if (!s) return;
    Object.assign(s, patch);
    saveSprints();
  }

  function startSprint(id) {
    const current = state.sprints.find(s => s.status === 'active' && s.id !== id);
    if (current) {
      if (!confirm(`"${current.name}" is currently active. Complete it first?`)) return;
      updateSprint(current.id, { status: 'completed', endDate: todayStr() });
    }
    updateSprint(id, { status: 'active', startDate: findSprint(id)?.startDate || todayStr() });
    render();
    toast(`🚀 ${findSprint(id)?.name} started`);
  }

  function completeSprint(id) {
    const sp = findSprint(id);
    if (!confirm(`Complete sprint "${sp?.name}"?`)) return;
    updateSprint(id, { status: 'completed', endDate: todayStr() });
    render();
    toast('✅ Sprint completed');
  }

  function promptCreateSprint() {
    const defaultName = `Sprint · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const name = prompt('Sprint name:', defaultName);
    if (name === null) return; // cancelled

    const activeTasks = state.tasks.filter(t => t.status !== 'done');
    let moveTasks = false;
    if (activeTasks.length) {
      moveTasks = confirm(`Move ${activeTasks.length} active task${activeTasks.length !== 1 ? 's' : ''} to the new sprint?\n\nOK = move tasks · Cancel = create empty sprint`);
    }

    const sprint = createSprint({ name: name.trim() || defaultName, status: 'planned' });
    if (moveTasks) activeTasks.forEach(t => updateTask(t.id, { sprintId: sprint.id }));
    render();
    toast(`Sprint "${sprint.name}" created`);
  }

  // ---------- Derived ----------
  function filteredTasks(scope = 'active') {
    const q = state.filters.search.trim().toLowerCase();
    let list = state.tasks.slice();

    if (scope === 'completed') {
      list = list.filter(t => t.status === 'done');
    } else if (scope === 'active') {
      if (!state.filters.showCompleted) list = list.filter(t => t.status !== 'done');
    }

    if (state.filters.status   !== 'all') list = list.filter(t => t.status   === state.filters.status);
    if (state.filters.priority !== 'all') list = list.filter(t => t.priority === state.filters.priority);

    if (q) {
      list = list.filter(t => {
        const hay = [
          t.title, t.description, t.id,
          ...(t.labels   || []),
          ...(t.subtasks || []).map(s => s.title),
          ...(t.notes    || []).map(n => n.text),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    // Sprint filter (board view only; list view groups by sprint itself)
    if (scope === 'active' && state.filters.sprint !== 'all') {
      if (state.filters.sprint === 'active') {
        const active = state.sprints.find(s => s.status === 'active');
        if (active) list = list.filter(t => t.sprintId === active.id);
        else list = [];
      } else {
        list = list.filter(t => t.sprintId === state.filters.sprint);
      }
    }

    const sortBy    = state.filters.sortBy;
    const priRank   = id => PRIORITIES.find(p => p.id === id)?.rank || 0;
    const statRank  = id => STATUSES.findIndex(s => s.id === id);
    list.sort((a, b) => {
      switch (sortBy) {
        case 'created_asc':  return a.createdAt.localeCompare(b.createdAt);
        case 'created_desc': return b.createdAt.localeCompare(a.createdAt);
        case 'due_asc':      return (a.due || '9999').localeCompare(b.due || '9999');
        case 'due_desc':     return (b.due || '0').localeCompare(a.due || '0');
        case 'priority':     return priRank(b.priority) - priRank(a.priority);
        case 'title':        return a.title.localeCompare(b.title);
        case 'status':       return statRank(a.status)  - statRank(b.status);
        default:             return 0;
      }
    });
    return list;
  }

  // ---------- Render ----------
  function render() {
    renderFocusStrip();
    updateSprintFilterOptions();
    const main = $('#main');
    main.innerHTML = '';
    if      (state.view === 'board')     renderBoard(main);
    else if (state.view === 'list')      renderList(main);
    else if (state.view === 'completed') renderCompleted(main);
  }

  function updateSprintFilterOptions() {
    const sel = $('#filterSprint');
    if (!sel) return;
    const cur = state.filters.sprint;
    sel.innerHTML = `
      <option value="all">All sprints</option>
      <option value="active">Active sprint</option>
      ${state.sprints.map(s => {
        const icon = s.status === 'active' ? '🟢' : s.status === 'completed' ? '✅' : '🔵';
        return `<option value="${s.id}">${escapeHtml(s.name)} ${icon}</option>`;
      }).join('')}
    `;
    sel.value = cur;
  }

  // ---------- Focus Strip ----------
  function renderFocusStrip() {
    const strip = $('#focusStrip');
    if (!strip) return;
    strip.innerHTML = '';

    const focused = state.tasks.filter(t => t.focused && t.status !== 'done');
    strip.classList.toggle('has-tasks', focused.length > 0);

    const label = document.createElement('div');
    label.className = 'focus-strip-label';
    label.textContent = '⭐ Focus';
    strip.appendChild(label);

    const inner = document.createElement('div');
    inner.className = 'focus-strip-inner';

    if (!focused.length) {
      const hint = document.createElement('span');
      hint.className = 'focus-strip-hint';
      hint.textContent = 'Drag any task here to focus on it today';
      inner.appendChild(hint);
    } else {
      focused.forEach(t => inner.appendChild(card(t)));
    }
    strip.appendChild(inner);
  }

  // ---------- Board ----------
  function renderBoard(root) {
    const list  = filteredTasks('active');
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
      body.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        body.classList.add('drop-target');
      });
      body.addEventListener('dragleave', e => {
        if (!body.contains(e.relatedTarget)) body.classList.remove('drop-target');
      });
      body.addEventListener('drop', e => {
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
    if (!list.length) root.appendChild(emptyState('No tasks match your filters.'));
  }

  // ---------- List (sprint-grouped when sprints exist) ----------
  function renderList(root) {
    if (state.sprints.length > 0) {
      renderSprintList(root);
      return;
    }
    const list = filteredTasks('active');
    if (!list.length) { root.appendChild(emptyState('Nothing here yet.')); return; }
    const wrap = document.createElement('div');
    wrap.className = 'list';
    list.forEach(t => wrap.appendChild(card(t, true)));
    root.appendChild(wrap);
  }

  function renderSprintList(root) {
    const order = { active: 0, planned: 1, completed: 2 };
    const sorted = [...state.sprints].sort(
      (a, b) => order[a.status] - order[b.status] || a.createdAt.localeCompare(b.createdAt)
    );
    sorted.forEach(sprint => root.appendChild(renderSprintSection(sprint)));

    // Tasks not assigned to any known sprint
    const unassigned = filteredTasks('active').filter(
      t => !t.sprintId || !state.sprints.find(s => s.id === t.sprintId)
    );
    if (unassigned.length) {
      const sec = document.createElement('div');
      sec.className = 'sprint-section';
      const hdr = document.createElement('div');
      hdr.className = 'sprint-header';
      hdr.innerHTML = `<span class="sprint-name muted">Unassigned</span><span class="sprint-task-count">${unassigned.length} task${unassigned.length !== 1 ? 's' : ''}</span>`;
      sec.appendChild(hdr);
      const body = document.createElement('div');
      body.className = 'sprint-body list';
      unassigned.forEach(t => body.appendChild(card(t, true)));
      sec.appendChild(body);
      root.appendChild(sec);
    }

    const newBtn = document.createElement('button');
    newBtn.className = 'btn ghost new-sprint-btn';
    newBtn.textContent = '+ New Sprint';
    newBtn.addEventListener('click', promptCreateSprint);
    root.appendChild(newBtn);
  }

  function renderSprintSection(sprint) {
    const tasks = filteredTasks('active').filter(t => t.sprintId === sprint.id);
    const total = state.tasks.filter(t => t.sprintId === sprint.id).length;
    const done  = state.tasks.filter(t => t.sprintId === sprint.id && t.status === 'done').length;

    const sec = document.createElement('div');
    sec.className = `sprint-section sprint-${sprint.status}`;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'sprint-header';
    const badge = { active: '🟢 Active', planned: '🔵 Planned', completed: '✅ Completed' }[sprint.status];
    hdr.innerHTML = `
      <button class="sprint-collapse-btn" title="${sprint.collapsed ? 'Expand' : 'Collapse'}">${sprint.collapsed ? '▶' : '▼'}</button>
      <span class="sprint-name">${escapeHtml(sprint.name)}</span>
      <span class="sprint-badge sprint-badge-${sprint.status}">${badge}</span>
      ${sprint.startDate ? `<span class="sprint-dates">${sprint.startDate}${sprint.endDate ? ' → ' + sprint.endDate : ''}</span>` : ''}
      <span class="sprint-task-count">${tasks.length} task${tasks.length !== 1 ? 's' : ''} · ${done}/${total} done</span>
      <div class="sprint-actions">
        ${sprint.status === 'planned'   ? `<button class="btn small sprint-start-btn">▶ Start Sprint</button>` : ''}
        ${sprint.status === 'active'    ? `<button class="btn small danger sprint-complete-btn">■ Complete Sprint</button>` : ''}
      </div>
    `;

    hdr.querySelector('.sprint-collapse-btn').addEventListener('click', () => {
      updateSprint(sprint.id, { collapsed: !sprint.collapsed });
      render();
    });
    hdr.querySelector('.sprint-start-btn')?.addEventListener('click',    () => startSprint(sprint.id));
    hdr.querySelector('.sprint-complete-btn')?.addEventListener('click', () => completeSprint(sprint.id));
    sec.appendChild(hdr);

    if (!sprint.collapsed) {
      const body = document.createElement('div');
      body.className = 'sprint-body list';
      if (!tasks.length) {
        const emp = document.createElement('div');
        emp.className = 'sprint-empty';
        emp.textContent = 'No tasks in this sprint.';
        body.appendChild(emp);
      } else {
        tasks.forEach(t => body.appendChild(card(t, true)));
      }
      sec.appendChild(body);
    }
    return sec;
  }

  // ---------- Completed ----------
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

  // ---------- Card ----------
  function card(t, listMode = false) {
    const el = document.createElement('div');
    el.className = `card pri-${t.priority}`;
    el.draggable = true;
    el.dataset.id = t.id;
    el.addEventListener('dragstart', e => {
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));

    const subDone  = (t.subtasks || []).filter(s => s.done).length;
    const subTotal = (t.subtasks || []).length;
    const pct      = subTotal ? Math.round((subDone / subTotal) * 100) : 0;
    const dueInfo  = dueBadge(t.due, t.status);
    const pri      = PRIORITIES.find(p => p.id === t.priority);
    const stat     = STATUSES.find(s => s.id === t.status);

    el.innerHTML = `
      <button class="star-btn${t.focused ? ' starred' : ''}" title="${t.focused ? 'Remove from focus' : 'Add to today\'s focus'}">★</button>
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
        <div class="card-meta" style="margin-top:8px;justify-content:space-between;">
          <span>Subtasks ${subDone}/${subTotal}</span><span>${pct}%</span>
        </div>
        <div class="progress"><span style="width:${pct}%"></span></div>
      ` : ''}
    `;

    el.querySelector('.star-btn').addEventListener('click', e => {
      e.stopPropagation();
      const task = findTask(t.id);
      if (!task) return;
      updateTask(t.id, { focused: !task.focused });
      render();
      toast(task.focused ? 'Removed from focus' : '⭐ Added to focus');
    });
    el.addEventListener('click', () => openModal(t.id));
    return el;
  }

  // ---------- Due badge & formatting ----------
  function dueBadge(due, status) {
    if (!due) return null;
    const d = new Date(due + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (status === 'done') return { cls: '',        text: 'Due ' + formatDate(d) };
    if (diff < 0)          return { cls: 'overdue', text: `Overdue ${Math.abs(diff)}d` };
    if (diff === 0)        return { cls: 'soon',    text: 'Due today' };
    if (diff <= 3)         return { cls: 'soon',    text: `Due in ${diff}d` };
    return { cls: '', text: 'Due ' + formatDate(d) };
  }
  function formatDate(d) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function formatDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- URL chip rendering ----------
  const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/g;
  function classifyUrl(url) {
    let u;
    try { u = new URL(url); } catch { return { svc: 'web', icon: '🔗', label: url }; }
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    if (host === 'docs.google.com') {
      if (path.startsWith('/document'))      return { svc: 'doc',   icon: 'D', label: 'Google Doc' };
      if (path.startsWith('/spreadsheets')) return { svc: 'sheet', icon: 'S', label: 'Google Sheet' };
      if (path.startsWith('/presentation')) return { svc: 'slide', icon: 'P', label: 'Google Slides' };
      if (path.startsWith('/forms'))        return { svc: 'form',  icon: 'F', label: 'Google Form' };
      return { svc: 'doc', icon: 'G', label: 'Google Docs' };
    }
    if (host === 'drive.google.com')    return { svc: 'drive',  icon: 'D', label: 'Google Drive' };
    if (host === 'meet.google.com')     return { svc: 'doc',    icon: 'M', label: 'Google Meet' };
    if (host === 'calendar.google.com') return { svc: 'doc',    icon: 'C', label: 'Google Calendar' };
    if (host === 'mail.google.com' || host === 'gmail.com') return { svc: 'doc', icon: 'M', label: 'Gmail' };
    if (host === 'youtube.com' || host === 'youtu.be')      return { svc: 'yt',  icon: '▶', label: 'YouTube' };
    if (host === 'github.com') {
      const parts = path.split('/').filter(Boolean);
      return { svc: 'gh', icon: 'G', label: parts.length >= 2 ? `GitHub · ${parts[0]}/${parts[1]}` : 'GitHub' };
    }
    if (host.endsWith('figma.com'))    return { svc: 'fig',    icon: 'F', label: 'Figma' };
    if (host.endsWith('notion.so') || host.endsWith('notion.site')) return { svc: 'notion', icon: 'N', label: 'Notion' };
    if (host.endsWith('slack.com'))    return { svc: 'slack',  icon: 'S', label: 'Slack' };
    if (host.endsWith('atlassian.net') || host.endsWith('jira.com')) return { svc: 'doc', icon: 'J', label: 'Jira' };
    if (host.endsWith('linear.app'))   return { svc: 'notion', icon: 'L', label: 'Linear' };
    return { svc: 'web', icon: '🔗', label: host };
  }
  function chipHtml(url) {
    const info = classifyUrl(url);
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="link-chip" data-svc="${info.svc}" title="${escapeHtml(url)}" onclick="event.stopPropagation()"><span class="chip-icon">${escapeHtml(info.icon)}</span><span class="chip-label">${escapeHtml(info.label)}</span></a>`;
  }
  function renderRichText(text) {
    if (!text) return '';
    return String(text).split(URL_REGEX).map(part => {
      if (!part) return '';
      return /^https?:\/\//.test(part) ? chipHtml(part) : escapeHtml(part);
    }).join('');
  }

  // ---------- Modal ----------
  function openModal(id) {
    let t;
    if (id) {
      t = findTask(id);
      if (!t) return;
    } else {
      const activeSprint = state.sprints.find(s => s.status === 'active');
      t = { id: '', title: '', description: '', status: 'todo', priority: 'medium', due: '', labels: [], subtasks: [], notes: [], sprintId: activeSprint?.id || null };
    }
    state.editingId = id || null;

    $('#modalTitle').textContent = id ? `Edit ${t.id}` : 'New Task';
    $('#fTitle').value    = t.title;
    $('#fDesc').value     = t.description;
    $('#fStatus').value   = t.status;
    $('#fPriority').value = t.priority;
    $('#fDue').value      = t.due || '';
    $('#fLabels').value   = (t.labels || []).join(', ');

    // Sprint dropdown
    const fSprint = $('#fSprint');
    if (fSprint) {
      fSprint.innerHTML = `
        <option value="">— No sprint —</option>
        ${state.sprints.map(s => {
          const icon = s.status === 'active' ? '🟢' : s.status === 'completed' ? '✅' : '🔵';
          return `<option value="${s.id}">${escapeHtml(s.name)} ${icon}</option>`;
        }).join('')}
      `;
      fSprint.value = t.sprintId || '';
    }

    renderSubList(t.subtasks || []);
    renderNoteList(t.notes   || []);
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
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
  function exitNoteEdit(ta) {
    const li   = ta.closest('.note-item');
    const view = $('.note-view', li);
    view.innerHTML = renderRichText(ta.value) || '<span class="note-placeholder">Click to edit...</span>';
    ta.style.display   = 'none';
    view.style.display = '';
  }

  function collectFormSubs() {
    return $$('.sub-item', $('#subList')).map(li => ({
      title: $('.sub-title', li).value.trim(),
      done:  $('.sub-chk',   li).checked,
    })).filter(s => s.title);
  }
  function collectFormNotes(existing) {
    return $$('.note-item', $('#noteList')).map((li, i) => ({
      text: $('.note-text', li).value.trim(),
      at:   existing[i]?.at || now(),
    })).filter(n => n.text);
  }

  function saveFromModal() {
    const title = $('#fTitle').value.trim();
    if (!title) { toast('Title is required'); return; }
    const labels   = $('#fLabels').value.split(',').map(s => s.trim()).filter(Boolean);
    const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
    const fSprint  = $('#fSprint');
    const data = {
      title,
      description: $('#fDesc').value.trim(),
      status:      $('#fStatus').value,
      priority:    $('#fPriority').value,
      due:         $('#fDue').value,
      labels,
      subtasks:    collectFormSubs(),
      notes:       collectFormNotes(existing),
      sprintId:    fSprint ? (fSprint.value || null) : undefined,
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
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  // ---------- Export / Import ----------
  const IDB_NAME  = 'tt_meta';
  const IDB_STORE = 'handles';
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }
  async function verifyPermission(dirHandle, readWrite = true) {
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await dirHandle.queryPermission(opts))   === 'granted') return true;
    if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
    return false;
  }
  async function pickBackupFolder() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support folder picking. Backups will download instead.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet('backupDir', handle);
      toast(`Backup folder set: ${handle.name}`);
    } catch(e) {
      if (e.name !== 'AbortError') alert('Could not set folder: ' + e.message);
    }
  }
  function backupFilename() {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `tasks-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
  }
  async function exportJson() {
    // New format: { tasks, sprints }
    const payload  = { tasks: state.tasks, sprints: state.sprints };
    const json     = JSON.stringify(payload, null, 2);
    const filename = backupFilename();
    if ('showDirectoryPicker' in window) {
      try {
        const dir = await idbGet('backupDir');
        if (dir && await verifyPermission(dir, true)) {
          const backupDir  = await dir.getDirectoryHandle('backup', { create: true });
          const fileHandle = await backupDir.getFileHandle(filename, { create: true });
          const writable   = await fileHandle.createWritable();
          await writable.write(json);
          await writable.close();
          toast(`Saved to ${dir.name}/backup/${filename}`);
          return;
        }
      } catch(e) { console.warn('Folder save failed, downloading instead', e); }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename}`);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);

        // Support old format (plain array) and new format ({ tasks, sprints })
        let tasks, sprints;
        if (Array.isArray(raw)) {
          tasks   = raw;
          sprints = [];
        } else {
          tasks   = raw.tasks   || [];
          sprints = raw.sprints || [];
        }
        if (!Array.isArray(tasks)) throw new Error('Invalid file — expected tasks array');

        if (!confirm(`Import ${tasks.length} tasks and ${sprints.length} sprint${sprints.length !== 1 ? 's' : ''}?\nThis replaces your current data.`)) return;

        state.tasks = tasks.map(t => ({
          id:          t.id          || uid(),
          title:       t.title       || 'Untitled',
          description: t.description || '',
          status:      t.status      || 'todo',
          priority:    t.priority    || 'medium',
          due:         t.due         || '',
          labels:      t.labels      || [],
          subtasks:    t.subtasks    || [],
          notes:       t.notes       || [],
          focused:     t.focused     || false,
          sprintId:    t.sprintId    || null,
          createdAt:   t.createdAt   || now(),
          updatedAt:   t.updatedAt   || now(),
        }));
        state.sprints = sprints.map(s => ({
          id:        s.id        || sprintUid(),
          name:      s.name      || 'Sprint',
          startDate: s.startDate || null,
          endDate:   s.endDate   || null,
          status:    s.status    || 'planned',
          collapsed: s.collapsed || false,
          createdAt: s.createdAt || now(),
        }));

        save();
        saveSprints();
        migrateToSprints(); // auto-create Sprint 1 if old data had no sprints
        render();
        toast('Import complete');
      } catch(e) { alert('Import failed: ' + e.message); }
    };
    reader.readAsText(file);
  }

  // ---------- Theme ----------
  function initTheme() {
    applyTheme(localStorage.getItem('tt_theme_v1') || 'light', false);
  }
  function applyTheme(theme, save = true) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const btn = $('#btnTheme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (save) localStorage.setItem('tt_theme_v1', theme);
  }
  function toggleTheme() {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }

  // ---------- Events ----------
  function bind() {
    $('#btnNew').addEventListener('click', () => openModal(null));
    $('#btnNewSprint').addEventListener('click', promptCreateSprint);
    $('#modalClose').addEventListener('click', closeModal);
    $('#btnCancel').addEventListener('click', closeModal);
    $('#btnSave').addEventListener('click', saveFromModal);
    $('#btnDelete').addEventListener('click', deleteFromModal);
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', e => {
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
    $('#subList').addEventListener('click', e => {
      if (e.target.classList.contains('sub-del')) {
        const subs = collectFormSubs();
        subs.splice(Number(e.target.dataset.i), 1);
        renderSubList(subs);
      }
    });
    $('#subList').addEventListener('change', e => {
      if (e.target.classList.contains('sub-chk'))
        e.target.closest('.sub-item').classList.toggle('done', e.target.checked);
    });

    $('#btnAddNote').addEventListener('click', () => {
      const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
      const notes = collectFormNotes(existing);
      notes.push({ text: '', at: now() });
      renderNoteList(notes);
      const views = $$('.note-view');
      if (views.length) enterNoteEdit(views[views.length - 1]);
    });
    $('#noteList').addEventListener('click', e => {
      if (e.target.classList.contains('note-del')) {
        const existing = state.editingId ? (findTask(state.editingId)?.notes || []) : [];
        const notes = collectFormNotes(existing);
        notes.splice(Number(e.target.dataset.i), 1);
        renderNoteList(notes);
        return;
      }
      if (e.target.closest('.link-chip')) return;
      const view = e.target.closest('.note-view');
      if (view) enterNoteEdit(view);
    });
    $('#noteList').addEventListener('blur', e => {
      if (e.target.classList.contains('note-text')) exitNoteEdit(e.target);
    }, true);

    // Filter / sort controls
    $('#search').addEventListener('input',           e => { state.filters.search        = e.target.value;   render(); });
    $('#filterStatus').addEventListener('change',    e => { state.filters.status        = e.target.value;   render(); });
    $('#filterPriority').addEventListener('change',  e => { state.filters.priority      = e.target.value;   render(); });
    $('#sortBy').addEventListener('change',          e => { state.filters.sortBy        = e.target.value;   render(); });
    $('#showCompleted').addEventListener('change',   e => { state.filters.showCompleted = e.target.checked; render(); });
    $('#filterSprint').addEventListener('change',    e => { state.filters.sprint        = e.target.value;   render(); });

    $$('.view-toggle .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.view-toggle .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.view = btn.dataset.view;
        render();
      });
    });

    $('#btnTheme').addEventListener('click', toggleTheme);
    $('#btnExport').addEventListener('click', exportJson);
    $('#btnBackupDir').addEventListener('click', pickBackupFolder);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', e => {
      const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '';
    });

    // Focus strip — drop target (wired once here so it persists across renders)
    const strip = $('#focusStrip');
    strip.addEventListener('dragover', e => { e.preventDefault(); strip.classList.add('drag-over'); });
    strip.addEventListener('dragleave', e => { if (!strip.contains(e.relatedTarget)) strip.classList.remove('drag-over'); });
    strip.addEventListener('drop', e => {
      e.preventDefault();
      strip.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      const task = findTask(id);
      if (!task || task.focused) return;
      updateTask(id, { focused: true });
      render();
      toast('⭐ Added to focus');
    });
  }

  function seedIfEmpty() {
    if (state.tasks.length) return;
    const sprint = createSprint({ name: 'Sprint 1', status: 'active', startDate: todayStr() });
    createTask({
      title:       'Welcome to your local Task Tracker',
      description: 'Click this card to edit. Add subtasks, notes, labels, a due date, and move it through statuses.',
      status:      'todo',
      priority:    'high',
      labels:      ['welcome', 'demo'],
      sprintId:    sprint.id,
      subtasks: [
        { title: 'Create your first real task',      done: false },
        { title: 'Try changing status and priority', done: false },
        { title: 'Export your data as backup',       done: false },
      ],
      notes: [{ text: 'Tip: Cmd/Ctrl + Enter saves the modal. Esc closes it.', at: now() }],
    });
  }

  // ---------- Init ----------
  load();
  seedIfEmpty();
  migrateToSprints();
  initTheme();
  bind();
  render();
})();
