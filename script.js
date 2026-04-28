/* Modern Todo List — vanilla JavaScript */

const STORAGE_KEYS = {
  todos: "todo-app:todos",
  theme: "todo-app:theme",
};

const FILTERS = {
  all: () => true,
  active: (todo) => !todo.completed,
  completed: (todo) => todo.completed,
};

const REMINDER_CHECK_INTERVAL_MS = 20_000;
const SOON_THRESHOLD_MS = 1000 * 60 * 60 * 24; // 24h

const state = {
  todos: loadTodos(),
  filter: "all",
  dragId: null,
};

const dom = {
  form: document.getElementById("new-todo-form"),
  input: document.getElementById("new-todo-input"),
  addButton: document.getElementById("new-todo-add"),
  dueInput: document.getElementById("new-todo-due"),
  remindCheckbox: document.getElementById("new-todo-remind"),
  list: document.getElementById("todo-list"),
  empty: document.getElementById("empty-state"),
  itemsLeft: document.getElementById("items-left"),
  clearCompleted: document.getElementById("clear-completed"),
  filters: document.querySelectorAll(".filter"),
  themeToggle: document.getElementById("theme-toggle"),
  toastContainer: document.getElementById("toast-container"),
};

/* Persistence */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.todos);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.id === "string" && typeof i.text === "string" && typeof i.completed === "boolean")
      .map((i) => ({
        id: i.id, text: i.text, completed: i.completed,
        dueAt: typeof i.dueAt === "string" ? i.dueAt : null,
        remind: Boolean(i.remind), notified: Boolean(i.notified),
      }));
  } catch { return []; }
}
function saveTodos() { localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(state.todos)); }
function loadTheme() {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function saveTheme(theme) { localStorage.setItem(STORAGE_KEYS.theme, theme); }

/* Theme */
function applyTheme(theme) { document.documentElement.setAttribute("data-theme", theme); }
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next); saveTheme(next);
}

/* Helpers */
function generateId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function getActiveCount() { return state.todos.filter((t) => !t.completed).length; }

function formatDueDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.getFullYear() === tomorrow.getFullYear() && date.getMonth() === tomorrow.getMonth() && date.getDate() === tomorrow.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: sameYear ? undefined : "numeric",
  });
  return `${dateStr}, ${time}`;
}
function getDueStatus(iso) {
  if (!iso) return "none";
  const due = new Date(iso).getTime(); const now = Date.now();
  if (due < now) return "overdue";
  if (due - now < SOON_THRESHOLD_MS) return "soon";
  return "future";
}

/* Mutations */
function addTodo(text, dueAt, remind) {
  const trimmed = text.trim();
  if (!trimmed) return;
  let dueIso = null;
  if (dueAt) {
    const parsed = new Date(dueAt);
    if (!Number.isNaN(parsed.getTime())) dueIso = parsed.toISOString();
  }
  const todo = {
    id: generateId(), text: trimmed, completed: false,
    dueAt: dueIso, remind: Boolean(remind && dueIso), notified: false,
  };
  state.todos.push(todo); saveTodos(); render();
  if (todo.remind) requestNotificationPermission();
}
function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed; saveTodos(); render();
}
function deleteTodo(id) {
  const node = dom.list.querySelector(`[data-id="${id}"]`);
  if (node) {
    node.classList.add("is-removing");
    node.addEventListener("transitionend", () => {
      state.todos = state.todos.filter((t) => t.id !== id);
      saveTodos(); render();
    }, { once: true });
  } else {
    state.todos = state.todos.filter((t) => t.id !== id);
    saveTodos(); render();
  }
}
function clearCompleted() {
  const completed = state.todos.filter((t) => t.completed);
  if (completed.length === 0) return;
  const nodes = completed.map((t) => dom.list.querySelector(`[data-id="${t.id}"]`)).filter(Boolean);
  if (nodes.length === 0) {
    state.todos = state.todos.filter((t) => !t.completed); saveTodos(); render(); return;
  }
  let pending = nodes.length;
  nodes.forEach((node) => {
    node.classList.add("is-removing");
    node.addEventListener("transitionend", () => {
      pending -= 1;
      if (pending === 0) {
        state.todos = state.todos.filter((t) => !t.completed);
        saveTodos(); render();
      }
    }, { once: true });
  });
}
function setFilter(filter) {
  if (!Object.prototype.hasOwnProperty.call(FILTERS, filter)) return;
  state.filter = filter; render();
}
function reorderTodos(draggedId, targetId) {
  if (draggedId === targetId) return;
  const fromIndex = state.todos.findIndex((t) => t.id === draggedId);
  const toIndex = state.todos.findIndex((t) => t.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = state.todos.splice(fromIndex, 1);
  state.todos.splice(toIndex, 0, moved);
  saveTodos(); render();
}

/* Rendering */
function createDuePill(todo) {
  if (!todo.dueAt) return null;
  const pill = document.createElement("span");
  pill.className = "due-pill";
  const status = getDueStatus(todo.dueAt);
  if (!todo.completed) {
    if (status === "overdue") pill.classList.add("is-overdue");
    else if (status === "soon") pill.classList.add("is-soon");
  }
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
    <span></span>`;
  pill.querySelector("span").textContent = formatDueDate(todo.dueAt);
  return pill;
}
function createReminderPill() {
  const pill = document.createElement("span");
  pill.className = "due-pill";
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
    <span>Reminder</span>`;
  return pill;
}
function createTodoElement(todo) {
  const li = document.createElement("li");
  li.className = "todo";
  if (todo.completed) li.classList.add("is-completed");
  li.dataset.id = todo.id;
  li.setAttribute("draggable", "true");

  const checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.className = "todo__check";
  checkButton.dataset.action = "toggle";
  checkButton.setAttribute("aria-label", todo.completed ? "Mark as active" : "Mark as completed");
  checkButton.setAttribute("aria-pressed", String(todo.completed));

  const body = document.createElement("div");
  body.className = "todo__body";
  const label = document.createElement("span");
  label.className = "todo__label";
  label.textContent = todo.text;
  body.appendChild(label);

  if (todo.dueAt || todo.remind) {
    const meta = document.createElement("div");
    meta.className = "todo__meta";
    const duePill = createDuePill(todo);
    if (duePill) meta.appendChild(duePill);
    if (todo.remind) meta.appendChild(createReminderPill());
    body.appendChild(meta);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "todo__delete";
  deleteButton.dataset.action = "delete";
  deleteButton.setAttribute("aria-label", "Delete todo");
  deleteButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>`;

  li.append(checkButton, body, deleteButton);
  return li;
}
function render() {
  dom.filters.forEach((b) => b.classList.toggle("is-active", b.dataset.filter === state.filter));
  const filtered = state.todos.filter(FILTERS[state.filter]);
  const fragment = document.createDocumentFragment();
  filtered.forEach((t) => fragment.appendChild(createTodoElement(t)));
  dom.list.replaceChildren(fragment);
  dom.empty.hidden = filtered.length !== 0;
  const activeCount = getActiveCount();
  dom.itemsLeft.textContent = `${activeCount} ${activeCount === 1 ? "item" : "items"} left`;
  const hasCompleted = state.todos.some((t) => t.completed);
  dom.clearCompleted.disabled = !hasCompleted;
  dom.clearCompleted.style.opacity = hasCompleted ? "1" : "0.45";
  dom.clearCompleted.style.cursor = hasCompleted ? "pointer" : "default";
}

/* Notifications & toasts */
function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
function showToast(title, text) {
  const toast = document.createElement("div");
  toast.className = "toast"; toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="toast__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    </span>
    <div class="toast__body">
      <span class="toast__title"></span>
      <span class="toast__text"></span>
    </div>`;
  toast.querySelector(".toast__title").textContent = title;
  toast.querySelector(".toast__text").textContent = text;
  dom.toastContainer.appendChild(toast);
  const remove = () => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };
  setTimeout(remove, 6000);
  toast.addEventListener("click", remove);
}
function fireReminder(todo) {
  showToast("Reminder", todo.text);
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("Todo reminder", { body: todo.text }); } catch {}
  }
}
function checkReminders() {
  const now = Date.now(); let changed = false;
  state.todos.forEach((t) => {
    if (t.remind && !t.notified && !t.completed && t.dueAt && new Date(t.dueAt).getTime() <= now) {
      fireReminder(t); t.notified = true; changed = true;
    }
  });
  if (changed) { saveTodos(); render(); }
}

