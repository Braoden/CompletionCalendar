# Calendar

A lightweight calendar and task app served by a zero-dependency Node.js server.

## Features

- Static calendar UI (`index.html`, `style.css`, `script.js`)
- Tiny built-in HTTP server with a tasks API — no npm dependencies
- Tasks persist to a local `tasks.json` file

## Getting started

Requires [Node.js](https://nodejs.org/) (no `npm install` needed).

```bash
node server.js
```

Then open http://localhost:5577 in your browser.

## API

| Method | Path         | Description                                          |
| ------ | ------------ | ---------------------------------------------------- |
| `GET`  | `/api/tasks` | Returns `{ tasks: [...] }`                           |
| `POST` | `/api/tasks` | Body `{ name, color, type }`; appends and persists   |

Tasks are stored in `tasks.json` (created automatically; up to 6 tasks).

## Project structure

```
index.html     Calendar markup
style.css      Styles
script.js      Front-end logic
server.js      Static file + tasks API server
PRODUCT.md     Product notes
DESIGN.md      Design notes
```

## License

MIT
