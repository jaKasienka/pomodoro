const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'tasks.db');

let db = null;

function persist() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function formatTask(row) {
  return {
    id: row[0],
    text: row[1],
    completed: Boolean(row[2]),
    createdAt: row[3],
  };
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(formatTask(stmt.get()));
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = formatTask(stmt.get());
  }
  stmt.free();
  return row;
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
  const result = db.exec('SELECT last_insert_rowid() AS id, changes() AS changes');
  const idRow = result[0]?.values[0];
  return {
    lastInsertRowid: idRow ? idRow[0] : 0,
    changes: idRow ? idRow[1] : 0,
  };
}

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  persist();
}

module.exports = {
  init,

  getAllTasks: () =>
    queryAll(`
      SELECT id, text, completed, created_at
      FROM tasks
      ORDER BY completed ASC, created_at DESC
    `),

  getTaskById: (id) =>
    queryOne('SELECT id, text, completed, created_at FROM tasks WHERE id = ?', [id]),

  createTask: (text) => {
    const result = run('INSERT INTO tasks (text) VALUES (?)', [text.trim()]);
    return module.exports.getTaskById(result.lastInsertRowid);
  },

  toggleTask: (id) => {
    const task = module.exports.getTaskById(id);
    if (!task) return null;
    const newCompleted = task.completed ? 0 : 1;
    run('UPDATE tasks SET completed = ? WHERE id = ?', [newCompleted, id]);
    return module.exports.getTaskById(id);
  },

  deleteTask: (id) => {
    const result = run('DELETE FROM tasks WHERE id = ?', [id]);
    return result.changes > 0;
  },
};
