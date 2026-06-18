// ── Ball physics tuning (pixels, seconds) ──
const PHYSICS = {
    G:            1800,    // gravity, px/s²
    COR:          0.5,     // coefficient of restitution
    DAMP:         0.99,    // per-step velocity damping (bleeds energy -> rest)
    FLOOR_STICK:  30,      // below this |vy| on the floor, stop micro-bouncing
    STEP:         1 / 120, // fixed physics timestep (s)
    MAX_SUBSTEPS: 6,       // cap substeps/frame (avoids the spiral of death)
    RELAX:        8,        // ball-ball position relaxation passes per step
    SPAWN_PAD:    1,       // inset from the box edge at spawn
    SPAWN_JITTER: 6,       // random y spread at spawn — breaks the synchronized
                           // fall so a too-wide row can climb into a second row
    SPAWN_VX:     30,      // small random horizontal launch speed (px/s)
    REST_EPS:     5,    // per-ball px movement/frame counted as "still"
    REST_FRAMES:  1000,      // consecutive still frames before sleeping
    MAX_TIME:     6,       // hard stop for the animation loop (s)
    MAX_ITERS:    2000,    // hard stop for the synchronous settle
};

class Calendar {
    constructor() {
        if (window.gsap && window.Flip) gsap.registerPlugin(Flip);

        this.today = new Date();
        this.currentMonth = this.today.getMonth();
        this.currentYear  = this.today.getFullYear();
        this.selectedMonth = this.currentMonth;
        this.selectedYear  = this.currentYear;
        this.mode = 'month';
        this.cards = [];

        this.monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        this.weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        this.appWrapper = document.querySelector('.app-wrapper');
        this.dayPanel = document.getElementById('dayPanel');

        this.maxTasks = 6;
        this.taskCount = 0;
        this.selectedTaskType = 'Completion';

        this.tasks = [];
        this.completions = {};
        this.selectedDay = null;
        this.selectedDateStr = null;
        this.selectedCell = null;

        this.initElements();
        this.attachEventListeners();

        this.buildGrids(this.selectedYear);
        this.cards[this.selectedMonth].classList.add('is-zoomed');
        this.updateTitles();

        Promise.all([this.loadTasks(), this.loadCompletions()]).then(() => {
            this.renderBallsForMonth(this.selectedMonth, this.selectedYear);
        });
    }

    initElements() {
        this.container  = document.getElementById('calendar');
        this.months     = document.getElementById('months');
        this.monthTitle = document.getElementById('monthTitle');
        this.yearTitle  = document.getElementById('yearTitle');
        this.yearChip   = document.getElementById('yearChip');
        this.prevBtn     = document.getElementById('prevBtn');
        this.nextBtn     = document.getElementById('nextBtn');
        this.prevYearBtn = document.getElementById('prevYearBtn');
        this.nextYearBtn = document.getElementById('nextYearBtn');

        this.addTaskBtn      = document.getElementById('addTaskBtn');
        this.modalOverlay    = document.getElementById('taskModalOverlay');
        this.taskForm        = document.getElementById('taskForm');
        this.taskCancelBtn   = document.getElementById('taskCancelBtn');
        this.taskNameInput   = document.getElementById('taskName');
        this.taskColorInput  = document.getElementById('taskColor');
        this.taskColorPicker = document.getElementById('taskColorPicker');
        this.taskNameError   = document.getElementById('taskNameError');
        this.taskColorError  = document.getElementById('taskColorError');
        this.taskTypeToggle  = document.getElementById('taskTypeToggle');
        this.panelInner      = this.dayPanel.querySelector('.day-panel-inner');

        this.jars = Array.from(document.querySelectorAll('.tp-jar'));
    }

