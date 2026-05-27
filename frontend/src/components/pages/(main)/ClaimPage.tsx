"use client";

import Link from "next/link";
import { useState } from "react";
import { LuDownload, LuLockKeyhole, LuLockKeyholeOpen } from "react-icons/lu";
import { type Address, isAddress, keccak256 } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { timeCapsuleAbi } from "@/abi/TimeCapsule";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import { CONTRACTS, PINATA_GATEWAY } from "@/lib/contracts";
import { relativeTime, shortAddress } from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";
import { PageHeader } from "./_shell/PageHeader";

type DecryptState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "decrypting" }
  | {
      status: "ready";
      text: string | null;
      blobUrl: string | null;
      mime: string;
      filename: string;
    }
  | { status: "error"; message: string };

export function ClaimPage({ owner }: { owner: string }) {
  const { address: beneficiary } = useAccount();
  const [state, setState] = useState<DecryptState>({ status: "idle" });

  const isValidOwner = isAddress(owner);
  const ownerAddress = isValidOwner ? (owner as Address) : undefined;

  const { data: capsule } = useReadContract({
    address: CONTRACTS.timeCapsule,
    abi: timeCapsuleAbi,
    functionName: "getCapsule",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: { enabled: Boolean(ownerAddress) },
  });

  const { data: released } = useReadContract({
    address: CONTRACTS.timeCapsule,
    abi: timeCapsuleAbi,
    functionName: "isReleased",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: { enabled: Boolean(ownerAddress) },
  });

  const cid = capsule?.[0] ?? "";
  const contentHash = capsule?.[1] as `0x${string}` | undefined;
  const attachedAt = capsule?.[2];

  const decrypt = async () => {
    if (!ownerAddress || !beneficiary || !cid || !contentHash) return;
    try {
      setState({ status: "fetching" });
      const keyHex = (await readContract(wagmiConfig, {
        address: CONTRACTS.timeCapsule,
        abi: timeCapsuleAbi,
        functionName: "getDecryptionKey",
        args: [ownerAddress],
        account: beneficiary,
      })) as `0x${string}`;

      const resp = await fetch(`${PINATA_GATEWAY}/${cid}`);
      if (!resp.ok) throw new Error(`IPFS fetch failed (${resp.status})`);
      const encrypted = new Uint8Array(await resp.arrayBuffer());

      setState({ status: "decrypting" });
      const iv = encrypted.slice(0, 12);
      const authTag = encrypted.slice(12, 28);
      const ciphertext = encrypted.slice(28);
      const cipherWithTag = new Uint8Array(ciphertext.length + authTag.length);
      cipherWithTag.set(ciphertext, 0);
      cipherWithTag.set(authTag, ciphertext.length);

      const keyBytes = hexToBytes(keyHex);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          cipherWithTag,
        ),
      );

      if (keccak256(plaintext) !== contentHash)
        throw new Error("Content hash mismatch — capsule may be tampered.");

      const mime = sniffMime(plaintext);
      const blob = new Blob([new Uint8Array(plaintext)], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const text = mime.startsWith("text/")
        ? new TextDecoder().decode(plaintext)
        : null;

      setState({
        status: "ready",
        text,
        blobUrl,
        mime,
        filename: `memogent-capsule-${shortAddress(ownerAddress)}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Decrypt failed.";
      setState({ status: "error", message });
    }
  };

  return (
    <>
      <PageHeader
        trail={[
          "Beneficiary claim",
          isValidOwner ? shortAddress(owner) : "Invalid",
        ]}
        title="Open the capsule."
        subtitle="Decryption happens entirely in this browser tab. Plaintext never touches a server."
      />

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6">
        {!isValidOwner && (
          <Card className="border-[#B91C1C]/20 bg-[#FCE4EC]/40">
            <CardContent>
              <CardTitle>Owner address is invalid</CardTitle>
              <CardDescription>
                The link to this page should look like{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5">
                  /claim/0xabc…
                </code>
                .
              </CardDescription>
            </CardContent>
          </Card>
        )}

        {isValidOwner && (
          <Card>
            <CardContent>
              <Badge
                tone={released ? "active" : "neutral"}
                className="self-start"
              >
                {released ? (
                  <LuLockKeyholeOpen className="size-3" />
                ) : (
                  <LuLockKeyhole className="size-3" />
                )}
                {released ? "Released" : "Locked"}
              </Badge>
              <CardTitle>Capsule from {shortAddress(owner)}</CardTitle>
              <CardDescription>
                {released
                  ? "The will has executed. As the named beneficiary, you can decrypt now."
                  : "The will hasn't executed yet. This capsule unlocks the moment Memogent fires inheritance."}
              </CardDescription>

              <dl className="grid grid-cols-1 gap-3 rounded-xl border border-black/10 bg-[#F3F4ED] p-4 font-apple text-[13px] text-[#1a1a1a]/75 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    IPFS CID
                  </dt>
                  <dd className="truncate">{cid || "—"}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Attached
                  </dt>
                  <dd>{relativeTime(attachedAt)}</dd>
                </div>
              </dl>

              {state.status === "error" && (
                <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                  {state.message}
                </p>
              )}

              <Button
                onClick={decrypt}
                disabled={
                  !released ||
                  !beneficiary ||
                  state.status === "fetching" ||
                  state.status === "decrypting"
                }
                size="lg"
                className="self-start"
              >
                <LuLockKeyholeOpen className="size-4" />
                {state.status === "fetching" && "Fetching ciphertext…"}
                {state.status === "decrypting" && "Decrypting locally…"}
                {(state.status === "idle" ||
                  state.status === "ready" ||
                  state.status === "error") &&
                  "Decrypt & open"}
              </Button>
            </CardContent>
          </Card>
        )}

        {state.status === "ready" && (
          <Card className="border-[#0871E7]/20 bg-white">
            <CardContent>
              <Badge tone="info" className="self-start">
                Plaintext (local only)
              </Badge>
              <CardTitle>Capsule contents</CardTitle>
              {state.text ? (
                <pre className="whitespace-pre-wrap rounded-xl bg-[#FAFAF6] p-4 font-apple text-[14px] leading-relaxed text-[#1a1a1a]">
                  {state.text}
                </pre>
              ) : (
                <p className="font-apple text-[14px] text-[#1a1a1a]/70">
                  Binary file detected ({state.mime}). Download to view.
                </p>
              )}
              {state.blobUrl && (
                <Link
                  href={state.blobUrl}
                  download={state.filename}
                  className="inline-flex w-fit items-center gap-2 font-apple text-[13px] text-[#0871E7] hover:underline"
                >
                  <LuDownload className="size-4" />
                  Download decrypted file
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 4) {
    const h = Array.from(bytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (h.startsWith("89504e47")) return "image/png";
    if (h.startsWith("ffd8ff")) return "image/jpeg";
    if (h.startsWith("25504446")) return "application/pdf";
    if (h.startsWith("00000018") || h.startsWith("00000020"))
      return "video/mp4";
  }
  const sample = bytes.slice(0, 64);
  const isText = sample.every(
    (b) => (b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09,
  );
  return isText ? "text/plain" : "application/octet-stream";
}
