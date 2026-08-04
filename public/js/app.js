const POMODORO_SECONDS = 25 * 60;

const timerDisplay = document.getElementById('timerDisplay');
const progressCircle = document.getElementById('progressCircle');
const timerContainer = document.querySelector('.timer-container');
const completionBanner = document.getElementById('completionBanner');
const timerStart = document.getElementById('timer-start');
const timerPause = document.getElementById('timer-pause');
const timerReset = document.getElementById('timer-reset');
const timerStatus = document.getElementById('timer-status');

const taskForm = document.getElementById('task-form');
const tomatoFillLevel = document.getElementById('tomatoFillLevel');

const TOTAL_FOCUS_SECONDS = POMODORO_SECONDS;
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');

let totalDuration = POMODORO_SECONDS;
let timeRemaining = totalDuration;
let timerInterval = null;
let isRunning = false;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Updates just ONE task row and total schedule instantly
function updateSingleTaskUI(task, taskItemElement) {
  const mins = task.plannedMinutes ?? 25;
  const isStandby = mins === 0;

  // 1. Toggle Standby / Active classes instantly
  taskItemElement.classList.toggle('task-item--standby', isStandby);

  // 2. Update the time text under the task name immediately
  const timeTag = taskItemElement.querySelector('.task-item__time-tag');
  if (timeTag) {
    if (isStandby) {
      timeTag.textContent = '⏱️ Standby (0m)';
      timeTag.classList.add('muted');
    } else {
      timeTag.textContent = `⏱️ ${mins}m focus block`;
      timeTag.classList.remove('muted');
    }
  }

  // 3. Save to localStorage immediately
  localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));

  // 4. Recalculate total schedule and check if Long Break unlocks
  updateOverallScheduleSummary();
  if (typeof checkLongBreakUnlockStatus === 'function') {
    checkLongBreakUnlockStatus();
  }
}

function updateDisplay(seconds) {
  timerDisplay.textContent = formatTime(seconds);
  setRingProgress(seconds, totalDuration);
  updateTomatoVisualizer(seconds);
}

function updateTomatoVisualizer(secondsLeft) {
  if (!tomatoFillLevel) return;
  const fillRatio = 1 - (secondsLeft / TOTAL_FOCUS_SECONDS);
  const heightPercent = Math.max(0, Math.min(100, fillRatio * 100));
  tomatoFillLevel.style.height = `${heightPercent}%`;
}

function updateTimerUI() {
  updateDisplay(timeRemaining);
}

function setRingProgress(secondsLeft, totalSeconds) {
  if (!progressCircle) return;
  const progressRatio = secondsLeft / totalSeconds;
  const offset = CIRCUMFERENCE - (progressRatio * CIRCUMFERENCE);
  progressCircle.style.strokeDashoffset = offset;
}

function handleSessionComplete() {
  if (timerContainer) {
    timerContainer.classList.add('completed');
  }
  if (completionBanner) {
    completionBanner.classList.add('active');
  }

  if (document.documentElement.classList.contains('rain-mode')) {
    const rainBtn = document.getElementById('moodBtn');
    if (rainBtn) rainBtn.click();
  }
}

function triggerCompletion() {
  handleSessionComplete();
}

function setTimerControls() {
  timerStart.disabled = isRunning;
  timerPause.disabled = !isRunning;
}

function tick() {
  if (timeRemaining > 0) {
    timeRemaining -= 1;
    updateDisplay(timeRemaining);
    return;
  }

  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  timerStatus.textContent = 'Session complete! Take a break.';
  handleSessionComplete();
  playCompletionAlert();
}

function playCompletionAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio not available — visual alert is sufficient
  }
}

timerStart.addEventListener('click', () => {
  if (isRunning) return;
  isRunning = true;
  if (timerContainer) timerContainer.classList.remove('completed');
  if (completionBanner) completionBanner.classList.remove('active');
  setTimerControls();
  timerDisplay.classList.add('pomodoro__display--running');
  timerStatus.textContent = 'Focus session in progress...';
  timerInterval = setInterval(tick, 1000);
});

timerPause.addEventListener('click', () => {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  timerStatus.textContent = 'Paused';
});