    attachEventListeners() {
        this.prevBtn.addEventListener('click', () => this.previousMonth());
        this.nextBtn.addEventListener('click', () => this.nextMonth());
        this.yearChip.addEventListener('click', () => this.zoomToYear());

        this.prevYearBtn.addEventListener('click', () => this.changeYear(-1));
        this.nextYearBtn.addEventListener('click', () => this.changeYear(1));

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        this.addTaskBtn.addEventListener('click', () => this.openTaskModal());
        this.taskCancelBtn.addEventListener('click', () => this.closeTaskModal());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this.closeTaskModal();
        });
        this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));

        this.taskColorPicker.addEventListener('input', () => {
            this.taskColorInput.value = this.taskColorPicker.value;
            this.clearFieldError(this.taskColorInput, this.taskColorError);
        });
        this.taskColorInput.addEventListener('input', () => {
            if (this.isValidHex(this.taskColorInput.value)) {
                this.taskColorPicker.value = this.taskColorInput.value;
            }
        });

        this.taskTypeToggle.querySelectorAll('.tm-toggle-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                this.taskTypeToggle.querySelectorAll('.tm-toggle-opt')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedTaskType = btn.dataset.type;
            });
        });
    }

    /* ── Task creation modal ── */
    openTaskModal() {
        if (this.taskCount >= this.maxTasks) return;
        this.modalOverlay.classList.add('open');
        this.taskNameInput.focus();
    }

    closeTaskModal() {
        this.modalOverlay.classList.remove('open');
        this.resetTaskForm();
    }

    resetTaskForm() {
        this.taskForm.reset();
        this.taskColorPicker.value = '#23a8f2';
        this.selectedTaskType = 'Completion';
        this.taskTypeToggle.querySelectorAll('.tm-toggle-opt').forEach((b, i) => {
            b.classList.toggle('active', i === 0);
        });
        this.clearFieldError(this.taskNameInput, this.taskNameError);
        this.clearFieldError(this.taskColorInput, this.taskColorError);
    }

    isValidHex(value) {
        return /^#[0-9a-fA-F]{6}$/.test(value.trim());
    }

    setFieldError(input, errorEl, message) {
        input.classList.add('invalid');
        errorEl.textContent = message;
    }

    clearFieldError(input, errorEl) {
        input.classList.remove('invalid');
        errorEl.textContent = '';
    }

    async handleTaskSubmit(e) {
        e.preventDefault();

        const name  = this.taskNameInput.value.trim();
        const color = this.taskColorInput.value.trim();
        let valid = true;

        if (!name) {
            this.setFieldError(this.taskNameInput, this.taskNameError, 'Name is required');
            valid = false;
        } else {
            this.clearFieldError(this.taskNameInput, this.taskNameError);
        }

        if (!color) {
            this.setFieldError(this.taskColorInput, this.taskColorError, 'Color is required');
            valid = false;
        } else if (!this.isValidHex(color)) {
            this.setFieldError(this.taskColorInput, this.taskColorError, 'Use a valid hex like #23a8f2');
            valid = false;
        } else {
            this.clearFieldError(this.taskColorInput, this.taskColorError);
        }

        if (!valid) return;

        const task = { name, color, type: this.selectedTaskType };

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                this.setFieldError(this.taskNameInput, this.taskNameError,
                    data.error || 'Could not save task');
                return;
            }

            this.tasks.push(data.task);
            this.renderTaskButton(data.task);
            this.closeTaskModal();
        } catch {
            this.setFieldError(this.taskNameInput, this.taskNameError,
                'Could not reach the server');
        }
    }

    async loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            if (!res.ok) return;
            const { tasks } = await res.json();
            (tasks || []).forEach((task) => {
                this.tasks.push(task);
                this.renderTaskButton(task);
            });
        } catch {
            // Offline / static hosting
        }
    }

    async loadCompletions() {
        try {
            const res = await fetch('/api/completions');
            if (!res.ok) return;
            const { completions } = await res.json();
            this.completions = completions || {};
        } catch {
            // Offline / static hosting
        }
    }

    renderTaskButton(task) {
        const blank = this.panelInner.querySelector('.dp-blank-btn');
        if (!blank) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dp-task-btn';
        btn.style.background = task.color;
        btn.dataset.taskName = task.name;
        btn.dataset.taskType = task.type;
        btn.title = `${task.name} · ${task.type}`;

        const undoArrow = document.createElement('span');
        undoArrow.className = 'dp-task-undo';
        undoArrow.textContent = '←';
        undoArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleUndo(task, btn);
        });

        const label = document.createElement('span');
        label.className = 'dp-task-label';
        label.textContent = task.name;

        btn.appendChild(undoArrow);
        btn.appendChild(label);
        btn.addEventListener('click', () => this.handleTaskClick(task, btn));

        blank.replaceWith(btn);
        this.fillJar(this.taskCount, task);
        this.taskCount++;

        if (window.gsap) {
            gsap.from(btn, {
                duration: 0.45,
                opacity: 0,
                y: 12,
                scale: 0.9,
                transformOrigin: 'center center',
                ease: 'back.out(1.7)',
                clearProps: 'opacity,transform',
            });
        }

        if (this.taskCount >= this.maxTasks) {
            this.addTaskBtn.disabled = true;
        }
    }

    /* ── Ball physics ── */

    // Ball radii (px): derived from CSS variables --ball-completion-size and --ball-repeated-size
    ballRadius(type) {
        // Get sizes from CSS variables
        const root = document.documentElement;
        const completionSize = parseFloat(getComputedStyle(root).getPropertyValue('--ball-completion-size'));
        const repeatedSize = parseFloat(getComputedStyle(root).getPropertyValue('--ball-repeated-size'));
        return type === 'Completion' ? completionSize / 2 : repeatedSize / 2;
    }

    // Create a ball element dropped at the top of the box (fixed y, random x).
    // Returns a physics body { el, r, x, y, vx, vy } at its spawn point.
    makeBall(dayBox, taskName, color, type) {
        const r   = this.ballRadius(type);
        const w   = dayBox.clientWidth || 64;
        const pad = PHYSICS.SPAWN_PAD;
        const span = Math.max(0, w - 2 * (pad + r));

        const el = document.createElement('div');
        el.className    = `ball ball-${type.toLowerCase()}`;
        el.dataset.task = taskName;
        el.style.background = color;
        dayBox.appendChild(el);

        const ball = {
            el, r,
            x: pad + r + Math.random() * span,            // random x, ball-size aware
            y: pad + r + Math.random() * PHYSICS.SPAWN_JITTER, // near the top, slight spread
            vx: (Math.random() - 0.5) * PHYSICS.SPAWN_VX,
            vy: 0,
        };
        this.placeBall(ball);
        return ball;
    }

    // Read the balls already settled in a box back into physics bodies.
    readBoxBalls(dayBox) {
        return Array.from(dayBox.querySelectorAll('.ball')).map(el => {
            const type = el.classList.contains('ball-completion') ? 'Completion' : 'Repeated';
            const r = this.ballRadius(type);
            return { el, r, x: el.offsetLeft + r, y: el.offsetTop + r, vx: 0, vy: 0 };
        });
    }

    // Position a ball's element from its center coordinates (render step).
    placeBall(b) {
        b.el.style.left = (b.x - b.r) + 'px';
        b.el.style.top  = (b.y - b.r) + 'px';
    }

    // Clamp a ball inside the box. With reflect, also bounce the velocity
    // component (COR) — clamp-and-reflect inherently prevents wall tunneling.
    clampToWalls(b, w, h, reflect) {
        const { COR, FLOOR_STICK } = PHYSICS;
        if (b.x < b.r)          { b.x = b.r;     if (reflect) b.vx = -b.vx * COR; }
        else if (b.x > w - b.r) { b.x = w - b.r; if (reflect) b.vx = -b.vx * COR; }
        if (b.y < b.r)          { b.y = b.r;     if (reflect) b.vy = -b.vy * COR; }
        else if (b.y > h - b.r) {
            b.y = h - b.r;
            if (reflect) {
                b.vy = -b.vy * COR;
                if (Math.abs(b.vy) < FLOOR_STICK) b.vy = 0;   // settle on the floor
            }
        }
    }

    // Advance the simulation one fixed timestep: gravity, then wall + ball
    // collisions. Pure physics — no DOM access.
    stepPhysics(balls, w, h, dt) {
        const { G, COR, DAMP, RELAX } = PHYSICS;

        // 1) Integrate, damp, resolve walls (velocity bounce + clamp).
        for (const b of balls) {
            b.vy += G * dt;
            b.vx *= DAMP;
            b.vy *= DAMP;
            b.x  += b.vx * dt;
            b.y  += b.vy * dt;
            this.clampToWalls(b, w, h, true);
        }

        // 2) Ball-to-ball. Apply the velocity impulse once, then relax
        //    positions over several passes so chained / simultaneous overlaps
        //    fully separate, re-clamping to the walls after each pass so a
        //    push never leaves a ball out of bounds.
        for (let pass = 0; pass < RELAX; pass++) {
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i], c = balls[j];
                    let dx = c.x - a.x, dy = c.y - a.y;
                    let dist = Math.hypot(dx, dy);
                    const min = a.r + c.r;
                    if (dist >= min) continue;

                    // Coincident centers (e.g. two balls on the same spawn spot).
                    if (dist === 0) {
                        dx = Math.random() - 0.5;
                        dy = Math.random() - 0.5;
                        dist = Math.hypot(dx, dy) || 1e-6;
                    }

                    const nx = dx / dist, ny = dy / dist;   // collision normal A->B
                    const overlap = min - dist;
                    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                    c.x += nx * overlap / 2; c.y += ny * overlap / 2;

                    if (pass === 0) {
                        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
                        if (vn < 0) {                        // only if approaching
                            const imp = -(1 + COR) * vn / 2; // equal mass impulse
                            a.vx -= imp * nx; a.vy -= imp * ny;
                            c.vx += imp * nx; c.vy += imp * ny;
                        }
                    }
                }
            }
            for (const b of balls) this.clampToWalls(b, w, h, false);
        }
    }

    // True when total per-frame movement is negligible (balls at rest).
    boxAtRest(balls, before) {
        let moved = 0;
        balls.forEach((b, i) => {
            moved += Math.abs(b.x - before[i][0]) + Math.abs(b.y - before[i][1]);
        });
        return moved < PHYSICS.REST_EPS * balls.length;
    }

    // Animated drop: rAF loop running fixed substeps until the balls settle,
    // then it stops (no idle CPU).
    simulateBox(dayBox, balls, w, h) {
        if (dayBox._raf) cancelAnimationFrame(dayBox._raf);

        let last = performance.now(), acc = 0, elapsed = 0, restFrames = 0;
        const tick = (now) => {
            let dt = (now - last) / 1000;
            last = now;
            if (dt > 0.05) dt = 0.05;        // clamp huge gaps (tab refocus)
            acc += dt; elapsed += dt;

            const before = balls.map(b => [b.x, b.y]);
            let steps = 0;
            while (acc >= PHYSICS.STEP && steps < PHYSICS.MAX_SUBSTEPS) {
                this.stepPhysics(balls, w, h, PHYSICS.STEP);
                acc -= PHYSICS.STEP; steps++;
            }
            if (acc > PHYSICS.STEP) acc = 0;  // drop backlog after a stall
            balls.forEach(b => this.placeBall(b));

            restFrames = this.boxAtRest(balls, before) ? restFrames + 1 : 0;
            if (restFrames >= PHYSICS.REST_FRAMES || elapsed > PHYSICS.MAX_TIME) {
                dayBox._raf = null;
                return;
            }
            dayBox._raf = requestAnimationFrame(tick);
        };
        dayBox._raf = requestAnimationFrame(tick);
    }

    // Synchronous settle: same physics, no animation — used to lay out the
    // month overview without dozens of concurrent rAF loops.
    settleBox(dayBox, balls, w, h) {
        let restFrames = 0;
        for (let i = 0; i < PHYSICS.MAX_ITERS; i++) {
            const before = balls.map(b => [b.x, b.y]);
            this.stepPhysics(balls, w, h, PHYSICS.STEP);
            restFrames = this.boxAtRest(balls, before) ? restFrames + 1 : 0;
            if (restFrames >= PHYSICS.REST_FRAMES) break;
        }
        balls.forEach(b => this.placeBall(b));
    }

    // Drop one new ball into a box alongside its settled balls, then animate.
    spawnAndSimulate(dayBox, taskName, color, type) {
        const w = dayBox.clientWidth  || 64;
        const h = dayBox.clientHeight || 64;
        const balls = this.readBoxBalls(dayBox);
        const fresh = this.makeBall(dayBox, taskName, color, type);
        balls.push(fresh);
        this.simulateBox(dayBox, balls, w, h);
        return fresh;
    }

    /* ── Task click / undo ── */

    handleTaskClick(task, btn) {
        if (!this.selectedCell || !this.selectedDateStr) return;
        if (task.type === 'Completion' && btn.classList.contains('done')) return;

        const dateStr = this.selectedDateStr;
        const dayBox  = this.selectedCell.querySelector('.day-box');

        if (!this.completions[dateStr]) this.completions[dateStr] = {};
        if (!this.completions[dateStr][task.name]) this.completions[dateStr][task.name] = [];
        this.completions[dateStr][task.name].push(null);   // count only; positions are re-dropped

        const fresh = this.spawnAndSimulate(dayBox, task.name, task.color, task.type);
        btn.classList.add('has-balls');

        if (task.type === 'Completion') {
            btn.classList.add('done');
            btn.querySelector('.dp-task-label').textContent = '✓';
        }

        fetch('/api/completions/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, taskName: task.name, pos: null }),
        }).catch(() => {
            // Rollback on network failure
            this.completions[dateStr][task.name].pop();
            fresh.el.remove();
            const remaining = this.completions[dateStr]?.[task.name]?.length || 0;
            btn.classList.toggle('has-balls', remaining > 0);
            if (task.type === 'Completion') {
                btn.classList.remove('done');
                btn.querySelector('.dp-task-label').textContent = task.name;
            }
        });
    }

    handleUndo(task, btn) {
        if (!this.selectedCell || !this.selectedDateStr) return;
        const dateStr = this.selectedDateStr;
        const entries = this.completions[dateStr]?.[task.name];
        if (!entries || !entries.length) return;

        const dayBox = this.selectedCell.querySelector('.day-box');
        this.completions[dateStr][task.name].pop();

        // Each entry maps to one ball — remove the most recent of this task.
        if (dayBox._raf) { cancelAnimationFrame(dayBox._raf); dayBox._raf = null; }
        const taskBalls = Array.from(dayBox.querySelectorAll('.ball'))
            .filter(b => b.dataset.task === task.name);
        if (taskBalls.length) taskBalls[taskBalls.length - 1].remove();

        // Let the remaining pile collapse into the gap.
        const pile = this.readBoxBalls(dayBox);
        if (pile.length) {
            this.settleBox(dayBox, pile, dayBox.clientWidth || 64, dayBox.clientHeight || 64);
        }

        if (!this.completions[dateStr][task.name].length) {
            delete this.completions[dateStr][task.name];
            if (!Object.keys(this.completions[dateStr]).length) {
                delete this.completions[dateStr];
            }
        }

        const remaining = this.completions[dateStr]?.[task.name]?.length || 0;
        btn.classList.toggle('has-balls', remaining > 0);

        if (task.type === 'Completion') {
            btn.classList.remove('done');
            btn.querySelector('.dp-task-label').textContent = task.name;
        }

        fetch('/api/completions/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, taskName: task.name }),
        }).catch(() => {
            this.loadCompletions().then(() => {
                this.renderBallsForMonth(this.selectedMonth, this.selectedYear);
                if (this.selectedDateStr) this.updateButtonStates(this.selectedDateStr);
            });
        });
    }

    updateButtonStates(dateStr) {
        const dayData = this.completions[dateStr] || {};
        this.panelInner.querySelectorAll('.dp-task-btn').forEach(btn => {
            const taskName = btn.dataset.taskName;
            const taskType = btn.dataset.taskType;
            const label    = btn.querySelector('.dp-task-label');
            const count    = dayData[taskName]?.length || 0;

            btn.classList.toggle('has-balls', count > 0);

            if (taskType === 'Completion') {
                if (count >= 1) {
                    btn.classList.add('done');
                    if (label) label.textContent = '✓';
                } else {
                    btn.classList.remove('done');
                    if (label) label.textContent = taskName;
                }
            }
        });
    }

    /* ── Ball rendering ── */

    renderBallsForMonth(m, year) {
        const card = this.cards[m];
        if (!card) return;
        card.querySelectorAll('.cell:not(.other)').forEach(cell => {
            const dayNum  = parseInt(cell.querySelector('.num').textContent);
            const dateStr = this.dateKey(dayNum, m, year);
            const dayBox  = cell.querySelector('.day-box');

            if (dayBox._raf) { cancelAnimationFrame(dayBox._raf); dayBox._raf = null; }
            dayBox.querySelectorAll('.ball').forEach(b => b.remove());

            const dayData = this.completions[dateStr];
            if (!dayData) return;

            // Re-drop one ball per stored entry (positions are not persisted),
            // then settle the whole box synchronously into a pile.
            const balls = [];
            Object.entries(dayData).forEach(([taskName, entries]) => {
                const task = this.tasks.find(t => t.name === taskName);
                if (!task || !entries.length) return;
                for (let i = 0; i < entries.length; i++) {
                    balls.push(this.makeBall(dayBox, taskName, task.color, task.type));
                }
            });

            if (balls.length) {
                this.settleBox(dayBox, balls, dayBox.clientWidth || 64, dayBox.clientHeight || 64);
            }
        });
    }

    /* ── Utilities ── */

    dateKey(day, m, year) {
        const mm = String(m + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
    }

    fillJar(index, task) {
        const jar = this.jars[index];
        if (!jar) return;
        jar.style.setProperty('--task-color', task.color);
        jar.style.setProperty('--task-color-soft', this.hexToRgba(task.color, 0.18));
        jar.classList.add('filled');
        jar.title = `${task.name} · ${task.type}`;
    }

    hexToRgba(hex, alpha) {
        const v = hex.replace('#', '');
        const r = parseInt(v.slice(0, 2), 16);
        const g = parseInt(v.slice(2, 4), 16);
        const b = parseInt(v.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    handleKeyboard(e) {
        if (this.modalOverlay.classList.contains('open')) {
            if (e.key === 'Escape') this.closeTaskModal();
            return;
        }
        if (this.mode === 'year') {
            if (e.key === 'ArrowLeft')  this.changeYear(-1);
            if (e.key === 'ArrowRight') this.changeYear(1);
            if (e.key === 'Escape')     this.zoomToMonth(this.selectedMonth);
        } else {
            if (e.key === 'ArrowLeft')  this.previousMonth();
            if (e.key === 'ArrowRight') this.nextMonth();
            if (e.key === 'Escape')     this.zoomToYear();
        }
    }

    /* ── Calendar grid ── */

    buildGrids(year) {
        this.months.innerHTML = '';
        this.cards = [];
        this.selectedCell    = null;
        this.selectedDay     = null;
        this.selectedDateStr = null;
        this.appWrapper.classList.remove('day-selected');

        for (let m = 0; m < 12; m++) {
            this.months.appendChild(this.createCard(m, year));
        }
    }

    createCard(m, year) {
        const card = document.createElement('div');
        card.className = 'm-card';
        card.style.gridColumn = (m % 4) + 1;
        card.style.gridRow    = Math.floor(m / 4) + 1;

        if (m === this.currentMonth && year === this.currentYear) {
            card.classList.add('cur');
        }

        const head = document.createElement('div');
        head.className = 'm-head';
        head.textContent = this.monthNames[m];

        const weekdays = document.createElement('div');
        weekdays.className = 'm-weekdays';
        this.weekdayNames.forEach(w => {
            const s = document.createElement('span');
            s.textContent = w;
            weekdays.appendChild(s);
        });

        const days = document.createElement('div');
        days.className = 'm-days';
        this.fillDays(days, m, year);

        card.appendChild(head);
        card.appendChild(weekdays);
        card.appendChild(days);

        card.addEventListener('click', () => {
            if (this.mode === 'year') this.zoomToMonth(m);
        });

        this.cards[m] = card;
        return card;
    }

    fillDays(container, m, year) {
        const firstDay    = new Date(year, m, 1);
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const startDOW    = firstDay.getDay();
        const prevLast    = new Date(year, m, 0).getDate();

        for (let i = startDOW - 1; i >= 0; i--) {
            container.appendChild(this.createCell(prevLast - i, true, m, year));
        }
        for (let d = 1; d <= daysInMonth; d++) {
            container.appendChild(this.createCell(d, false, m, year));
        }
        const remaining = 42 - container.children.length;
        for (let d = 1; d <= remaining; d++) {
            container.appendChild(this.createCell(d, true, m, year));
        }
    }

    createCell(day, isOther, m, year) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (isOther) cell.classList.add('other');

        const box = document.createElement('div');
        box.className = 'day-box';

        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = day;

        cell.appendChild(box);
        cell.appendChild(num);

        const isToday = !isOther &&
            day  === this.today.getDate() &&
            m    === this.today.getMonth() &&
            year === this.today.getFullYear();
        if (isToday) cell.classList.add('today');

        if (!isOther) {
            cell.addEventListener('click', (e) => {
                if (this.mode !== 'month') return;
                e.stopPropagation();
                this.months.querySelectorAll('.cell.selected')
                    .forEach(c => c.classList.remove('selected'));
                cell.classList.add('selected');
                this.selectedCell = cell;
                this.showDayPanel(day, m, year);
            });
        }

        return cell;
    }

    /* ── FLIP animation ── */

    flip(card, applyChanges) {
        const first = card.getBoundingClientRect();
        applyChanges();
        const last = card.getBoundingClientRect();

        const dx = first.left - last.left;
        const dy = first.top  - last.top;
        const sx = first.width  / last.width;
        const sy = first.height / last.height;

        card.classList.add('flipping');
        card.style.transition = 'none';
        card.style.transformOrigin = 'top left';
        card.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        card.getBoundingClientRect();

        requestAnimationFrame(() => {
            card.style.transition = 'transform 0.45s cubic-bezier(0.45, 0, 0.2, 1)';
            card.style.transform = '';
        });

        const done = (e) => {
            if (e.propertyName !== 'transform') return;
            card.classList.remove('flipping');
            card.style.transition = '';
            card.style.transform = '';
            card.style.transformOrigin = '';
            card.removeEventListener('transitionend', done);
        };
        card.addEventListener('transitionend', done);
    }

    zoomToMonth(m) {
        const card = this.cards[m];
        this.flip(card, () => {
            this.cards.forEach(c => c.classList.remove('is-zoomed'));
            card.classList.add('is-zoomed');
            this.selectedMonth = m;
            this.mode = 'month';
            this.container.classList.remove('mode-year');
            this.container.classList.add('mode-month');
            this.updateTitles();
            this.renderBallsForMonth(m, this.selectedYear);
        });
    }

    zoomToYear() {
        const card = this.cards[this.selectedMonth];
        this.flip(card, () => {
            card.classList.remove('is-zoomed');
            this.mode = 'year';
            this.container.classList.remove('mode-month');
            this.container.classList.add('mode-year');
            this.updateTitles();
        });
    }

    updateTitles() {
        this.monthTitle.textContent = this.monthNames[this.selectedMonth];
        this.yearChip.textContent   = this.selectedYear;
        this.yearTitle.textContent  = this.selectedYear;
    }

    /* ── Month navigation ── */

    previousMonth() {
        let m = this.selectedMonth - 1;
        if (m < 0) { m = 11; this.selectedYear--; this.buildGrids(this.selectedYear); }
        this.swapZoomedMonth(m);
    }

    nextMonth() {
        let m = this.selectedMonth + 1;
        if (m > 11) { m = 0; this.selectedYear++; this.buildGrids(this.selectedYear); }
        this.swapZoomedMonth(m);
    }

    swapZoomedMonth(m) {
        this.cards.forEach(c => c.classList.remove('is-zoomed'));
        this.selectedMonth = m;
        this.cards[m].classList.add('is-zoomed');
        this.updateTitles();
        this.selectedCell    = null;
        this.selectedDay     = null;
        this.selectedDateStr = null;
        this.appWrapper.classList.remove('day-selected');
        this.renderBallsForMonth(m, this.selectedYear);
    }

    changeYear(delta) {
        this.selectedYear += delta;
        this.buildGrids(this.selectedYear);
        this.updateTitles();
    }

    showDayPanel(day, m, year) {
        const date = new Date(year, m, day);
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        document.getElementById('dpWeekday').textContent = weekdays[date.getDay()];
        document.getElementById('dpNum').textContent     = day;
        document.getElementById('dpMonth').textContent   = this.monthNames[m];
        document.getElementById('dpYear').textContent    = year;
        this.appWrapper.classList.add('day-selected');
        this.dayPanel.classList.remove('reveal');
        void this.dayPanel.offsetWidth;
        this.dayPanel.classList.add('reveal');

        this.selectedDay     = day;
        this.selectedDateStr = this.dateKey(day, m, year);
        this.updateButtonStates(this.selectedDateStr);
    }
}

document.addEventListener('DOMContentLoaded', () => new Calendar());
