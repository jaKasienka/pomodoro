# Pomodoro Timer 🍅

A focused time-management extension designed to complement standard To-Do workflows, helping strike a natural rhythm between focused deep work and timed recovery breaks.

---
<img width="1503" height="726" alt="Pomodoro2" src="https://github.com/user-attachments/assets/fe31ccd2-72d9-4b8f-8574-769a57a96f77" />

---

## ⚡ Quickstart

### Prerequisites
* Node.js (v18 or higher)
* npm / pnpm / yarn

### Local Setup

```bash
# Clone the repository
git clone [https://github.com/jaKasienka/pomodoro.git](https://github.com/jaKasienka/pomodoro.git)

# Navigate into project directory
cd pomodoro

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ✨ Features

- **Task-driven scheduling** — planned focus time rolls up into a full-day Pomodoro schedule (focus + breaks)
- **Multi-pomodoro sessions** — 25 min focus / 5 min break, with a long break after every 4th pomodoro
- **Configurable long breaks** — choose 15, 20, or 30 minutes before starting
- **Session overview** — outer ring and session timer when the planned day exceeds 30 minutes
- **Task manager** — add, reorder, complete, and edit per-task focus minutes (with quick-add presets)
- **Mini pop-out timer** — optional Document Picture-in-Picture window while you focus
- **Ambient rain** — optional background rain effect with volume control (pauses on breaks)
- **OS notifications** — alerts when focus/break segments start and when the day plan completes
- **Completion UX** — confetti, rich status copy, and a clear reset flow
- **Tested timer logic** — schedule and segment rules covered by `npm test`

---

## 👀 For reviewers

This build runs real Pomodoro timings (25 min focus, 5 min break, configurable long break).

If you want a **quick walkthrough** without waiting for full intervals, enable demo mode:

1. Open `public/js/timerLogic.mjs`
2. Set `TEST_MODE` to `true` (maps minutes to seconds: 25 → 25s, 5 → 5s, etc.)
3. Restart the dev server and refresh the page
4. Set `TEST_MODE` back to `false` before deploying or demoing production timing

```js
export const TEST_MODE = true; // quick demo: 25 min focus → 25 seconds
```

### Suggested smoke test

1. Add a task (or use a quick-add chip) and note the planned schedule update
2. Choose a long break length (15 / 20 / 30 min) and start the timer
3. Optional: allow the mini pop-out window, toggle rain, and run through a break
4. Run unit tests: `npm test`

---
