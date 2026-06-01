"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LuArrowRight,
  LuBrain,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuCoins,
  LuDownload,
  LuExternalLink,
  LuImage,
  LuLockKeyhole,
  LuLockKeyholeOpen,
} from "react-icons/lu";
import { type Address, isAddress, keccak256 } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { memogentAgentAbi } from "@/abi/MemogentAgent";
import { timeCapsuleAbi } from "@/abi/TimeCapsule";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import {
  type AgentLogInfo,
  EMPATHY_SYSTEM_PROMPT,
  getEmpathyLog,
} from "@/lib/agentActivity";
import { CONTRACTS, PINATA_GATEWAY } from "@/lib/contracts";
import {
  explorerAddress,
  explorerTx,
  relativeTime,
  shortAddress,
} from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";
import { type AssetSummary, computeDeliveredAssets } from "@/lib/willAssets";
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
  const [assets, setAssets] = useState<AssetSummary | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [empathyLog, setEmpathyLog] = useState<AgentLogInfo | null>(null);
  const [empathyPromptOpen, setEmpathyPromptOpen] = useState(false);

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

  const { data: empathy } = useReadContract({
    address: CONTRACTS.memogentAgent,
    abi: memogentAgentAbi,
    functionName: "empathyMessages",
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: Boolean(ownerAddress && released),
      refetchInterval: 10_000,
    },
  });

  const cid = capsule?.[0] ?? "";
  const contentHash = capsule?.[1] as `0x${string}` | undefined;
  const attachedAt = capsule?.[2];

  useEffect(() => {
    if (!ownerAddress || !released) return;
    let cancelled = false;
    setAssetsLoading(true);
    setAssetsError(null);
    computeDeliveredAssets(ownerAddress)
      .then((s) => {
        if (!cancelled) setAssets(s);
      })
      .catch((err) => {
        console.error("[ClaimPage] computeDeliveredAssets failed", err);
        if (!cancelled) {
          setAssets(null);
          setAssetsError(
            err instanceof Error
              ? err.message
              : "Could not load asset summary.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerAddress, released]);

  const hasAssets =
    assets &&
    (assets.sttAmount > 0n ||
      assets.tokens.length > 0 ||
      assets.nfts.length > 0);

  const empathyText = (empathy as string | undefined) ?? "";
  const hasEmpathy = empathyText.trim().length > 0;

  useEffect(() => {
    if (!ownerAddress || !hasEmpathy) return;
    let cancelled = false;
    getEmpathyLog(ownerAddress)
      .then((log) => {
        if (!cancelled) setEmpathyLog(log);
      })
      .catch(() => {
        if (!cancelled) setEmpathyLog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerAddress, hasEmpathy]);

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

        {isValidOwner && released && (
          <Card>
            <CardContent>
              <Badge tone="active" className="self-start">
                <LuCoins className="size-3" />
                Inheritance received
              </Badge>
              <CardTitle>What you got</CardTitle>
              <CardDescription>
                Memogent autonomously transferred these assets from{" "}
                {shortAddress(owner)} to your wallet the moment the will
                executed.
              </CardDescription>

              {assetsLoading && !assets && (
                <p className="font-apple text-[13px] text-[#1a1a1a]/55">
                  Loading on-chain transfer history…
                </p>
              )}

              {assetsError && !assetsLoading && (
                <p className="break-words rounded-xl bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                  Couldn&apos;t load asset summary: {assetsError}
                </p>
              )}

              {!assetsLoading && !assetsError && !hasAssets && assets && (
                <p className="rounded-xl border border-dashed border-black/10 bg-[#FAFAF6] px-4 py-3 font-apple text-[13px] text-[#1a1a1a]/55">
                  <LuCircleAlert className="mr-1 inline size-3.5" />
                  No on-chain assets were registered in this will — the owner
                  only attached a Time Capsule.
                </p>
              )}

              {hasAssets && (
                <ul className="flex flex-col divide-y divide-black/5 rounded-2xl border border-black/10 bg-white">
                  {assets.sttAmount > 0n && (
                    <li className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-[#0871E7]/10 font-apple text-[12px] font-semibold text-[#0871E7]">
                          STT
                        </span>
                        <div className="flex flex-col">
                          <span className="font-apple text-[14px] text-[#1a1a1a]">
                            Native Somnia (STT)
                          </span>
                          <span className="font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
                            Gas + base asset
                          </span>
                        </div>
                      </div>
                      <span className="font-apple text-[15px] font-semibold tabular-nums text-[#1a1a1a]">
                        {assets.sttFormatted} STT
                      </span>
                    </li>
                  )}
                  {assets.tokens.map((t) => (
                    <li
                      key={t.address}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-[#1B5E20]/10 font-apple text-[11px] font-semibold text-[#1B5E20]">
                          {t.symbol.slice(0, 4)}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-apple text-[14px] text-[#1a1a1a]">
                            {t.symbol}
                          </span>
                          <Link
                            href={explorerAddress(t.address)}
                            target="_blank"
                            className="inline-flex items-center gap-1 truncate font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40 hover:text-[#0871E7]"
                          >
                            {shortAddress(t.address)}
                            <LuExternalLink className="size-3" />
                          </Link>
                        </div>
                      </div>
                      <span className="font-apple text-[15px] font-semibold tabular-nums text-[#1a1a1a]">
                        {t.formatted} {t.symbol}
                      </span>
                    </li>
                  ))}
                  {assets.nfts.map((n) => (
                    <li
                      key={`${n.contract}:${n.tokenId}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-[#7E22CE]/10 text-[#7E22CE]">
                          <LuImage className="size-4" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-apple text-[14px] text-[#1a1a1a]">
                            NFT #{n.tokenId.toString()}
                          </span>
                          <Link
                            href={explorerAddress(n.contract)}
                            target="_blank"
                            className="inline-flex items-center gap-1 truncate font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40 hover:text-[#0871E7]"
                          >
                            {shortAddress(n.contract)}
                            <LuExternalLink className="size-3" />
                          </Link>
                        </div>
                      </div>
                      <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                        ERC-721
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {assets?.execution && (
                <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-[#F3F4ED] p-4 font-apple text-[12px] text-[#1a1a1a]/70 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                      Execution tx
                    </span>
                    <code className="truncate">
                      {assets.execution.txHash.slice(0, 18)}…
                      {assets.execution.txHash.slice(-10)}
                    </code>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                      {relativeTime(assets.execution.executedAt)} · block #
                      {assets.execution.blockNumber.toString()}
                    </span>
                  </div>
                  <Link
                    href={explorerTx(assets.execution.txHash)}
                    target="_blank"
                    className="inline-flex items-center gap-1 self-start font-apple text-[12px] text-[#0871E7] hover:underline md:self-auto"
                  >
                    View on Shannon Explorer
                    <LuArrowRight className="size-3.5" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isValidOwner && released && hasEmpathy && (
          <Card className="border-[#0871E7]/20 bg-[#F6FAFE]">
            <CardContent>
              <Badge tone="accent" className="self-start">
                <LuBrain className="size-3" />
                AI farewell · Memogent Agent
              </Badge>
              <CardTitle>A note generated for you on-chain</CardTitle>
              <CardDescription>
                Written by the on-chain{" "}
                <Link
                  href={explorerAddress(CONTRACTS.memogentAgent)}
                  target="_blank"
                  className="text-[#0871E7] hover:underline"
                >
                  MemogentAgent
                </Link>{" "}
                via Somnia Agent Platform LLM the moment the will executed — no
                human in the loop.
              </CardDescription>
              <p className="font-instrument text-[22px] italic leading-relaxed text-[#1a1a1a]/85">
                &ldquo;{empathyText}&rdquo;
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {empathyLog && (
                  <Link
                    href={explorerTx(empathyLog.txHash)}
                    target="_blank"
                    className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                  >
                    View generation tx (block #
                    {empathyLog.blockNumber.toString()})
                    <LuExternalLink className="size-3.5" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setEmpathyPromptOpen((v) => !v)}
                  className="inline-flex items-center gap-1 font-apple text-[13px] text-[#1a1a1a]/65 underline-offset-2 hover:text-[#0871E7] hover:underline"
                >
                  <LuBrain className="size-3.5" />
                  {empathyPromptOpen ? "Hide" : "See"} the on-chain system
                  prompt
                  {empathyPromptOpen ? (
                    <LuChevronUp className="size-3.5" />
                  ) : (
                    <LuChevronDown className="size-3.5" />
                  )}
                </button>
              </div>

              {empathyPromptOpen && (
                <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-4">
                  <span className="font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
                    MemogentAgent.EMPATHY_SYSTEM_PROMPT — on-chain constant
                  </span>
                  <p className="font-apple text-[12px] leading-relaxed text-[#1a1a1a]/75">
                    &ldquo;{EMPATHY_SYSTEM_PROMPT}&rdquo;
                  </p>
                  <span className="font-apple text-[11px] text-[#1a1a1a]/45">
                    Hard-coded in the deployed contract — anyone can verify the
                    exact instruction the LLM was given before writing this
                    note.
                  </span>
                </div>
              )}
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
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "text/plain";
  } catch {
    return "application/octet-stream";
  }
}