/* Events */
function submitNewTodo() {
  addTodo(dom.input.value, dom.dueInput.value, dom.remindCheckbox.checked);
  dom.input.value = ""; dom.dueInput.value = ""; dom.remindCheckbox.checked = false;
  dom.input.focus();
}
function bindEvents() {
  dom.form.addEventListener("submit", (e) => { e.preventDefault(); submitNewTodo(); });
  dom.addButton.addEventListener("click", (e) => { e.preventDefault(); submitNewTodo(); });

  dom.list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionEl = target.closest("[data-action]");
    if (!actionEl) return;
    const todoEl = actionEl.closest(".todo");
    if (!todoEl) return;
    const id = todoEl.dataset.id;
    if (!id) return;
    const action = actionEl.getAttribute("data-action");
    if (action === "toggle") toggleTodo(id);
    if (action === "delete") deleteTodo(id);
  });

  dom.filters.forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.filter) setFilter(b.dataset.filter);
  }));
  dom.clearCompleted.addEventListener("click", clearCompleted);
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.remindCheckbox.addEventListener("change", () => {
    if (dom.remindCheckbox.checked) requestNotificationPermission();
  });
  bindDragAndDrop();
}

/* Drag and drop */
function bindDragAndDrop() {
  dom.list.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const todoEl = target.closest(".todo");
    if (!todoEl) return;
    state.dragId = todoEl.dataset.id || null;
    todoEl.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.dragId || "");
    }
  });
  dom.list.addEventListener("dragend", (event) => {
    const target = event.target;
    if (target instanceof Element) {
      const todoEl = target.closest(".todo");
      if (todoEl) todoEl.classList.remove("is-dragging");
    }
    dom.list.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    state.dragId = null;
  });
  dom.list.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const target = event.target;
    if (!(target instanceof Element)) return;
    const todoEl = target.closest(".todo");
    if (!todoEl || todoEl.dataset.id === state.dragId) return;
    dom.list.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    todoEl.classList.add("is-drop-target");
  });
  dom.list.addEventListener("dragleave", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const todoEl = target.closest(".todo");
    if (!todoEl) return;
    if (!todoEl.contains(event.relatedTarget)) todoEl.classList.remove("is-drop-target");
  });
  dom.list.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target;
    if (!(target instanceof Element)) return;
    const todoEl = target.closest(".todo");
    if (!todoEl) return;
    const targetId = todoEl.dataset.id;
    const draggedId = state.dragId;
    if (!targetId || !draggedId) return;
    reorderTodos(draggedId, targetId);
  });
}

/* Init */
function init() {
  applyTheme(loadTheme());
  bindEvents();
  render();
  checkReminders();
  setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
}
init();