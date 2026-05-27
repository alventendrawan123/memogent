import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      {
        error:
          "PINATA_JWT not configured on the server. Set it in .env.local to enable Time Capsule uploads.",
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  const pinataForm = new FormData();
  pinataForm.append("file", file, "memogent-capsule");

  const pinataResponse = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: pinataForm,
    },
  );

  if (!pinataResponse.ok) {
    const text = await pinataResponse.text();
    return NextResponse.json(
      { error: `Pinata upload failed: ${text}` },
      { status: pinataResponse.status },
    );
  }

  const data = (await pinataResponse.json()) as { IpfsHash: string };
  return NextResponse.json({ cid: data.IpfsHash });
}
