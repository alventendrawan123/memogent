"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuShieldCheck, LuUpload } from "react-icons/lu";
import { keccak256 } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { timeCapsuleAbi } from "@/abi/TimeCapsule";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import { CONTRACTS } from "@/lib/contracts";
import { OnboardShell } from "./_shell/OnboardShell";

type UploadState =
  | { status: "idle" }
  | { status: "encrypting" }
  | { status: "uploading" }
  | {
      status: "uploaded";
      cid: string;
      contentHash: `0x${string}`;
      encryptionKey: `0x${string}`;
    }
  | { status: "error"; message: string };

export function OnboardCapsulePage() {
  const router = useRouter();
  const { address } = useAccount();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });

  const {
    writeContract,
    data: attachHash,
    isPending: isAttaching,
    error: attachError,
  } = useWriteContract();
  const { isLoading: isAttachMining, isSuccess: isAttached } =
    useWaitForTransactionReceipt({ hash: attachHash });

  useEffect(() => {
    if (isAttached) router.push("/dashboard");
  }, [isAttached, router]);

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUpload({ status: "encrypting" });
      const plaintext = new Uint8Array(await file.arrayBuffer());
      const contentHash = keccak256(plaintext);

      const aesKey = crypto.getRandomValues(new Uint8Array(32));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        aesKey,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
      const cipherWithTag = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          cryptoKey,
          plaintext,
        ),
      );
      const ciphertext = cipherWithTag.slice(0, cipherWithTag.length - 16);
      const authTag = cipherWithTag.slice(cipherWithTag.length - 16);
      const blob = new Uint8Array(
        iv.length + authTag.length + ciphertext.length,
      );
      blob.set(iv, 0);
      blob.set(authTag, iv.length);
      blob.set(ciphertext, iv.length + authTag.length);

      setUpload({ status: "uploading" });
      const body = new FormData();
      body.append(
        "file",
        new Blob([blob], { type: "application/octet-stream" }),
        file.name,
      );
      const res = await fetch("/api/capsule/upload", { method: "POST", body });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const { cid } = (await res.json()) as { cid: string };

      const keyHex = `0x${Array.from(aesKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

      setUpload({
        status: "uploaded",
        cid,
        contentHash,
        encryptionKey: keyHex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Encryption failed.";
      setUpload({ status: "error", message });
    }
  };

  const handleAttach = () => {
    if (upload.status !== "uploaded" || !address) return;
    writeContract({
      address: CONTRACTS.timeCapsule,
      abi: timeCapsuleAbi,
      functionName: "attachCapsule",
      args: [upload.cid, upload.contentHash, upload.encryptionKey],
    });
  };

  const busy =
    upload.status === "encrypting" ||
    upload.status === "uploading" ||
    isAttaching ||
    isAttachMining;

  return (
    <OnboardShell
      stepKey="capsule"
      title="Attach a Time Capsule"
      subtitle="A short letter, voice note, or photo your heir unlocks after execution. Encrypted in this tab — plaintext never leaves your device."
    >
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent>
            <CardTitle>Pick a file</CardTitle>
            <CardDescription>
              Up to ~10MB recommended. PDF, TXT, image, or audio work best —
              your heir decrypts in-browser via Web Crypto.
            </CardDescription>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-[#FAFAF6] px-6 py-10 text-center font-apple text-[14px] text-[#1a1a1a]/70 transition hover:border-[#0871E7]/40 hover:bg-white"
            >
              <LuUpload className="size-5" />
              {file ? file.name : "Click to choose a file"}
              <span className="font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
                {file
                  ? `${(file.size / 1024).toFixed(1)} kB`
                  : "PDF · TXT · image · audio"}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setUpload({ status: "idle" });
              }}
            />

            {upload.status === "error" && (
              <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                {upload.message}
              </p>
            )}
            {attachError && (
              <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                {attachError.message}
              </p>
            )}

            {upload.status === "uploaded" && (
              <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-[#F3F4ED] p-4 font-apple text-[12px] text-[#1a1a1a]/75">
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    CID
                  </span>
                  <code className="truncate">{upload.cid}</code>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Content hash
                  </span>
                  <code className="truncate">{upload.contentHash}</code>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant={upload.status === "uploaded" ? "secondary" : "primary"}
                onClick={handleUpload}
                disabled={!file || busy}
                size="lg"
              >
                {upload.status === "encrypting" && "Encrypting…"}
                {upload.status === "uploading" && "Uploading to IPFS…"}
                {(upload.status === "idle" || upload.status === "error") &&
                  "Encrypt & upload"}
                {upload.status === "uploaded" && "Re-upload"}
              </Button>
              <Button
                variant="primary"
                onClick={handleAttach}
                disabled={upload.status !== "uploaded" || busy}
                size="lg"
              >
                {isAttaching && "Confirm in wallet…"}
                {isAttachMining && "Sealing on chain…"}
                {!(isAttaching || isAttachMining) && (
                  <>
                    Attach to will <LuArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#FAFAF6]">
          <CardContent>
            <Badge tone="info" className="self-start">
              <LuShieldCheck className="size-3" /> AES-256-GCM
            </Badge>
            <CardTitle>What gets stored</CardTitle>
            <ul className="mt-2 flex flex-col gap-3 font-apple text-[14px] text-[#1a1a1a]/70">
              <li>• Plaintext file never leaves this browser tab.</li>
              <li>
                • Ciphertext goes to IPFS via Pinata; only the CID and key
                pointer live on Somnia.
              </li>
              <li>
                • Beneficiary calls{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
                  getDecryptionKey
                </code>{" "}
                after WillExecuted to decrypt locally.
              </li>
              <li>
                • MVP caveat: key is plaintext on-chain. ECIES wrapping is on
                the v2 roadmap.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-8 flex max-w-3xl items-center justify-between px-2">
        <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
          Step 4 of 4
        </span>
        <Link
          href="/dashboard"
          className="font-apple text-[13px] text-[#1a1a1a]/60 underline-offset-4 hover:underline"
        >
          Skip — set up later
        </Link>
      </div>
    </OnboardShell>
  );
}
