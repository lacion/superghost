import { useState, useEffect } from "react";

interface TaskFormProps {
  taskId?: string;
}

export function TaskForm({ taskId }: TaskFormProps) {
  const isEdit = Boolean(taskId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (taskId) {
      fetch(`/api/tasks/${taskId}`)
        .then((res) => res.json())
        .then((task) => {
          setTitle(task.title);
          setDescription(task.description);
          setPriority(task.priority);
          setStatus(task.status);
        });
    }
  }, [taskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const body = isEdit
      ? { title, description, priority, status }
      : { title, description, priority };

    const url = isEdit ? `/api/tasks/${taskId}` : "/api/tasks";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const task = await res.json();
      setMessage({ type: "success", text: isEdit ? "Task updated!" : "Task created!" });
      if (!isEdit) {
        window.location.hash = `#/task/${task.id}`;
      }
    } else {
      const err = await res.json();
      setMessage({ type: "error", text: err.error || "Something went wrong" });
    }
  };

  return (
    <div>
      <h1>{isEdit ? "Edit Task" : "New Task"}</h1>

      {message && (
        <div className={`message message-${message.type}`}>{message.text}</div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {isEdit && (
          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        )}

        <button type="submit" className="primary">
          {isEdit ? "Update Task" : "Create Task"}
        </button>
      </form>
    </div>
  );
}
