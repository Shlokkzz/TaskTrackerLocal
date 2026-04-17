# Task Tracker (Local, No Server)

A JIRA-style task tracker that runs entirely from a single `index.html`. No backend, no build step, no terminal. Just double-click the HTML file.

## How to use

1. Double-click `index.html` (or right-click → Open With → your browser).
2. That's it. Data is saved automatically to the browser's `localStorage`.

## Features

- **Board, List, and Completed views**
- **Tasks** with title, description, labels, due date, priority, status
- **Subtasks** with checkboxes and progress bar
- **Notes** with timestamps (multiple per task)
- **Filters**: search, status, priority, show/hide completed
- **Sort**: newest, oldest, due date, priority, title, status
- **Add / Edit / Delete** tasks (JIRA-like)
- **Export / Import JSON** so you can back up data or move it between browsers/computers
- **Keyboard**: `Esc` closes the modal, `Cmd/Ctrl + Enter` saves

## Where is my data?

- Stored in `localStorage` under the key `tt_tasks_v1` in whichever browser you open the file with.
- It stays on your machine. Nothing leaves your computer.
- To back up: click **Export** → save the JSON file anywhere (Google Drive, iCloud, a folder, etc.).
- To restore or migrate: click **Import** and pick the JSON.

## Notes / caveats

- Since it's `localStorage`, data is scoped per-browser and per-origin. If you open the same file in Chrome and Safari, they won't share data. Use Export/Import to sync.
- Clearing browser site data will erase tasks. Use Export regularly if the data matters.
- Everything is offline. No accounts, no analytics, no network calls.

## Files

- `index.html` – markup
- `styles.css` – styling
- `app.js` – all logic
