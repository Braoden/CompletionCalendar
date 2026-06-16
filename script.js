class Calendar {
    constructor() {
        if (window.gsap && window.Flip) gsap.registerPlugin(Flip);

        this.today = new Date();
        this.currentMonth = this.today.getMonth();
        this.currentYear  = this.today.getFullYear();
        this.selectedMonth = this.currentMonth;
        this.selectedYear  = this.currentYear;
        this.mode = 'month';          // 'month' | 'year'
        this.cards = [];              // month index -> card element

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

        this.initElements();
        this.attachEventListeners();

        this.buildGrids(this.selectedYear);
        // Initial state: month view, no animation.
        this.cards[this.selectedMonth].classList.add('is-zoomed');
        this.updateTitles();

        // Restore any previously saved tasks from the backend.
        this.loadTasks();
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

        /* Task creation */
        this.addTaskBtn     = document.getElementById('addTaskBtn');
        this.modalOverlay   = document.getElementById('taskModalOverlay');
        this.taskForm       = document.getElementById('taskForm');
        this.taskCancelBtn  = document.getElementById('taskCancelBtn');
        this.taskNameInput  = document.getElementById('taskName');
        this.taskColorInput = document.getElementById('taskColor');
        this.taskColorPicker = document.getElementById('taskColorPicker');
        this.taskNameError  = document.getElementById('taskNameError');
        this.taskColorError = document.getElementById('taskColorError');
        this.taskTypeToggle = document.getElementById('taskTypeToggle');
        this.panelInner     = this.dayPanel.querySelector('.day-panel-inner');

        /* Jars: each one mirrors a task slot (empty until a task fills it). */
        this.jars = Array.from(document.querySelectorAll('.tp-jar'));
    }

    attachEventListeners() {
        this.prevBtn.addEventListener('click', () => this.previousMonth());
        this.nextBtn.addEventListener('click', () => this.nextMonth());
        this.yearChip.addEventListener('click', () => this.zoomToYear());

        this.prevYearBtn.addEventListener('click', () => this.changeYear(-1));
        this.nextYearBtn.addEventListener('click', () => this.changeYear(1));

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        /* ── Task creation ── */
        this.addTaskBtn.addEventListener('click', () => this.openTaskModal());
        this.taskCancelBtn.addEventListener('click', () => this.closeTaskModal());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this.closeTaskModal();
        });
        this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));

        // Keep the hex text field and the native color picker in sync.
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

        // Persist to the backend, then render on success.
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

            this.renderTaskButton(data.task);
            this.closeTaskModal();
        } catch {
            this.setFieldError(this.taskNameInput, this.taskNameError,
                'Could not reach the server');
        }
    }

    // Fetch saved tasks on startup and render them into the day panel.
    async loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            if (!res.ok) return;
            const { tasks } = await res.json();
            (tasks || []).forEach((task) => this.renderTaskButton(task));
        } catch {
            // Offline / static hosting: silently keep the blank slots.
        }
    }

    // Replace the topmost blank slot with a button for one task.
    renderTaskButton(task) {
        const blank = this.panelInner.querySelector('.dp-blank-btn');
        if (!blank) return;   // safety: no slot left

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dp-task-btn';
        btn.textContent = task.name;
        btn.style.background = task.color;
        btn.dataset.taskType = task.type;
        btn.title = `${task.name} · ${task.type}`;

        blank.replaceWith(btn);

        // Light up the matching jar with this task's color.
        this.fillJar(this.taskCount, task);

        this.taskCount++;

        // Animate the new button in: rise + scale with a subtle overshoot.
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

    // Connect a jar to a task: colour the lid, reveal the body. Empty jars
    // keep their default greyed-out lid and transparent body.
    fillJar(index, task) {
        const jar = this.jars[index];
        if (!jar) return;

        jar.style.setProperty('--task-color', task.color);
        jar.style.setProperty('--task-color-soft', this.hexToRgba(task.color, 0.18));
        jar.classList.add('filled');
        jar.title = `${task.name} · ${task.type}`;
    }

    // Convert a #rrggbb hex into an rgba() string with the given alpha.
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

    /* ── Build the 12 month cards for a given year ── */
    buildGrids(year) {
        this.months.innerHTML = '';
        this.cards = [];

        for (let m = 0; m < 12; m++) {
            this.months.appendChild(this.createCard(m, year));
        }
    }

    createCard(m, year) {
        const card = document.createElement('div');
        card.className = 'm-card';
        // Explicit placement so removing one from flow (when zoomed) never
        // reshuffles the others.
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

        // In year view, clicking a card zooms into that month.
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
            day === this.today.getDate() &&
            m === this.today.getMonth() &&
            year === this.today.getFullYear();
        if (isToday) cell.classList.add('today');

        if (!isOther) {
            cell.addEventListener('click', (e) => {
                if (this.mode !== 'month') return;
                e.stopPropagation();
                this.months.querySelectorAll('.cell.selected')
                    .forEach(c => c.classList.remove('selected'));
                cell.classList.add('selected');
                this.showDayPanel(day, m, year);
            });
        }

        return cell;
    }

    /* ── FLIP: animate one card between its mini slot and the full stage ── */
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
        card.getBoundingClientRect();   // force reflow so the start frame sticks

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

    /* ── Month navigation (within month view) ── */
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

    // Switch the enlarged month without a zoom animation — both occupy the
    // same full-stage rect, so it reads as a content change.
    swapZoomedMonth(m) {
        this.cards.forEach(c => c.classList.remove('is-zoomed'));
        this.selectedMonth = m;
        this.cards[m].classList.add('is-zoomed');
        this.updateTitles();
    }

    /* ── Year navigation (within year view) ── */
    changeYear(delta) {
        this.selectedYear += delta;
        this.buildGrids(this.selectedYear);
        // Stay in year view; freshly built cards have no zoomed card.
        this.updateTitles();
    }

    showDayPanel(day, m, year) {
        const date = new Date(year, m, day);
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        document.getElementById('dpWeekday').textContent = weekdays[date.getDay()];
        document.getElementById('dpNum').textContent = day;
        document.getElementById('dpMonth').textContent = this.monthNames[m];
        document.getElementById('dpYear').textContent = year;
        this.appWrapper.classList.add('day-selected');
        this.dayPanel.classList.remove('reveal');
        void this.dayPanel.offsetWidth;
        this.dayPanel.classList.add('reveal');
    }
}

document.addEventListener('DOMContentLoaded', () => new Calendar());
