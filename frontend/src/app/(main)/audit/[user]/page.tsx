import { AuditPage } from "@/components/pages/(main)";

export default async function Page({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  return <AuditPage user={user} />;
}
