import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Workspace } from "@/components/workspace";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <Workspace name={session.user.name ?? "Pengguna"} />;
}
