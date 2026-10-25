import { redirect } from "next/navigation";
import { FilesLibrary } from "@/components/files/files-library";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  if (!(await getServerSession())) redirect("/");
  return <FilesLibrary />;
}
