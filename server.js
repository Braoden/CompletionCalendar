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

const PORT      = 5577;
const ROOT      = __dirname;
const DATA_FILE        = path.join(ROOT, 'tasks.json');
const COMPLETIONS_FILE = path.join(ROOT, 'completions.json');
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
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
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
    fs.writeFileSync(COMPLETIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

        const { date, taskName, pos } = body;
        if (!date || !taskName) {
            return sendJson(res, 400, { error: 'Missing fields' });
        }
        if (pos !== null && pos !== undefined) {
            if (!Array.isArray(pos) || pos.length !== 2 ||
                typeof pos[0] !== 'number' || typeof pos[1] !== 'number') {
                return sendJson(res, 400, { error: 'Invalid position' });
            }
            if (pos[0] < 0 || pos[0] > 64 || pos[1] < 0 || pos[1] > 64) {
                return sendJson(res, 400, { error: 'Position out of bounds' });
            }
        }

        const tasks = readTasks();
        const task = tasks.find(t => t.name === taskName);
        if (!task) return sendJson(res, 404, { error: 'Task not found' });

        const completions = readCompletions();
        if (!completions[date]) completions[date] = {};
        if (!completions[date][taskName]) completions[date][taskName] = [];

        if (task.type === 'Completion' && completions[date][taskName].length >= 1) {
            return sendJson(res, 409, { error: 'Task already completed for this date' });
        }

        const entry = (pos != null) ? [Math.round(pos[0]), Math.round(pos[1])] : null;
        completions[date][taskName].push(entry);
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
        if (completions[date]?.[taskName]?.length) {
            completions[date][taskName].pop();
            if (!completions[date][taskName].length) delete completions[date][taskName];
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

server.listen(PORT, () => {
    console.log(`Calendar running at http://localhost:${PORT}`);
});
