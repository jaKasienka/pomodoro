const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'lib')));

app.get('/api/tasks', (_req, res) => {
  res.json(db.getAllTasks());
});

app.post('/api/tasks', (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Task text is required.' });
  }

  const task = db.createTask(text);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task id.' });
  }

  const task = db.toggleTask(id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task id.' });
  }

  const deleted = db.deleteTask(id);

  if (!deleted) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.status(204).send();
});

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Task manager running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
