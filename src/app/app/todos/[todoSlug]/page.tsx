import { redirect } from "next/navigation";

import { TodoPageEditor } from "@/components/layout/todo-page-editor";
import { getServerSession } from "@/lib/auth-server";
import { getTodoIdFromSlug } from "@/lib/todo-slug";

export const dynamic = "force-dynamic";

export default async function TodoPage({
  params,
}: {
  params: Promise<{ todoSlug: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const { todoSlug } = await params;
  const todoId = getTodoIdFromSlug(todoSlug);
  if (!todoId) {
    redirect("/app");
  }

  return <TodoPageEditor todoId={todoId} />;
}