timerReset.addEventListener('click', () => {
  resetTimer();
});

// Task State Management with LocalStorage
(function initTaskManager() {
  const taskFormEl = document.querySelector('.task-form');
  const taskInputEl = document.querySelector('.task-form__input');
  const taskListEl = document.querySelector('.task-list');

  // Load tasks from localStorage or default to empty array and normalize fields
  let tasks = (JSON.parse(localStorage.getItem('pomodoro_tasks')) || []).map((task) => {
    const plannedMinutes = Number.isFinite(task.plannedMinutes) && task.plannedMinutes >= 0
      ? task.plannedMinutes
      : (Number.isFinite(task.estimatedPoms) && task.estimatedPoms >= 0 ? task.estimatedPoms * 25 : 30);
    const completed = Boolean(task.completed);

    return {
      ...task,
      plannedMinutes,
      completed,
      completedMinutes: completed ? plannedMinutes : 0,
    };
  });

  function getTaskDurationString(minutes) {
    if (!minutes || minutes === 0) return 'Standby';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ' ' + mins + 'm' : ''}`;
    }
    return `${mins}m`;
  }

  function calculateDaySchedule(activeTasks, chosenLongBreakMins = 20) {
    const totalRawWorkMins = activeTasks.reduce((sum, task) => sum + (task.plannedMinutes || 0), 0);

    if (totalRawWorkMins === 0) {
      return { totalPoms: 0, totalScheduleMins: 0, display: '0m (Standby)', rawWorkMins: 0 };
    }

    const totalPoms = Math.ceil(totalRawWorkMins / 25);
    const fullSets = Math.floor(totalPoms / 4);
    const remainingPomsInSet = totalPoms % 4;
    const totalShortBreaks = totalPoms > 0 ? Math.max(0, (totalPoms - 1) - fullSets) : 0;
    const totalLongBreaks = fullSets;
    const focusTime = totalPoms * 25;
    const breakTime = (totalShortBreaks * 5) + (totalLongBreaks * chosenLongBreakMins);
    const totalScheduleMins = focusTime + breakTime;

    const hrs = Math.floor(totalScheduleMins / 60);
    const mins = totalScheduleMins % 60;
    const formattedSchedule = hrs > 0 ? `${hrs}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;

    return {
      rawWorkMins: totalRawWorkMins,
      totalPoms,
      fullSets,
      remainingPomsInSet,
      totalScheduleMins,
      formattedSchedule,
      needsBreakChoice: fullSets > 0,
    };
  }

  function saveAndRender() {
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
    renderTasks();
    updateOverallScheduleSummary();
  }

  function updateOverallScheduleSummary() {
    const activeTasks = tasks.filter(t => !t.completed);
    const schedule = calculateDaySchedule(activeTasks);
    const summaryEl = document.getElementById('timeRemainingText');

    if (summaryEl) {
      summaryEl.textContent = schedule.rawWorkMins > 0
        ? `${schedule.formattedSchedule} of your day`
        : '0m planned (All clear! ☕)';
    }

    const totalCompletedMinutes = tasks.reduce((sum, t) => sum + (t.completed ? (t.plannedMinutes || 0) : 0), 0);
    const totalAllMinutes = tasks.reduce((sum, t) => sum + (t.plannedMinutes || 0), 0);
    const progressBar = document.getElementById('taskProgressBar');
    if (progressBar) {
      const percentage = totalAllMinutes > 0 ? (totalCompletedMinutes / totalAllMinutes) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }
    // Keep long-break card state in sync
    try { checkLongBreakUnlockStatus(); } catch (e) { /* ignore if not ready */ }
  }

  function checkLongBreakUnlockStatus() {
    const cardEl = document.getElementById('longBreakCard');
    if (!cardEl) return;

    const totalRawWorkMins = tasks
      .filter(t => !t.completed && (t.plannedMinutes ?? 25) > 0)
      .reduce((sum, t) => sum + (t.plannedMinutes ?? 25), 0);

    const isEligibleForLongBreak = totalRawWorkMins > 100;

    if (isEligibleForLongBreak) {
      cardEl.classList.remove('locked');
      cardEl.classList.add('unlocked');
      // enable interactions
      const notches = document.querySelectorAll('.notch-label');
      notches.forEach(n => n.style.pointerEvents = 'auto');
    } else {
      cardEl.classList.add('locked');
      cardEl.classList.remove('unlocked');
      const notches = document.querySelectorAll('.notch-label');
      notches.forEach(n => n.style.pointerEvents = 'none');
    }
  }

  function setLongBreakMinutes(mins) {
    const v = Number(mins) || 20;
    localStorage.setItem('longBreakMinutes', String(v));
    const valueEl = document.getElementById('longBreakValue');
    if (valueEl) valueEl.textContent = String(v);
    const dialProgress = document.getElementById('dialProgress');
    if (dialProgress) {
      const total = parseFloat(dialProgress.getAttribute('stroke-dasharray')) || 314;
      let progressRatio = 1;

      if (v === 15) {
        progressRatio = 0.5;
      } else if (v === 20) {
        progressRatio = 0.5 + (1 / 3) * 0.5;
      } else if (v === 25) {
        progressRatio = 0.5 + (2 / 3) * 0.5;
      } else if (v === 30) {
        progressRatio = 1;
      } else {
        progressRatio = Math.max(0, Math.min(1, (v - 15) / 15));
      }

      const offset = total - (progressRatio * total);
      dialProgress.style.strokeDashoffset = offset;
    }
    // mark active notch
    document.querySelectorAll('.notch-label').forEach(n => {
      n.classList.toggle('active', Number(n.dataset.value) === v);
    });
  }

  function renderTaskItem(task) {
    const rawMins = Number.isFinite(task.plannedMinutes) ? task.plannedMinutes : 25;
    const isStandby = rawMins === 0;

    return `
      <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
      <input type="checkbox" class="task-item__checkbox" ${task.completed ? 'checked' : ''} />
      <div class="task-item__details">
        <span class="task-item__text">${escapeHTML(task.text)}</span>
        <span class="task-item__time-tag ${isStandby ? 'muted' : ''}">
          ⏱️ ${getTaskDurationString(rawMins)}${isStandby ? '' : ` (${rawMins}m)`}
        </span>
      </div>
      <div class="compact-time-pill">
        <input
          type="number"
          class="task-time-field"
          value="${rawMins}"
          min="0"
          max="480"
          step="5"
          data-id="${task.id}"
        />
        <span class="time-unit-label">m</span>
      </div>
      <button class="btn btn--danger task-item__delete-btn">🗑️</button>
    `;
  }

  function renderTasks() {
    taskListEl.innerHTML = '';

    tasks.forEach((task) => {
      const rawMins = Number.isFinite(task.plannedMinutes) ? task.plannedMinutes : 25;
      const isStandby = rawMins === 0;
      const li = document.createElement('li');
      li.className = `task-item ${task.completed ? 'task-item--completed' : ''} ${isStandby ? 'task-item--standby' : ''}`;
      li.dataset.id = task.id;
      li.draggable = true;
      li.innerHTML = renderTaskItem(task);
      taskListEl.appendChild(li);
    });

    if (emptyState) emptyState.style.display = tasks.length === 0 ? 'block' : 'none';
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  if (taskFormEl) {
    taskFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = taskInputEl.value.trim();
      if (!text) return;

      const newTask = {
        id: Date.now().toString(),
        text,
        plannedMinutes: 25,
        completedMinutes: 0,
        completed: false,
      };
      tasks.push(newTask);
      taskInputEl.value = '';
      saveAndRender();
    });
  }

  const presetsContainer = document.querySelector('.task-presets__chips');
  if (presetsContainer) {
    presetsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;

      const taskText = chip.dataset.task;
      if (!taskText) return;

      const exists = tasks.some(t => t.text.toLowerCase() === taskText.toLowerCase());
      if (exists) return;

      const newTask = {
        id: Date.now().toString(),
        text: taskText,
        plannedMinutes: 25,
        completedMinutes: 0,
        completed: false,
      };

      tasks.push(newTask);
      saveAndRender();
    });
  }

  if (taskListEl) {
    taskListEl.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      if (!taskItem) return;

      const taskId = taskItem.dataset.id;

      if (e.target.closest('.task-item__delete-btn')) {
        e.stopPropagation();

        // Add animation class first
        taskItem.classList.add('deleting');

        // Wait for the CSS transition (300ms) before updating state
        setTimeout(() => {
          tasks = tasks.filter(task => task.id !== taskId);
          saveAndRender();
        }, 300);

        return;
      }

      if (e.target.classList.contains('task-item__checkbox')) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.completed = e.target.checked;
          task.completedMinutes = task.completed ? task.plannedMinutes : 0;
          saveAndRender();
        }
      }
    });

    taskListEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('task-time-field')) return;

      const inputEl = e.target;
      const taskId = inputEl.dataset.id;
      let newMinutes = parseInt(inputEl.value, 10);

      if (isNaN(newMinutes) || newMinutes < 0) newMinutes = 0;
      if (newMinutes > 480) newMinutes = 480;
      newMinutes = Math.round(newMinutes / 5) * 5;

      const task = tasks.find(t => t.id === taskId);
      if (task) {
        task.plannedMinutes = newMinutes;
        
        // 1. Force the input box to instantly show the rounded value (e.g. 23 becomes 25)
        inputEl.value = newMinutes; 

        // 2. Find the exact list item (li) for this task row
        const liEl = inputEl.closest('.task-item');
        if (liEl) {
          // 3. Toggle the standby styling class instantly if minutes hit 0
          const isStandby = newMinutes === 0;
          liEl.classList.toggle('task-item--standby', isStandby);

          // 4. Update the visual text badge inside this row immediately
          const timeTagEl = liEl.querySelector('.task-item__time-tag');
          if (timeTagEl) {
            // Replicate your renderTaskItem logic here
            timeTagEl.className = `task-item__time-tag ${isStandby ? 'muted' : ''}`;
            timeTagEl.innerHTML = `⏱️ ${getTaskDurationString(newMinutes)}${isStandby ? '' : ` (${newMinutes}m)`}`;
          }
        }

        // 5. Save and update the totals
        localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
        updateOverallScheduleSummary();
      }
    });


    let draggedItem = null;

    taskListEl.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.task-item');
      if (!item) return;

      draggedItem = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    taskListEl.addEventListener('dragend', (e) => {
      const item = e.target.closest('.task-item');
      if (item) item.classList.remove('dragging');

      taskListEl.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
      draggedItem = null;
    });

    taskListEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const targetItem = e.target.closest('.task-item');
      if (!targetItem || targetItem === draggedItem) return;

      taskListEl.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
      targetItem.classList.add('drag-over');
    });

    taskListEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropTarget = e.target.closest('.task-item');
      if (!dropTarget || !draggedItem || dropTarget === draggedItem) return;

      const draggedId = draggedItem.dataset.id;
      const targetId = dropTarget.dataset.id;
      const fromIndex = tasks.findIndex(t => t.id === draggedId);
      const toIndex = tasks.findIndex(t => t.id === targetId);

      if (fromIndex !== -1 && toIndex !== -1) {
        const [movedTask] = tasks.splice(fromIndex, 1);
        tasks.splice(toIndex, 0, movedTask);
        saveAndRender();
      }
    });
  }

  // Initial render
  renderTasks();
  updateOverallScheduleSummary();

  // Initialize long break UI and wire notch interactions
  // const savedLongBreak = Number(localStorage.getItem('longBreakMinutes')) || 20;
  // safe-guard: define setLongBreakMinutes before call
  // try { setLongBreakMinutes(savedLongBreak); } catch (e) { /* ignore */ }

  // document.addEventListener('click', (e) => {
    // const notch = e.target.closest('.notch-label');
    // if (!notch) return;
    // const cardEl = document.getElementById('longBreakCard');
    // if (cardEl && cardEl.classList.contains('unlocked')) {
      // const v = Number(notch.dataset.value) || 20;
      // setLongBreakMinutes(v);
    // }
  // });

})();

