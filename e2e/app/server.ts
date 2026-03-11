import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  authenticate,
} from "./db.ts";
import homepage from "./index.html";

const port = Number(Bun.env.PORT) || 3777;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port,
  routes: {
    "/": homepage,
    "/api/health": {
      GET: () => json({ status: "ok" }),
    },
    "/api/login": {
      POST: async (req) => {
        const body = await req.json();
        const result = authenticate(body.username, body.password);
        if (!result) return json({ error: "Invalid credentials" }, 401);
        return json(result);
      },
    },
    "/api/tasks": {
      GET: (req) => {
        const url = new URL(req.url);
        const status = url.searchParams.get("status") ?? undefined;
        return json(listTasks(status));
      },
      POST: async (req) => {
        const body = await req.json();
        if (!body.title) return json({ error: "title is required" }, 400);
        return json(createTask(body), 201);
      },
    },
    "/api/tasks/:id": {
      GET: (req) => {
        const task = getTask(Number(req.params.id));
        if (!task) return json({ error: "Task not found" }, 404);
        return json(task);
      },
      PUT: async (req) => {
        const body = await req.json();
        const task = updateTask(Number(req.params.id), body);
        if (!task) return json({ error: "Task not found" }, 404);
        return json(task);
      },
      DELETE: (req) => {
        const deleted = deleteTask(Number(req.params.id));
        if (!deleted) return json({ error: "Task not found" }, 404);
        return json({ deleted: true });
      },
    },
  },
  fetch() {
    return json({ error: "Not found" }, 404);
  },
});

console.log(`Task Manager running at http://localhost:${port}`);
