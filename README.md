# Todo List

A modern, responsive todo list app built with **vanilla HTML, CSS, and JavaScript**. No frameworks, no build step required for the source — just a static site served by Vite.

## Features

### Core
- Add a new todo by pressing **Enter** or clicking the **+** button
- Toggle todos as complete / active with a custom circular checkbox
- Delete individual todos (smooth slide-out animation)
- Filter by **All / Active / Completed**
- "Items left" counter
- **Clear Completed** button
- Drag and drop to reorder using the native HTML Drag API
- Persists todos and theme preference in `localStorage`

### Due dates & reminders
- Optional **due date and time** picker on each new todo
- Optional **"Remind me"** toggle — when checked, the app will notify you at the due time
- Reminders use the browser's native **Notification API** when permission is granted, with an in-app toast as a fallback
- Due-date pills change color automatically:
  - Gray for upcoming
  - Orange when due within 24 hours
  - Red when overdue

### Theming
- Light and dark modes with a smooth color transition
- Theme toggle in the header — preference is saved per browser
- Follows your system's `prefers-color-scheme` on first load

### UI / UX
- Gradient header (blue → purple → pink) with soft glowing accents
- Floating card-style container
- Hover effects on buttons and list items
- Fully responsive (mobile + desktop)
- Subtle entrance animation when adding todos
- Toast notifications for reminders

## File structure

```
artifacts/todo-app/
├── index.html      Semantic HTML, no inline JS
├── style.css       CSS variables for theming, smooth transitions
├── script.js       Modular vanilla JS using event delegation
├── README.md       This file
├── package.json    Vite dev/preview scripts
├── tsconfig.json
└── vite.config.ts
```

The source is just `index.html`, `style.css`, and `script.js` — Vite is only used as a dev server and to produce a static build for deployment.

## Running locally

This app is part of a pnpm workspace. From the repo root:

```bash
pnpm install
pnpm --filter @workspace/todo-app run dev
```

Then open the URL printed by Vite.

To produce a static build:

```bash
pnpm --filter @workspace/todo-app run build
```

The built site is written to `todo-app/dist/public/`.

## Data model

Todos are stored in `localStorage` under `todo-app:todos` as a JSON array:

```ts
{
  id: string;          // generated unique id
  text: string;        // todo content
  completed: boolean;  // checked / unchecked
  dueAt: string | null; // ISO timestamp, optional
  remind: boolean;     // whether to fire a reminder at dueAt
  notified: boolean;   // internal flag — prevents duplicate reminders
}
```

The active theme is stored under `todo-app:theme` as `"light"` or `"dark"`.

## Notes on reminders

- Reminders only fire while the app is open in a browser tab. There is no service worker / background sync.
- The first time you enable **Remind me**, your browser will prompt for notification permission. If you deny it, reminders still appear as in-app toasts.
- Reminders are checked roughly every 20 seconds.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). Requires support for:
- `localStorage`
- `Notification` API (optional — falls back to toasts)
- Native HTML Drag and Drop API
- `prefers-color-scheme`
