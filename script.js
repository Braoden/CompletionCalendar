// ── Ball physics tuning (pixels, seconds) ──
const PHYSICS = {
    G:            1800,    // gravity, px/s²
    COR:          0.5,     // coefficient of restitution
    DAMP:         0.98,    // per-step velocity damping (bleeds energy -> rest)
    FLOOR_STICK:  30,      // below this |vy| on the floor, stop micro-bouncing
    STEP:         1 / 120, // fixed physics timestep (s)
    MAX_SUBSTEPS: 6,       // cap substeps/frame (avoids the spiral of death)
    RELAX:        8,        // ball-ball position relaxation passes per step
    COLLIDE:      1.08,    // ball-ball collision radius multiplier (visual fudge)
    SPAWN_PAD:    1,       // inset from the box edge at spawn
    SPAWN_JITTER: 6,       // random y spread at spawn — breaks the synchronized
                           // fall so a too-wide row can climb into a second row
    SPAWN_VX:     30,      // small random horizontal launch speed (px/s)
    REST_EPS:     5,    // per-ball px movement/frame counted as "still"
    REST_FRAMES:  500,      // consecutive still frames before sleeping
    MAX_TIME:     6,       // hard stop for the animation loop (s)
    MAX_ITERS:    2000,    // hard stop for the synchronous settle
    LOAD_DELAY:   1000,    // pause (ms) before balls fall in on load
    LOAD_STAGGER: 120,      // delay (ms) between each ball on load, so they don't overlap
};

const JAR_CAP  = 50;     // balls per jar before it "completes", celebrates and empties
const JAR_HOLD = 2500;   // ms the "Jar Complete" state holds before the jar drains

// Jar balls hitbox.
const JAR_BALL_HALF = 9.5;                // visual half-size (px)
const JAR_BALL_R    = 9.5 * 0.95;  // collision radius (px), a further 2% smaller
const JAR_WALL_R    = JAR_BALL_R + 2.5;   // wall radius (px) — insets jar walls slightly

