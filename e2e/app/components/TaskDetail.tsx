import { useState, useEffect, useCallback } from "react";
import type { Task } from "../db.ts";

interface TaskDetailProps {
  taskId: string;
}

export function TaskDetail({ taskId }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    setTask(await res.json());
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleStatusChange = async (newStatus: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setTask(await res.json());
  };

  const handleDelete = async () => {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    window.location.hash = "#/";
  };

  if (notFound) {
    return (
      <div>
        <h1>Task Not Found</h1>
        <a href="#/">Back to tasks</a>
      </div>
    );
  }

  if (!task) return <p>Loading...</p>;

  return (
    <div>
      <h1>{task.title}</h1>

      <div className="card">
        <dl>
          <div className="detail-field">
            <dt>Description</dt>
            <dd>{task.description || "No description"}</dd>
          </div>

          <div className="detail-field">
            <dt><label htmlFor="status-select">Status</label></dt>
            <dd>
              <select
                id="status-select"
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </dd>
          </div>

          <div className="detail-field">
            <dt>Priority</dt>
            <dd>
              <span className={`badge badge-${task.priority}`}>{task.priority}</span>
            </dd>
          </div>

          <div className="detail-field">
            <dt>Created</dt>
            <dd>{task.created_at}</dd>
          </div>

          <div className="detail-field">
            <dt>Updated</dt>
            <dd>{task.updated_at}</dd>
          </div>
        </dl>

        <div className="actions" style={{ marginTop: "1rem" }}>
          <button onClick={() => (window.location.hash = `#/edit/${task.id}`)}>
            Edit
          </button>
          <button className="danger" onClick={handleDelete}>
            Delete
          </button>
          <button onClick={() => (window.location.hash = "#/")}>
            Back to tasks
          </button>
        </div>
      </div>
    </div>
  );
}
