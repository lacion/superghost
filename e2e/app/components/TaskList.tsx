import { useState, useEffect } from "react";
import type { Task } from "../db.ts";

const STATUS_LABELS: Record<string, string> = {
  "": "All",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("");

  const fetchTasks = async (status?: string) => {
    const url = status ? `/api/tasks?status=${status}` : "/api/tasks";
    const res = await fetch(url);
    const data = await res.json();
    setTasks(data);
  };

  useEffect(() => {
    fetchTasks(filter || undefined);
  }, [filter]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div>
      <h1>Tasks</h1>

      <div className="filter-bar">
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <button className="primary" onClick={() => (window.location.hash = "#/new")}>
          New Task
        </button>
      </div>

      <div className="card">
        {tasks.length === 0 ? (
          <p>No tasks found.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="task-row">
              <div>
                <a className="task-title" href={`#/task/${task.id}`}>
                  {task.title}
                </a>
                <span className={`badge badge-${task.status}`} style={{ marginLeft: "0.5rem" }}>
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
                <span className={`badge badge-${task.priority}`} style={{ marginLeft: "0.25rem" }}>
                  {task.priority}
                </span>
              </div>
              <div className="actions">
                <button onClick={() => (window.location.hash = `#/edit/${task.id}`)}>
                  Edit
                </button>
                <button className="danger" onClick={() => handleDelete(task.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