class Calendar {
    constructor() {
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
        this.selectedDateStr = null;
        this.selectedCell = null;

        this.initElements();
        this.attachEventListeners();

        this.buildGrids(this.selectedYear);
        this.cards[this.selectedMonth].classList.add('is-zoomed');
        this.updateTitles();

        Promise.all([this.loadTasks(), this.loadCompletions()]).then(() => {
            this.cards[this.selectedMonth].querySelector('.cell.today')?.click();
            setTimeout(() => this.dropInBalls(), PHYSICS.LOAD_DELAY);
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

        this.delTaskBtn      = document.getElementById('delTaskBtn');
        this.delModalOverlay = document.getElementById('delModalOverlay');
        this.delGrid         = document.getElementById('delGrid');
        this.delCancelBtn    = document.getElementById('delCancelBtn');

        this.editTaskModalOverlay = document.getElementById('editTaskModalOverlay');
        this.editTaskTitle        = document.getElementById('editTaskTitle');
        this.editTaskForm         = document.getElementById('editTaskForm');
        this.editTaskName         = document.getElementById('editTaskName');
        this.editTaskColor        = document.getElementById('editTaskColor');
        this.editTaskColorPicker  = document.getElementById('editTaskColorPicker');
        this.editTaskNameError    = document.getElementById('editTaskNameError');
        this.editTaskColorError   = document.getElementById('editTaskColorError');
        this.editTaskCancelBtn    = document.getElementById('editTaskCancelBtn');
        this.editTaskDeleteBtn    = document.getElementById('editTaskDeleteBtn');

        this.jars = Array.from(document.querySelectorAll('.tp-jar'));

        this.viewJarsBtn = document.getElementById('viewJarsBtn');
        this.jarsBackBtn = document.getElementById('jarsBackBtn');
        this.jarsView    = document.getElementById('jarsView');
        this.shelvesGrid = document.getElementById('shelvesGrid');
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

        this.delTaskBtn.addEventListener('click', () => this.openEditModal());
        this.delCancelBtn.addEventListener('click', () => this.closeDeleteModal());
        this.delModalOverlay.addEventListener('click', (e) => {
            if (e.target === this.delModalOverlay) this.closeDeleteModal();
        });

        this.editTaskCancelBtn.addEventListener('click', () => this.closeEditTaskModal());
        this.editTaskModalOverlay.addEventListener('click', (e) => {
            if (e.target === this.editTaskModalOverlay) this.closeEditTaskModal();
        });
        this.editTaskForm.addEventListener('submit', (e) => this.handleEditSubmit(e));

        this.editTaskColorPicker.addEventListener('input', () => {
            this.editTaskColor.value = this.editTaskColorPicker.value;
            this.clearFieldError(this.editTaskColor, this.editTaskColorError);
        });
        this.editTaskColor.addEventListener('input', () => {
            if (this.isValidHex(this.editTaskColor.value)) {
                this.editTaskColorPicker.value = this.editTaskColor.value;
            }
        });

        this.taskColorPicker.addEventListener('input', () => {
            this.taskColorInput.value = this.taskColorPicker.value;
            this.clearFieldError(this.taskColorInput, this.taskColorError);
        });
        this.taskColorInput.addEventListener('input', () => {
            if (this.isValidHex(this.taskColorInput.value)) {
                this.taskColorPicker.value = this.taskColorInput.value;
            }
        });

        this.viewJarsBtn.addEventListener('click', () => this.openJarsView());
        this.jarsBackBtn.addEventListener('click', () => this.closeJarsView());

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

    /* ── Edit-tasks modal ── */
    openEditModal() {
        this.delGrid.innerHTML = '';
        this.tasks.forEach((task) => {
            const slot = document.createElement('button');
            slot.type = 'button';
            slot.className = 'del-slot';
            slot.draggable = true;
            slot.style.background = task.color;
            slot.dataset.taskName = task.name;
            slot.title = `Edit ${task.name}`;
            const label = document.createElement('span');
            label.className = 'del-slot-label';
            label.textContent = task.name;
            slot.appendChild(label);
            slot.addEventListener('click', () => this.openEditTaskModal(task));
            this.addDragHandlers(slot);
            this.delGrid.appendChild(slot);
        });
        for (let i = this.tasks.length; i < this.maxTasks; i++) {
            const slot = document.createElement('button');
            slot.type = 'button';
            slot.className = 'del-slot empty';
            slot.disabled = true;
            this.delGrid.appendChild(slot);
        }
        this.delModalOverlay.classList.add('open');
    }

    closeDeleteModal() {
        this.delModalOverlay.classList.remove('open');
    }

    // Native drag-and-drop reorder: as a slot is dragged over a sibling, move it
    // there in the DOM; on drop, persist the new order to the server.
    addDragHandlers(slot) {
        slot.addEventListener('dragstart', () => slot.classList.add('dragging'));
        slot.addEventListener('dragend', () => {
            slot.classList.remove('dragging');
            this.persistOrder();
        });
        slot.addEventListener('dragover', (e) => e.preventDefault());
        slot.addEventListener('dragenter', (e) => {
            e.preventDefault();
            const dragging = this.delGrid.querySelector('.dragging');
            if (!dragging || dragging === slot || slot.classList.contains('empty')) return;
            const slots = [...this.delGrid.children];
            if (slots.indexOf(dragging) < slots.indexOf(slot)) slot.after(dragging);
            else slot.before(dragging);
        });
    }

    async persistOrder() {
        const order = [...this.delGrid.querySelectorAll('.del-slot:not(.empty)')]
            .map(s => s.dataset.taskName);
        const current = this.tasks.map(t => t.name);
        if (order.join(' ') === current.join(' ')) return;   // unchanged
        try {
            const res = await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order }),
            });
            // Reload re-derives buttons, jars and ball indices in the new order.
            if (res.ok) window.location.reload();
        } catch {
            // Offline / static hosting — nothing to persist against.
        }
    }

    /* ── Single-task edit modal ── */
    openEditTaskModal(task) {
        this.editingTask = task;
        this.editTaskTitle.textContent = `Edit "${task.name}"`;
        this.editTaskName.value  = task.name;
        this.editTaskColor.value = task.color;
        this.editTaskColorPicker.value = task.color;
        this.clearFieldError(this.editTaskName, this.editTaskNameError);
        this.clearFieldError(this.editTaskColor, this.editTaskColorError);
        this.editTaskDeleteBtn.onclick = () => this.handleDeleteTask(task);
        this.editTaskModalOverlay.classList.add('open');
        this.editTaskName.focus();
    }

    closeEditTaskModal() {
        this.editTaskModalOverlay.classList.remove('open');
    }

    async handleEditSubmit(e) {
        e.preventDefault();

        const name  = this.editTaskName.value.trim();
        const color = this.editTaskColor.value.trim();
        let valid = true;

        if (!name) {
            this.setFieldError(this.editTaskName, this.editTaskNameError, 'Name is required');
            valid = false;
        } else {
            this.clearFieldError(this.editTaskName, this.editTaskNameError);
        }

        if (!color) {
            this.setFieldError(this.editTaskColor, this.editTaskColorError, 'Color is required');
            valid = false;
        } else if (!this.isValidHex(color)) {
            this.setFieldError(this.editTaskColor, this.editTaskColorError, 'Use a valid hex like #23a8f2');
            valid = false;
        } else {
            this.clearFieldError(this.editTaskColor, this.editTaskColorError);
        }

        if (!valid) return;

        try {
            const res = await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original: this.editingTask.name,
                    name, color, type: this.editingTask.type,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.setFieldError(this.editTaskName, this.editTaskNameError,
                    data.error || 'Could not save task');
                return;
            }
            // Reload re-derives buttons, jars and ball indices from the edited task.
            window.location.reload();
        } catch {
            this.setFieldError(this.editTaskName, this.editTaskNameError,
                'Could not reach the server');
        }
    }

    async handleDeleteTask(task) {
        try {
            const res = await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: task.name }),
            });
            if (!res.ok) return;
            // Rebuilding buttons, jars and ball indices by hand is fiddly —
            // a reload re-derives the whole panel cleanly from the server.
            window.location.reload();
        } catch {
            // Offline / static hosting — nothing to delete against.
        }
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
        btn.dataset.jarIndex = this.taskCount;   // jar at this index belongs to this task
        btn.title = `${task.name} · ${task.type}`;

        const undoArrow = document.createElement('span');
        undoArrow.className = 'dp-task-undo';
        undoArrow.textContent = '✖';
        undoArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleUndo(task, btn);
        });

        const label = document.createElement('span');
        label.className = 'dp-task-label';
        label.textContent = task.name;

        const btnBall = document.createElement('span');
        btnBall.className = 'dp-task-btn-ball';
        btnBall.style.background = task.color;

        btn.appendChild(undoArrow);
        btn.appendChild(label);
        if (task.type === 'Repeated') {
            const count = document.createElement('span');
            count.className = 'dp-task-count';
            btn.appendChild(count);   // shows per-day completion count, left of the ball
        }
        btn.appendChild(btnBall);
        btn.addEventListener('click', () => {
            // Re-trigger the left-to-right sweep highlight on every click.
            btn.classList.remove('sweep');
            void btn.offsetWidth;
            btn.classList.add('sweep');
            this.handleTaskClick(task, btn);
        });

        blank.replaceWith(btn);
        this.fillJar(this.taskCount, task);
        this.taskCount++;

        btn.classList.add('pop-in');

        if (this.taskCount >= this.maxTasks) {
            this.addTaskBtn.disabled = true;
        }
    }

    /* ── Ball physics ── */

    // Ball radius (px), scaled proportionally to the box width so balls shrink
    // with the day-box in year view. CSS sizes are authored for a 64px box.
    ballRadius(type, boxW) {
        const root = document.documentElement;
        const completionSize = parseFloat(getComputedStyle(root).getPropertyValue('--ball-completion-size'));
        const repeatedSize = parseFloat(getComputedStyle(root).getPropertyValue('--ball-repeated-size'));
        const size = type === 'Completion' ? completionSize : repeatedSize;
        return size / 2 * ((boxW || 64) / 64);
    }

    // Create a ball element dropped at the top of the box (fixed y, random x).
    // Returns a physics body { el, r, x, y, vx, vy } at its spawn point.
    makeBall(dayBox, taskName, color, type) {
        const w   = dayBox.clientWidth || 64;
        const r   = this.ballRadius(type, w);
        const pad = PHYSICS.SPAWN_PAD;
        const span = Math.max(0, w - 2 * (pad + r));

        const el = document.createElement('div');
        el.className    = `ball ball-${type.toLowerCase()}`;
        el.dataset.task = taskName;
        el.style.background = color;
        el.style.width = el.style.height = (2 * r) + 'px';
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
        const w = dayBox.clientWidth || 64;
        return Array.from(dayBox.querySelectorAll('.ball')).map(el => {
            const type = el.classList.contains('ball-completion') ? 'Completion' : 'Repeated';
            const r = this.ballRadius(type, w);
            return { el, r, x: el.offsetLeft + r, y: el.offsetTop + r, vx: 0, vy: 0 };
        });
    }

    // Position a ball's element from its center coordinates (render step).
    placeBall(b) {
        const half = b.half ?? b.r;   // jar balls render larger than their hitbox
        b.el.style.left = (b.x - half) + 'px';
        b.el.style.top  = (b.y - half) + 'px';
    }

    // Clamp a ball inside the box. With reflect, also bounce the velocity
    // component (COR) — clamp-and-reflect inherently prevents wall tunneling.
    clampToWalls(b, w, h, reflect) {
        const { COR, FLOOR_STICK } = PHYSICS;
        const wr = b.wallR ?? b.r;   // jar balls sit slightly off the walls
        if (b.x < wr)          { b.x = wr;     if (reflect) b.vx = -b.vx * COR; }
        else if (b.x > w - wr) { b.x = w - wr; if (reflect) b.vx = -b.vx * COR; }
        if (b.y < wr)          { b.y = wr;     if (reflect) b.vy = -b.vy * COR; }
        else if (b.y > h - wr) {
            b.y = h - wr;
            if (reflect) {
                b.vy = -b.vy * COR;
                if (Math.abs(b.vy) < FLOOR_STICK) b.vy = 0;   // settle on the floor
            }
        }
    }

    // Advance the simulation one fixed timestep: gravity, then wall + ball
    // collisions. Pure physics — no DOM access.
    stepPhysics(balls, w, h, dt, gy = PHYSICS.G) {
        const { COR, DAMP, RELAX } = PHYSICS;

        // 1) Integrate, damp, resolve walls (velocity bounce + clamp).
        // gy is effective vertical gravity — the jar-shake feeds it the box's
        // acceleration so the balls go light/heavy and bounce. Default: straight down.
        for (const b of balls) {
            b.vy += gy * dt;
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
                    const min = (a.r + c.r) * PHYSICS.COLLIDE;
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

            // Only judge rest on frames that actually advanced physics —
            // a zero-substep frame has no movement but isn't "at rest".
            if (steps > 0) restFrames = this.boxAtRest(balls, before) ? restFrames + 1 : 0;
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

    /* ── Jar ball animation ── */

    // Pulse the button ball, then launch it on a projectile arc into the jar.
    launchBallToJar(task, btn) {
        const jar = this.jars[+btn.dataset.jarIndex];
        const jarBody = jar && jar.querySelector('.tp-jar-body');
        const btnBall = btn.querySelector('.dp-task-btn-ball');
        if (!jarBody || !btnBall) return;

        const launch = () => {
            const from = btnBall.getBoundingClientRect();
            this.flyToJar(from, jarBody, task.color, null);

            if (task.type === 'Completion') {
                // One-and-done for this day: take the ball off the button.
                btnBall.style.display = 'none';
            } else {
                // Fade out on press, then fade back in after a short delay.
                btnBall.style.transition = 'opacity 0.2s ease';
                btnBall.style.opacity = '0';
                setTimeout(() => { btnBall.style.opacity = ''; }, 500);
            }
        };

        btnBall.classList.remove('pulse');
        void btnBall.offsetWidth;            // restart the CSS animation
        btnBall.classList.add('pulse');
        setTimeout(launch, 250);
    }

    // Projectile flight in viewport coordinates from `fromRect` to the jar's
    // top opening, gravity = PHYSICS.G. Apex is forced a fixed margin above the
    // landing point so the ball drops down into the jar. Calls onLand when done.
    flyToJar(fromRect, jarBody, color, onLand) {
        const g  = PHYSICS.G;
        const jb = jarBody.getBoundingClientRect();
        const x0 = fromRect.left + fromRect.width  / 2;
        const y0 = fromRect.top  + fromRect.height / 2;
        const xt = jb.left + jb.width / 2 + (Math.random() * 2 - 1) * 15;  // ±15px scatter
        const yt = jb.top + 11;                                            // just inside the lid

        const H    = 50;                       // apex clearance above the landing point
        const rise = Math.max(1, y0 - (yt - H));
        const T    = Math.sqrt(2 * rise / g) + Math.sqrt(2 * H / g);
        const vy   = -Math.sqrt(2 * g * rise);
        const vx   = (xt - x0) / T;

        const ball = document.createElement('div');
        ball.className = 'flight-ball';
        ball.style.background = color;
        document.body.appendChild(ball);

        let t = 0, last = performance.now();
        const tick = (now) => {
            let dt = (now - last) / 1000; last = now;
            if (dt > 0.05) dt = 0.05;
            t += dt;
            if (t >= T) {
                ball.remove();
                this.dropIntoJar(jarBody, color, xt, yt, vx);

                if (onLand) onLand();
                return;
            }
            ball.style.left = (x0 + vx * t - 10) + 'px';
            ball.style.top  = (y0 + vy * t + 0.5 * g * t * t - 10) + 'px';
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // Add one ball at the jar opening (mapped from screen X) and settle the jar.
    // Jar balls live in their own array, so they never collide with day-box balls.
    dropIntoJar(jarBody, color, screenX, screenY, vx = 0) {
        const jb = jarBody.getBoundingClientRect();
        const localX = Math.min(jarBody.clientWidth - 10, Math.max(10, screenX - jb.left));

        const balls = this.readJarBalls(jarBody);
        const fresh = this.makeJarBall(jarBody, color, localX, 10);
        fresh.vx = vx;   // carry the launch's horizontal velocity into the jar
        balls.push(fresh);
        this.simulateBox(jarBody, balls, jarBody.clientWidth, jarBody.clientHeight);

        // Every JAR_CAP completions, the jar fills, celebrates and empties.
        if (jarBody.querySelectorAll('.jar-ball').length >= JAR_CAP) {
            this.completeJar(jarBody.closest('.tp-jar'), jarBody, color);
        }
    }

    // Jar hit its cap: flood it bottom-to-top in the task color, show "Jar
    // Complete" with confetti, then drain top-to-bottom and clear the balls.
    completeJar(jar, jarBody, color) {
        if (jarBody._completing) return;            // ignore re-entry while animating
        jarBody._completing = true;
        if (jarBody._raf) { cancelAnimationFrame(jarBody._raf); jarBody._raf = null; }

        const fill = document.createElement('div');
        fill.className = 'jar-fill';
        fill.style.background = color;
        jarBody.appendChild(fill);

        const label = document.createElement('div');
        label.className = 'jar-complete-text';
        label.textContent = 'Jar Complete!';
        jarBody.appendChild(label);

        requestAnimationFrame(() => { fill.classList.add('full'); label.classList.add('show'); });
        this.confettiBurst(jar, color);

        setTimeout(() => {
            label.classList.remove('show');
            fill.classList.remove('full');          // height -> 0, draining top-to-bottom
            jarBody.querySelectorAll('.jar-ball').forEach(b => {
                b.style.transition = 'opacity 0.4s ease';
                b.style.opacity = '0';
            });
            setTimeout(() => {
                jarBody.querySelectorAll('.jar-ball').forEach(b => b.remove());
                fill.remove();
                label.remove();
                jarBody._completing = false;
            }, 650);
        }, JAR_HOLD);
    }

    // A small confetti burst from the centre of the jar.
    confettiBurst(jar, color) {
        const rect = jar.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const colors = [color, '#ffd34d', '#4dd2ff', '#ff6b6b', '#7cfc9b'];
        for (let i = 0; i < 24; i++) {
            const p = document.createElement('div');
            p.className = 'confetti';
            p.style.background = colors[i % colors.length];
            document.body.appendChild(p);

            const ang = Math.random() * Math.PI * 2;
            const speed = 120 + Math.random() * 180;
            let vx = Math.cos(ang) * speed;
            let vy = Math.sin(ang) * speed - 140;   // bias the burst upward
            let x = cx, y = cy, t = 0, last = performance.now();
            const tick = (now) => {
                const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
                vy += 700 * dt;
                x += vx * dt; y += vy * dt;
                p.style.left = (x - 4) + 'px';
                p.style.top  = (y - 4) + 'px';
                p.style.transform = `rotate(${t * 540}deg)`;
                p.style.opacity = String(Math.max(0, 1 - t / 1.2));
                if (t >= 1.2) { p.remove(); return; }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
    }

    makeJarBall(jarBody, color, x, y) {
        const el = document.createElement('div');
        el.className = 'jar-ball';
        el.style.background = color;
        jarBody.appendChild(el);
        const b = { el, r: JAR_BALL_R, half: JAR_BALL_HALF, wallR: JAR_WALL_R, x, y, vx: 0, vy: 0 };
        this.placeBall(b);
        return b;
    }

    // Fade out the most recent jar ball, then let the rest resettle.
    removeJarBall(btn) {
        const jar = this.jars[+btn.dataset.jarIndex];
        const jarBody = jar && jar.querySelector('.tp-jar-body');
        if (!jarBody) return;
        if (jarBody._raf) { cancelAnimationFrame(jarBody._raf); jarBody._raf = null; }

        const balls = Array.from(jarBody.querySelectorAll('.jar-ball'));
        const gone = balls.pop();
        if (!gone) return;

        gone.style.transition = 'opacity 0.3s ease';
        gone.style.opacity = '0';
        setTimeout(() => gone.remove(), 300);

        // Settle the survivors into the gap (skip the fading one).
        const pile = this.readJarBalls(jarBody).filter(b => b.el !== gone);
        if (pile.length) {
            this.simulateBox(jarBody, pile, jarBody.clientWidth, jarBody.clientHeight);
        }
    }

    // Load-in animation: instead of placing balls instantly, drop them all into
    // place after a delay. Day-box balls spawn from their usual point (staggered
    // so they don't overlap); jar balls fall from the top of the screen.
    dropInBalls() {
        this.loadTimers = this.loadTimers || [];
        const card = this.cards[this.selectedMonth];
        if (card) {
            card.querySelectorAll('.cell:not(.other)').forEach(cell => {
                const dayNum  = parseInt(cell.querySelector('.num').textContent);
                const dateStr = this.dateKey(dayNum, this.selectedMonth, this.selectedYear);
                const dayData = this.completions[dateStr];
                if (!dayData) return;
                const dayBox = cell.querySelector('.day-box');

                let k = 0;
                Object.entries(dayData).forEach(([taskName, count]) => {
                    const task = this.tasks.find(t => t.name === taskName);
                    if (!task || !count) return;
                    for (let i = 0; i < count; i++) {
                        this.loadTimers.push(setTimeout(
                            () => this.spawnAndSimulate(dayBox, taskName, task.color, task.type),
                            (k++) * PHYSICS.LOAD_STAGGER));
                    }
                });
            });
        }

        this.tasks.forEach((task, ti) => {
            const total = this.taskTotal(task.name);
            const load = total % JAR_CAP;   // a completed jar resets, so only show the remainder
            if (!load) return;
            const jarBody = this.jars[ti]?.querySelector('.tp-jar-body');
            if (!jarBody) return;
            for (let k = 0; k < load; k++) {
                this.loadTimers.push(setTimeout(
                    () => this.dropFromTop(jarBody, task.color), k * PHYSICS.LOAD_STAGGER));
            }
        });
    }

    /* ── "View Jars" shelf page ── */

    // Show the shelves view, then build it on the next frame so jar bodies have
    // real layout dimensions (settleBox reads clientWidth/clientHeight).
    openJarsView() {
        this.stopBallSpawn();              // halt any in-progress load-in drop
        document.body.classList.add('shelf-open');   // fade out everything but the shelf
        this.jarsView.classList.add('open');
        setTimeout(() => this.buildShelves(), 0);
    }

    // Return to the calendar: fade the main page back in and replay the drop-in.
    closeJarsView() {
        this.jarsView.classList.remove('open');
        document.body.classList.remove('shelf-open');
        this.dropInBalls();
    }

    // Cancel pending load-in timers, stop running pile simulations, and clear
    // every ball so dropInBalls can replay from a clean slate.
    stopBallSpawn() {
        (this.loadTimers || []).forEach(clearTimeout);
        this.loadTimers = [];
        document.querySelectorAll('.flight-ball').forEach(b => b.remove());
        document.querySelectorAll('.day-box, .tp-jar-body').forEach(box => {
            if (box._raf) { cancelAnimationFrame(box._raf); box._raf = null; }
        });
        document.querySelectorAll('.ball, .jar-ball').forEach(b => b.remove());
    }

    // Total completions ever logged for a task, across all days.
    taskTotal(name) {
        return Object.values(this.completions)
            .reduce((sum, day) => sum + (day[name] || 0), 0);
    }

    // 6 shelves (2x3). Each task gets one filled jar per completed JAR_CAP plus
    // one current jar holding the remainder. Shelves past the task count stay bare.
    buildShelves() {
        this.shelvesGrid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const shelf = document.createElement('div');
            shelf.className = 'shelf';

            const jarsRow = document.createElement('div');
            jarsRow.className = 'shelf-jars';
            const plank = document.createElement('div');
            plank.className = 'shelf-plank';
            shelf.append(jarsRow, plank);

            const task = this.tasks[i];
            if (task) {
                const total = this.taskTotal(task.name);
                const counts = [];
                for (let f = 0; f < Math.floor(total / JAR_CAP); f++) counts.push(JAR_CAP);
                counts.push(total % JAR_CAP);   // current jar (may be 0 = empty)
                // ponytail: settleBox is O(n²)·iters per jar; fine for realistic
                // completion counts. Cap jar count if a task ever racks up hundreds.
                counts.forEach(n => jarsRow.appendChild(this.makeShelfJar(task.color, n)));

                const label = document.createElement('div');
                label.className = 'shelf-label';
                label.textContent = `${task.name}: ${total}`;
                shelf.appendChild(label);
            }
            this.shelvesGrid.appendChild(shelf);
        }
    }

    // One jar with n settled balls, reusing the main-page jar markup, styling
    // and physics so it looks identical.
    makeShelfJar(color, n) {
        const jar = document.createElement('div');
        jar.className = 'tp-jar shelf-jar' + (n > 0 ? ' filled' : '');
        jar.innerHTML = '<span class="tp-jar-lid"></span><span class="tp-jar-body"></span>';
        const body = jar.querySelector('.tp-jar-body');
        if (n >= JAR_CAP) {
            // Completed jar: solid task-color fill, no individual balls.
            jar.classList.add('complete');
            body.style.background = color;
            return jar;
        }
        if (n > 0) {
            // Static packed rows from the bottom up — physics settling 50 balls
            // synchronously freezes the renderer, and a neat pile reads as "full".
            const w = body.clientWidth || 128, h = body.clientHeight || 156;
            const d = JAR_BALL_HALF * 2;                 // ball diameter
            const wall = JAR_BALL_HALF * 0.6;           // inset so balls sit clear of the jar walls
            const usable = w - 2 * wall;
            const cols = Math.max(1, Math.round(usable / d));
            const step = usable / cols;
            for (let k = 0; k < n; k++) {
                const row = Math.floor(k / cols), col = k % cols;
                const offset = (row % 2) ? step / 2 : 0;  // hex-ish stagger
                let x = wall + col * step + step / 2 + offset;
                if (x > w - wall) x -= step;              // wrap the staggered overflow
                const y = h - JAR_BALL_HALF - row * (d - 2);
                this.makeJarBall(body, color, x, y);
            }
        }
        return jar;
    }

    // One jar ball falling straight down from the top of the screen into the jar
    // opening (zero horizontal velocity, small random x), then it joins the pile.
    dropFromTop(jarBody, color) {
        const g  = PHYSICS.G;
        const jb = jarBody.getBoundingClientRect();
        const xt = jb.left + jb.width / 2 + (Math.random() * 2 - 1) * 15;
        const yt = jb.top + 11;

        const ball = document.createElement('div');
        ball.className = 'flight-ball';
        ball.style.background = color;
        document.body.appendChild(ball);

        let last = performance.now(), y = 0, vy = 0;
        const tick = (now) => {
            let dt = (now - last) / 1000; last = now;
            if (dt > 0.05) dt = 0.05;
            vy += g * dt;
            y  += vy * dt;
            if (y >= yt) {
                ball.remove();
                this.dropIntoJar(jarBody, color, xt, yt, 0);
                return;
            }
            ball.style.left = (xt - 10) + 'px';
            ball.style.top  = (y - 10) + 'px';
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    readJarBalls(jarBody) {
        return Array.from(jarBody.querySelectorAll('.jar-ball')).map(el => ({
            el, r: JAR_BALL_R, half: JAR_BALL_HALF, wallR: JAR_WALL_R,
            x: el.offsetLeft + JAR_BALL_HALF, y: el.offsetTop + JAR_BALL_HALF, vx: 0, vy: 0,
        }));
    }


    /* ── Task click / undo ── */

    handleTaskClick(task, btn) {
        if (!this.selectedCell || !this.selectedDateStr) return;
        if (task.type === 'Completion' && btn.classList.contains('done')) return;

        const dateStr = this.selectedDateStr;
        const dayBox  = this.selectedCell.querySelector('.day-box');

        if (!this.completions[dateStr]) this.completions[dateStr] = {};
        this.completions[dateStr][task.name] = (this.completions[dateStr][task.name] || 0) + 1;

        const fresh = this.spawnAndSimulate(dayBox, task.name, task.color, task.type);
        btn.classList.add('has-balls');
        this.launchBallToJar(task, btn);

        if (task.type === 'Repeated') {
            const countEl = btn.querySelector('.dp-task-count');
            if (countEl) countEl.textContent = this.completions[dateStr][task.name];
        }

        if (task.type === 'Completion') {
            btn.classList.add('done');
            // Fade the task name out immediately, then fade the checkmark in.
            const label = btn.querySelector('.dp-task-label');
            label.style.opacity = '0';
            setTimeout(() => {
                if (!btn.classList.contains('done')) return;  // undone meanwhile
                label.textContent = '✓';
                requestAnimationFrame(() => { label.style.opacity = ''; });
            }, 500);
        }

        fetch('/api/completions/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, taskName: task.name }),
        }).catch(() => {
            // Rollback on network failure
            this.completions[dateStr][task.name]--;
            fresh.el.remove();
            const remaining = this.completions[dateStr]?.[task.name] || 0;
            btn.classList.toggle('has-balls', remaining > 0);
            if (task.type === 'Completion') {
                btn.classList.remove('done');
                btn.querySelector('.dp-task-label').textContent = task.name;
            } else {
                const countEl = btn.querySelector('.dp-task-count');
                if (countEl) countEl.textContent = remaining > 0 ? remaining : '';
            }
        });
    }

    handleUndo(task, btn) {
        if (!this.selectedCell || !this.selectedDateStr) return;
        const dateStr = this.selectedDateStr;
        const count = this.completions[dateStr]?.[task.name];
        if (!count) return;

        const dayBox = this.selectedCell.querySelector('.day-box');
        this.completions[dateStr][task.name]--;

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

        // Fade away one ball from the matching jar.
        this.removeJarBall(btn);

        if (this.completions[dateStr][task.name] <= 0) {
            delete this.completions[dateStr][task.name];
            if (!Object.keys(this.completions[dateStr]).length) {
                delete this.completions[dateStr];
            }
        }

        const remaining = this.completions[dateStr]?.[task.name] || 0;
        btn.classList.toggle('has-balls', remaining > 0);

        if (task.type === 'Completion') {
            btn.classList.remove('done');
            btn.querySelector('.dp-task-label').textContent = task.name;
            const btnBall = btn.querySelector('.dp-task-btn-ball');
            if (btnBall) btnBall.style.display = '';   // task open again -> ball returns
        } else {
            const countEl = btn.querySelector('.dp-task-count');
            if (countEl) countEl.textContent = remaining > 0 ? remaining : '';
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
            const btnBall  = btn.querySelector('.dp-task-btn-ball');
            const count    = dayData[taskName] || 0;

            btn.classList.toggle('has-balls', count > 0);

            if (taskType === 'Completion') {
                const done = count >= 1;
                btn.classList.toggle('done', done);
                if (label) label.textContent = done ? '✓' : taskName;
                // Already completed for this day -> no ball on the button.
                if (btnBall) btnBall.style.display = done ? 'none' : '';
            } else {
                const countEl = btn.querySelector('.dp-task-count');
                if (countEl) countEl.textContent = count > 0 ? count : '';
            }
        });
    }

    /* ── Ball rendering ── */

    renderBallsForYear(year) {
        for (let m = 0; m < 12; m++) this.renderBallsForMonth(m, year);
    }

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
            Object.entries(dayData).forEach(([taskName, count]) => {
                const task = this.tasks.find(t => t.name === taskName);
                if (!task || !count) return;
                for (let i = 0; i < count; i++) {
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
            this.renderBallsForYear(this.selectedYear);
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
        this.selectedDateStr = null;
        this.appWrapper.classList.remove('day-selected');
        this.renderBallsForMonth(m, this.selectedYear);
    }

    changeYear(delta) {
        this.selectedYear += delta;
        this.buildGrids(this.selectedYear);
        if (this.mode === 'year') this.renderBallsForYear(this.selectedYear);
        else                      this.renderBallsForMonth(this.selectedMonth, this.selectedYear);
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

        this.selectedDateStr = this.dateKey(day, m, year);
        this.updateButtonStates(this.selectedDateStr);
    }
}

document.addEventListener('DOMContentLoaded', () => new Calendar());
