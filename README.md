# Completion Calendar

A calendar and habit-tracking app where completing tasks drops physics-simulated
balls into the day they were done — and into a jar that fills, celebrates, and
empties as you build a streak. Runs as a local web app or a packaged desktop app.
Zero runtime dependencies.

## Features

- **Year / month / day views** with animated FLIP zoom between them
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

Requires [Node.js](https://nodejs.org/). No `npm install` needed to run the web app.

```bash
node server.js
```

Then open http://localhost:5577.

### Desktop app (Electron)

```bash
npm install      # installs electron + electron-builder (dev only)
npm run electron # run as a desktop window
npm run dist     # build installers (win / mac / linux)
```

In the packaged app, data is written to the per-user data directory instead of
the (read-only) app bundle.

## API

The server bind is **loopback only** (`127.0.0.1`) — it talks to itself.

| Method   | Path                     | Description                                              |
| -------- | ------------------------ | ------------------------------------------------------- |
| `GET`    | `/api/tasks`             | List tasks: `{ tasks: [...] }`                          |
| `POST`   | `/api/tasks`             | Create a task — body `{ name, color, type }` (max 6)    |
| `PUT`    | `/api/tasks`             | Reorder — body `{ order: [name, ...] }`                 |
| `PATCH`  | `/api/tasks`             | Edit — body `{ original, name, color, type }`           |
| `DELETE` | `/api/tasks`             | Delete — body `{ name }` (also drops its completions)   |
| `GET`    | `/api/completions`       | All completions, keyed by date then task name           |
| `POST`   | `/api/completions/add`   | Log one — body `{ date, taskName }`                     |
| `POST`   | `/api/completions/remove`| Undo one — body `{ date, taskName }`                    |

`color` must be a 6-digit hex (e.g. `#23a8f2`); `type` is `"Completion"` or
`"Repeated"`. Completions are keyed by task name and migrated automatically on rename.

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
