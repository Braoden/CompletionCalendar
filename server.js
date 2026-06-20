// Zero-dependency static server + tasks API.
// Serves the calendar's static files and persists tasks to tasks.json.
//
//   GET  /api/tasks  -> { tasks: [...] }
//   POST /api/tasks  -> body { name, color, type }; appends and persists.
//
// Run with: node server.js  (then open http://localhost:5577)

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = process.env.PORT || 5577;
const ROOT      = __dirname;
// ponytail: DATA_DIR lets Electron point writes at a writable userData path
// (packaged app files are read-only inside the asar). Defaults to ROOT for `node server.js`.
const DATA_DIR  = process.env.DATA_DIR || ROOT;
const DATA_FILE        = path.join(DATA_DIR, 'tasks.json');
const COMPLETIONS_FILE = path.join(DATA_DIR, 'completions.json');
const MAX_TASKS = 6;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico':  'image/x-icon',
};

/* ── Task persistence ── */
function readTasks() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];   // missing or corrupt file -> start empty
    }
}

function writeTasks(tasks) {
    atomicWrite(DATA_FILE, JSON.stringify(tasks, null, 2));
}

function readCompletions() {
    try {
        const raw = fs.readFileSync(COMPLETIONS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    } catch {
        return {};
    }
}

function writeCompletions(data) {
    atomicWrite(COMPLETIONS_FILE, JSON.stringify(data, null, 2));
}

// Write whole-file-or-nothing: write to a temp file, then rename over the
// target. Rename is atomic, so the target is never seen half-written.
function atomicWrite(file, contents) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, contents, 'utf-8');
    fs.renameSync(tmp, file);
}

const isValidHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

function validateTask(body) {
    if (!body || typeof body !== 'object') return 'Invalid request body';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return 'Name is required';
    if (!isValidHex(body.color)) return 'Color must be a valid hex like #23a8f2';
    if (body.type !== 'Completion' && body.type !== 'Repeated') {
        return 'Type must be "Completion" or "Repeated"';
    }
    return null;   // valid
}

/* ── HTTP helpers ── */
function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': MIME['.json'] });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (data.length > 1e6) reject(new Error('Body too large'));   // guard
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

/* ── API ── */
async function handleApi(req, res) {
    if (req.url === '/api/tasks' && req.method === 'GET') {
        return sendJson(res, 200, { tasks: readTasks() });
    }

    if (req.url === '/api/tasks' && req.method === 'POST') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const error = validateTask(body);
        if (error) return sendJson(res, 400, { error });

        const tasks = readTasks();
        if (tasks.length >= MAX_TASKS) {
            return sendJson(res, 409, { error: `Limit of ${MAX_TASKS} tasks reached`, tasks });
        }

        const task = {
            name:  body.name.trim(),
            color: body.color.trim(),
            type:  body.type,
        };
        tasks.push(task);
        writeTasks(tasks);
        return sendJson(res, 201, { task, tasks });
    }

    if (req.url === '/api/tasks' && req.method === 'PUT') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const order = Array.isArray(body.order) ? body.order : null;
        if (!order) return sendJson(res, 400, { error: 'Missing order' });

        const tasks = readTasks();
        const byName = new Map(tasks.map(t => [t.name, t]));
        const reordered = order.map(n => byName.get(n)).filter(Boolean);
        // Safety: append any task the client didn't mention, so none are lost.
        for (const t of tasks) if (!order.includes(t.name)) reordered.push(t);

        writeTasks(reordered);
        return sendJson(res, 200, { tasks: reordered });
    }

    if (req.url === '/api/tasks' && req.method === 'PATCH') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const original = typeof body.original === 'string' ? body.original.trim() : '';
        if (!original) return sendJson(res, 400, { error: 'Missing original task name' });

        const error = validateTask(body);
        if (error) return sendJson(res, 400, { error });

        const tasks = readTasks();
        const idx = tasks.findIndex(t => t.name === original);
        if (idx === -1) return sendJson(res, 404, { error: 'Task not found' });

        const newName = body.name.trim();
        if (newName !== original && tasks.some(t => t.name === newName)) {
            return sendJson(res, 409, { error: 'A task with that name already exists' });
        }

        tasks[idx] = { name: newName, color: body.color.trim(), type: body.type };
        writeTasks(tasks);

        // Completions are keyed by task name — migrate them on rename.
        if (newName !== original) {
            const completions = readCompletions();
            for (const date of Object.keys(completions)) {
                if (completions[date][original] != null) {
                    completions[date][newName] = completions[date][original];
                    delete completions[date][original];
                }
            }
            writeCompletions(completions);
        }

        return sendJson(res, 200, { task: tasks[idx], tasks });
    }

    if (req.url === '/api/tasks' && req.method === 'DELETE') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const name = body.name;
        if (!name) return sendJson(res, 400, { error: 'Missing task name' });

        const tasks = readTasks().filter(t => t.name !== name);
        writeTasks(tasks);

        // Drop the deleted task's completions too.
        const completions = readCompletions();
        for (const date of Object.keys(completions)) {
            delete completions[date][name];
            if (!Object.keys(completions[date]).length) delete completions[date];
        }
        writeCompletions(completions);

        return sendJson(res, 200, { tasks });
    }

    if (req.url === '/api/completions' && req.method === 'GET') {
        return sendJson(res, 200, { completions: readCompletions() });
    }

    if (req.url === '/api/completions/add' && req.method === 'POST') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const { date, taskName } = body;
        if (!date || !taskName) {
            return sendJson(res, 400, { error: 'Missing fields' });
        }

        const tasks = readTasks();
        const task = tasks.find(t => t.name === taskName);
        if (!task) return sendJson(res, 404, { error: 'Task not found' });

        const completions = readCompletions();
        if (!completions[date]) completions[date] = {};
        const current = completions[date][taskName] || 0;

        if (task.type === 'Completion' && current >= 1) {
            return sendJson(res, 409, { error: 'Task already completed for this date' });
        }

        completions[date][taskName] = current + 1;
        writeCompletions(completions);
        return sendJson(res, 200, { completions });
    }

    if (req.url === '/api/completions/remove' && req.method === 'POST') {
        let body;
        try {
            body = JSON.parse(await readBody(req) || '{}');
        } catch {
            return sendJson(res, 400, { error: 'Malformed JSON' });
        }

        const { date, taskName } = body;
        if (!date || !taskName) return sendJson(res, 400, { error: 'Missing fields' });

        const completions = readCompletions();
        if (completions[date]?.[taskName]) {
            completions[date][taskName]--;
            if (completions[date][taskName] <= 0) delete completions[date][taskName];
            if (!Object.keys(completions[date] || {}).length) delete completions[date];
            writeCompletions(completions);
        }
        return sendJson(res, 200, { completions });
    }

    return sendJson(res, 404, { error: 'Not found' });
}

/* ── Static files ── */
function serveStatic(req, res) {
    // Strip query string, default to index.html, prevent path traversal.
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(ROOT, rel);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(content);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
        handleApi(req, res).catch(() => sendJson(res, 500, { error: 'Server error' }));
    } else {
        serveStatic(req, res);
    }
});

// Bind to loopback only: app talks to itself, so no network exposure / no firewall prompt.
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Calendar running at http://localhost:${PORT}`);
});

module.exports = { server, PORT };