const radius = progressCircle ? progressCircle.r.baseVal.value : 120;
const CIRCUMFERENCE = 2 * Math.PI * radius;

if (progressCircle) {
  progressCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  progressCircle.style.strokeDashoffset = 0;
}

function initRainyMode() {
  const canvas = document.getElementById('rainCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const toggleBtn = document.getElementById('moodBtn') || document.getElementById('rainToggleBtn');
  const btnText = toggleBtn ? toggleBtn.querySelector('.btn-text') : null;
  const audio = document.getElementById('rainAudio');
  const volumeSlider = document.getElementById('rainVolumeSlider');
  const volumeControl = document.getElementById('rainVolumeControl');

  if (!canvas || !ctx || !toggleBtn) return;

  let drops = [];
  let animationFrameId = null;
  let isRainActive = false;
  let fadeInterval = null;
  let targetVolume = volumeSlider ? parseFloat(volumeSlider.value) : 0.35;

  if (audio) {
    audio.volume = targetVolume;
  }

  function fadeAudio(direction) {
    if (!audio) return;

    clearInterval(fadeInterval);
    const step = 0.05;

    if (direction === 'in') {
      audio.volume = 0;
      audio.play().catch(() => {
        console.log('Audio play blocked until user gesture');
      });

      fadeInterval = setInterval(() => {
        if (audio.volume < targetVolume - step) {
          audio.volume += step;
        } else {
          audio.volume = targetVolume;
          clearInterval(fadeInterval);
        }
      }, 50);
    } else {
      fadeInterval = setInterval(() => {
        if (audio.volume > step) {
          audio.volume -= step;
        } else {
          audio.volume = 0;
          audio.pause();
          clearInterval(fadeInterval);
        }
      }, 50);
    }
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (event) => {
      targetVolume = parseFloat(event.target.value);
      if (audio) {
        audio.volume = targetVolume;
      }
    });
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createDrops() {
    drops = [];
    // Increase count slightly so we get sharp individual streaks
    const count = Math.floor(window.innerWidth / 8); 
    
    for (let i = 0; i < count; i++) {
      drops.push({
        x: Math.random() * (window.innerWidth + 200) - 100,
        y: Math.random() * window.innerHeight,
        length: Math.random() * 35 + 25,       // Longer, defined streaks (25-60px)
        speed: Math.random() * 14 + 18,        // Fast, crisp motion
        opacity: Math.random() * 0.4 + 0.6,    // ⚡ Higher opacity (0.6 - 1.0) = sharper!
        width: Math.random() * 0.8 + 0.8        // ⚡ Thinner, needle-sharp lines (0.8 - 1.6px)
      });
    }
  }

  function animate() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    drops.forEach((drop) => {
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.length * 0.15, drop.y + drop.length);

      ctx.strokeStyle = `rgba(125, 211, 252, ${drop.opacity})`;
      ctx.lineWidth = drop.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      drop.y += drop.speed;
      drop.x -= drop.speed * 0.15;

      if (drop.y > window.innerHeight) {
        drop.y = -drop.length;
        drop.x = Math.random() * (window.innerWidth + 200) - 50;
      }
    });

    if (isRainActive) {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  toggleBtn.addEventListener('click', () => {
    isRainActive = !isRainActive;
    document.documentElement.classList.toggle('rain-mode', isRainActive);

    if (isRainActive) {
      if (btnText) {
        btnText.textContent = 'Clear up';
      } else {
        toggleBtn.textContent = 'Clear up';
      }
      resizeCanvas();
      createDrops();
      animate();
      fadeAudio('in');
    } else {
      if (btnText) {
        btnText.textContent = 'Let it rain';
      } else {
        toggleBtn.textContent = 'Let it rain';
      }
      cancelAnimationFrame(animationFrameId);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      fadeAudio('out');
    }
  });

  window.addEventListener('resize', () => {
    if (isRainActive) {
      resizeCanvas();
      createDrops();
    }
  });
}

initRainyMode();

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timeRemaining = totalDuration;
  isRunning = false;
  updateDisplay(timeRemaining);
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  timerStatus.textContent = 'Ready to focus';
  if (timerContainer) timerContainer.classList.remove('completed');
  if (completionBanner) completionBanner.classList.remove('active');
}

updateTimerUI();
setTimerControls();
// Tasks are managed locally via localStorage; no server load needed
