import { ClaimPage } from "@/components/pages/(main)";

export default async function Page({
  params,
}: {
  params: Promise<{ owner: string }>;
}) {
  const { owner } = await params;
  return <ClaimPage owner={owner} />;
}
