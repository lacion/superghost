import { useState, useEffect } from "react";
import { Nav } from "./Nav.tsx";
import { TaskList } from "./TaskList.tsx";
import { TaskForm } from "./TaskForm.tsx";
import { TaskDetail } from "./TaskDetail.tsx";
import { LoginForm } from "./LoginForm.tsx";

function parseHash(): { page: string; id?: string } {
  const hash = window.location.hash.slice(1) || "/";
  if (hash === "/login") return { page: "login" };
  if (hash === "/new") return { page: "new" };
  const editMatch = hash.match(/^\/edit\/(\d+)$/);
  if (editMatch) return { page: "edit", id: editMatch[1] };
  const taskMatch = hash.match(/^\/task\/(\d+)$/);
  if (taskMatch) return { page: "task", id: taskMatch[1] };
  return { page: "list" };
}

export function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  let content: React.ReactNode;
  switch (route.page) {
    case "login":
      content = <LoginForm />;
      break;
    case "new":
      content = <TaskForm />;
      break;
    case "edit":
      content = <TaskForm taskId={route.id} />;
      break;
    case "task":
      content = <TaskDetail taskId={route.id!} />;
      break;
    default:
      content = <TaskList />;
  }

  return (
    <>
      <Nav />
      <main>{content}</main>
    </>
  );
}
