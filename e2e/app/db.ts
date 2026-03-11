import { Database } from "bun:sqlite";

const db = new Database(":memory:");

// Create tables
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed data
db.exec(`
  INSERT INTO users (username, password) VALUES ('demo', 'password');

  INSERT INTO tasks (title, description, status, priority) VALUES
    ('Set up project', 'Initialize the repository and install dependencies', 'done', 'high'),
    ('Write documentation', 'Create user guide and API reference', 'in_progress', 'medium'),
    ('Add unit tests', 'Write tests for all core modules', 'todo', 'high');
`);

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
}

// Prepared statements — compiled once, reused on every call
const stmtListAll = db.query("SELECT * FROM tasks ORDER BY id");
const stmtListByStatus = db.query("SELECT * FROM tasks WHERE status = ? ORDER BY id");
const stmtGetTask = db.query("SELECT * FROM tasks WHERE id = ?");
const stmtCreateTask = db.query(
  "INSERT INTO tasks (title, description, priority) VALUES (?, ?, ?) RETURNING *",
);
const stmtUpdateTask = db.query(
  "UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, updated_at = datetime('now') WHERE id = ? RETURNING *",
);
const stmtDeleteTask = db.query("DELETE FROM tasks WHERE id = ?");
const stmtAuthenticate = db.query("SELECT username FROM users WHERE username = ? AND password = ?");

export function listTasks(status?: TaskStatus): Task[] {
  if (status) {
    return stmtListByStatus.all(status) as Task[];
  }
  return stmtListAll.all() as Task[];
}

export function getTask(id: number): Task | null {
  return stmtGetTask.get(id) as Task | null;
}

export function createTask(data: {
  title: string;
  description?: string;
  priority?: TaskPriority;
}): Task {
  return stmtCreateTask.get(data.title, data.description ?? "", data.priority ?? "medium") as Task;
}

export function updateTask(
  id: number,
  data: Partial<{ title: string; description: string; status: TaskStatus; priority: TaskPriority }>,
): Task | null {
  const existing = getTask(id);
  if (!existing) return null;

  const title = data.title ?? existing.title;
  const description = data.description ?? existing.description;
  const status = data.status ?? existing.status;
  const priority = data.priority ?? existing.priority;

  return stmtUpdateTask.get(title, description, status, priority, id) as Task;
}

export function deleteTask(id: number): boolean {
  const result = stmtDeleteTask.run(id);
  return result.changes > 0;
}

export function authenticate(
  username: string,
  password: string,
): { token: string; username: string } | null {
  const user = stmtAuthenticate.get(username, password) as { username: string } | null;
  if (!user) return null;

  // Simple token for demo purposes — not production auth
  const token = btoa(`${user.username}:${Date.now()}`);
  return { token, username: user.username };
}
