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

function updateDisplay(seconds) {
  timerDisplay.textContent = formatTime(seconds);
  setRingProgress(seconds, totalDuration);
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
    const estimatedPoms = task.estimatedPoms == null
      ? 1
      : Number.isInteger(task.estimatedPoms) && task.estimatedPoms >= 0
        ? task.estimatedPoms
        : 1;
    const completed = Boolean(task.completed);

    return {
      ...task,
      estimatedPoms,
      completed,
      completedPoms: completed ? (Number.isInteger(task.completedPoms) ? task.completedPoms : estimatedPoms) : 0,
    };
  });

  /**
   * Calculates total schedule block time
   * 1 Pomodoro = 30 min (25m work + 5m break)
   */
  function getTaskDurationString(poms) {
    if (!poms || poms === 0) return 'Standby';

    const totalMinutes = poms * 30;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h${mins > 0 ? ' ' + mins + 'm' : ''}`;
    }
    return `${mins}m`;
  }

  function saveAndRender() {
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
    renderTasks();
    updateTaskSummary();
  }

  function updateTaskSummary() {
    const activeTasks = tasks.filter(t => !t.completed);
    const remainingPoms = activeTasks.reduce((sum, t) => sum + (t.estimatedPoms || 0), 0);
    const totalRealMinutes = remainingPoms * 30;
    const hours = Math.floor(totalRealMinutes / 60);
    const mins = totalRealMinutes % 60;

    let timeString = '';
    if (hours > 0 && mins > 0) {
      timeString = `${hours}h ${mins}m`;
    } else if (hours > 0) {
      timeString = `${hours}h`;
    } else {
      timeString = `${mins}m`;
    }

    const summaryEl = document.getElementById('timeRemainingText');
    if (summaryEl) {
      summaryEl.textContent = remainingPoms > 0
        ? `${timeString} of your day`
        : '0m planned (All clear! ☕)';
    }

    const totalCompletedPoms = tasks.reduce((sum, t) => sum + (t.completed ? (t.estimatedPoms || 0) : 0), 0);
    const totalAllPoms = tasks.reduce((sum, t) => sum + (t.estimatedPoms || 0), 0);
    const progressBar = document.getElementById('taskProgressBar');
    if (progressBar) {
      const percentage = totalAllPoms > 0 ? (totalCompletedPoms / totalAllPoms) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }
  }

  function renderTaskItem(task) {
    // ⚡ Crucial Fix: '?? 1' keeps 0 as 0, but defaults missing values to 1
    const poms = task.estimatedPoms ?? 1;
    const isStandby = poms === 0;

    return `
      <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
      <input type="checkbox" class="task-item__checkbox" ${task.completed ? 'checked' : ''} />
      <div class="task-item__details">
        <span class="task-item__text">${escapeHTML(task.text)}</span>
        <span class="task-item__time-tag ${isStandby ? 'muted' : ''}">
          ⏱️ ${getTaskDurationString(poms)} ${poms > 0 ? `(${poms} × 30m block)` : ''}
        </span>
      </div>
      <div class="task-item__pom-counter">
        <button type="button" class="pom-btn pom-btn--minus" title="Decrease estimate" ${poms === 0 ? 'disabled' : ''}>-</button>
        <span class="pom-count ${isStandby ? 'zero' : ''}">${poms} 🍅</span>
        <button type="button" class="pom-btn pom-btn--plus" title="Increase estimate">+</button>
      </div>
      <button class="btn btn--danger task-item__delete-btn">🗑️</button>
    `;
  }

  function renderTasks() {
    taskListEl.innerHTML = '';

    tasks.forEach((task) => {
      const poms = task.estimatedPoms ?? 1;
      const isStandby = poms === 0;
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
        estimatedPoms: 1,
        completedPoms: 0,
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
        estimatedPoms: 1,
        completedPoms: 0,
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

      if (e.target.classList.contains('pom-btn--plus')) {
        e.stopPropagation();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.estimatedPoms = (task.estimatedPoms || 0) + 1;
          saveAndRender();
        }
        return;
      }

      if (e.target.classList.contains('pom-btn--minus')) {
        e.stopPropagation();
        const task = tasks.find(t => t.id === taskId);
        if (task && (task.estimatedPoms || 0) > 0) {
          task.estimatedPoms -= 1;
          saveAndRender();
        }
        return;
      }

      if (e.target.classList.contains('task-item__checkbox')) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.completed = e.target.checked;
          task.completedPoms = task.completed ? task.estimatedPoms : 0;
          saveAndRender();
        }
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
  updateTaskSummary();
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
