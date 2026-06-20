# Completion Calendar

A calendar and habit-tracking app where completing tasks drops physics-simulated
balls into the day they were done — and into a jar that fills, celebrates, and
empties as you build a streak. Runs as a local web app or a packaged desktop app.
Zero runtime dependencies.

## Features

- **Year / month / day views** with animated transition zoom between them
- **Up to 6 tasks**, each with a name and color
- **Two task types:**
  - *Completion* — once per day (marks done with a ✓)
  - *Repeated* — log as many times per day as you like (shows a per-day count)
- **Ball physics** — each completion drops a ball into that day's box, settling
  into a pile (gravity, bouncing, ball-to-ball collision)
- **Jars** — every completion also flies into the task's jar; at 50 it completes
  with a confetti burst, then drains and refills
- **Shelf view** — see all jars on shelves, one filled jar per completed batch
- **Per-day undo**, drag-to-reorder tasks, edit/rename/recolor, delete
- **Optimistic UI** with rollback if a write fails
- Data persists to local JSON files — no database, no accounts

## Getting started

To use the app, simply run the .exe file found in releases and start the app from your start menu.

(Windows Only)

## Tech stack

- **Vanilla JavaScript (ES6 classes)** — no framework, no build step; all UI logic lives in a single `Calendar` class
- **Custom HTML5 + CSS3** — hand-written markup and styles, including a hand-rolled FLIP zoom animation (no animation library)
- **Custom 2D physics** — a small fixed-timestep engine (gravity, restitution, ball-to-ball collision) driving the calendar and jar balls, rendered via `requestAnimationFrame`
- **Node.js core `http`** — a zero-dependency loopback server for static files and the tasks/completions REST API
- **JSON flat files** — `tasks.json` / `completions.json` for persistence (no database), written atomically
- **Electron** — optional desktop packaging via `electron-builder`

## Data

Created automatically on first write; both are gitignored:

- `tasks.json` — the task list
- `completions.json` — completions, shaped `{ "YYYY-MM-DD": { "Task name": count } }`

Writes are atomic (temp file + rename) so a crash mid-write can't corrupt them.

## Project structure

```
index.html   Calendar markup, modals, day/task panels
style.css    Styles
script.js    Front-end logic (calendar, ball physics, jars, shelf view)
server.js    Loopback HTTP server: static files + tasks/completions API
main.js      Electron entry point (loads the local server in a window)
```

## License

MIT
