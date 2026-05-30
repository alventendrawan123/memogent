import { createDecipheriv } from 'node:crypto';
import { ethers } from 'ethers';
import { type Context, InputFile } from 'grammy';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import * as walletLink from '../../db/repos/walletLink.js';

const TELEGRAM_TEXT_LIMIT = 3500;

function sniffMime(bytes: Buffer): { mime: string; ext: string } {
  if (bytes.length >= 4) {
    const h = bytes.subarray(0, 4).toString('hex');
    if (h.startsWith('89504e47')) return { mime: 'image/png', ext: 'png' };
    if (h.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg' };
    if (h.startsWith('47494638')) return { mime: 'image/gif', ext: 'gif' };
    if (h.startsWith('25504446')) return { mime: 'application/pdf', ext: 'pdf' };
    if (h.startsWith('504b0304')) return { mime: 'application/zip', ext: 'zip' };
    if (h.startsWith('00000018') || h.startsWith('00000020'))
      return { mime: 'video/mp4', ext: 'mp4' };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { mime: 'text/plain', ext: 'txt' };
  } catch {
    return { mime: 'application/octet-stream', ext: 'bin' };
  }
}

const CORE_ABI = [
  'function getWillInfo(address) view returns (address beneficiary, uint256 lastCheckIn, uint256 inactivePeriod, uint256 deadlineTimestamp, bool executed, bool active)',
];

const CAPSULE_ABI = [
  'function getCapsule(address) view returns (string cid, bytes32 contentHash, uint256 attachedAt)',
  'function getDecryptionKey(address) view returns (bytes)',
];

const IPFS_GATEWAYS = (cid: string) => [
  `https://gateway.pinata.cloud/ipfs/${cid}`,
  `https://${cid}.ipfs.dweb.link`,
  `https://ipfs.io/ipfs/${cid}`,
];

export async function handleClaimCapsule(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const ownerArg = (ctx.match as string | undefined)?.trim();
  if (!ownerArg) {
    await ctx.reply(
      `*Usage:* \`/claimcapsule <owner_address>\`\n\n` +
        `Replace \`<owner_address>\` with the full Ethereum-style address (42 chars, starts with 0x) ` +
        `of the will owner who named you as beneficiary. You'll find that address in the bot's WillExecuted ` +
        `notification.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (!ethers.isAddress(ownerArg)) {
    await ctx.reply(
      `🚫 *Invalid owner address.*\n\n` +
        `Received: \`${ownerArg}\`\n` +
        `Expected: a 42-char address starting with \`0x\` (e.g. \`0x7de5a9cA72456455dd83231242a0c6adA97FB4de\`).`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  const owner = ethers.getAddress(ownerArg);

  const link = await walletLink.getByChatId(chatId);
  if (!link) {
    await ctx.reply(
      `🚫 No wallet linked to this chat yet.\n\n` +
        `Ask the owner for a beneficiary invite link, then /start it here to bind your wallet first.`
    );
    return;
  }
  const beneficiary = ethers.getAddress(link.wallet_address);

  if (!config.contracts.core || !config.contracts.capsule) {
    await ctx.reply('Server misconfigured (core or capsule address missing).');
    return;
  }

  await ctx.reply('🔍 Verifying eligibility on-chain...');

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const core = new ethers.Contract(config.contracts.core, CORE_ABI, provider);
  const capsule = new ethers.Contract(config.contracts.capsule, CAPSULE_ABI, provider);

  let willInfo: [string, bigint, bigint, bigint, boolean, boolean];
  try {
    willInfo = (await core.getFunction('getWillInfo')(owner)) as typeof willInfo;
  } catch (err) {
    logger.warn({ owner, err }, 'claimcapsule: getWillInfo failed');
    await ctx.reply(
      `🚫 *No will registered for that owner.*\n\n` +
        `Owner queried: \`${owner}\`\n\n` +
        `Either the address is wrong or the owner never ran the on-chain registerWill flow. ` +
        `Double-check the address in the WillExecuted notification.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  const [willBeneficiary, , , deadlineMs, executed] = willInfo;

  if (ethers.getAddress(willBeneficiary) !== beneficiary) {
    await ctx.reply(
      `🚫 *You are not the beneficiary of this will.*\n\n` +
        `Owner: \`${owner}\`\n` +
        `Their beneficiary: \`${ethers.getAddress(willBeneficiary)}\`\n` +
        `Your linked wallet: \`${beneficiary}\`\n\n` +
        `The on-chain decryption key check enforces \`msg.sender == beneficiary\` — only the named ` +
        `beneficiary's wallet can unlock the capsule.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (!executed) {
    const deadlineIso = new Date(Number(deadlineMs)).toISOString();
    await ctx.reply(
      `⏳ *Will is still active — capsule sealed.*\n\n` +
        `Owner: \`${owner}\`\n` +
        `Earliest unlock: ${deadlineIso} (UTC)\n\n` +
        `The Time Capsule unlocks automatically the moment the will executes — you'll receive ` +
        `a DM here with the run-command the moment that happens. No need to poll.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let meta: [string, string, bigint];
  try {
    meta = (await capsule.getFunction('getCapsule')(owner)) as typeof meta;
  } catch (err) {
    logger.warn({ owner, err }, 'claimcapsule: getCapsule failed');
    await ctx.reply(
      `ℹ️ *No Time Capsule attached.*\n\n` +
        `Owner: \`${owner}\`\n\n` +
        `The will executed and assets were transferred to your wallet, but the owner did ` +
        `not encrypt and attach a personal message before going inactive. Nothing to decrypt.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  const [cid, onChainHash] = meta;
  if (!cid) {
    await ctx.reply(
      `ℹ️ *No Time Capsule attached.*\n\n` +
        `Owner: \`${owner}\`\n\n` +
        `The will executed and assets were transferred to your wallet, but the owner did ` +
        `not encrypt and attach a personal message before going inactive. Nothing to decrypt.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let keyHex: string;
  try {
    const data = capsule.interface.encodeFunctionData('getDecryptionKey', [owner]);
    const raw = await provider.call({ to: config.contracts.capsule, from: beneficiary, data });
    [keyHex] = capsule.interface.decodeFunctionResult('getDecryptionKey', raw) as unknown as [string];
  } catch (err) {
    logger.error({ owner, err }, 'claimcapsule: getDecryptionKey failed');
    await ctx.reply(
      `🚫 *Failed to fetch decryption key from chain.*\n\n` +
        `This usually means the on-chain access-control check rejected the call. ` +
        `If you just received the WillExecuted DM, wait ~10 seconds and try again — the on-chain state may not have propagated yet.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  const aesKey = Buffer.from(keyHex.slice(2), 'hex');

  let encryptedBlob: Buffer | null = null;
  for (const url of IPFS_GATEWAYS(cid)) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        encryptedBlob = Buffer.from(await r.arrayBuffer());
        break;
      }
    } catch {
      continue;
    }
  }
  if (!encryptedBlob) {
    await ctx.reply(
      `🚫 *Failed to fetch capsule blob from IPFS.*\n\n` +
        `CID: \`${cid}\`\n\n` +
        `Tried Pinata, dweb.link, and ipfs.io gateways — all failed. ` +
        `This is usually transient; retry the command in 30s. If it keeps failing, ` +
        `the blob may have been unpinned upstream.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let plaintext: Buffer;
  try {
    const iv = encryptedBlob.subarray(0, 12);
    const authTag = encryptedBlob.subarray(12, 28);
    const ciphertext = encryptedBlob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    logger.error({ owner, err }, 'claimcapsule: AES decrypt failed');
    await ctx.reply(
      `🚫 *Decryption failed.*\n\n` +
        `The AES-256-GCM auth tag did not verify. ` +
        `Either the on-chain key doesn't match the IPFS blob (data corruption), ` +
        `or the blob was tampered with after upload. Capsule integrity cannot be trusted.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const computedHash = ethers.keccak256(plaintext);
  const integrityOk = computedHash === onChainHash;
  const { mime, ext } = sniffMime(plaintext);
  const isText = mime === 'text/plain';
  const tooLargeForInline = plaintext.length > TELEGRAM_TEXT_LIMIT;
  const sendAsDocument = !isText || tooLargeForInline;

  logger.info(
    { owner, beneficiary, cid, size: plaintext.length, mime, integrityOk, sendAsDocument },
    'claimcapsule: decrypted'
  );

  const integrityLine = integrityOk
    ? '✓ Content hash verified on-chain'
    : '⚠ Content hash MISMATCH — file may be tampered';

  const caption =
    `🕯️ *Time Capsule unlocked.*\n\n` +
    `*From (tap to copy):*\n\`${owner}\`\n\n` +
    `*IPFS CID:*\n\`${cid}\`\n\n` +
    `${integrityLine}`;

  try {
    if (sendAsDocument) {
      const filename = `memogent-capsule-${owner.slice(0, 6)}-${owner.slice(-4)}.${ext}`;
      await ctx.replyWithDocument(new InputFile(plaintext, filename), {
        caption: `${caption}\n\n_Binary or large content (${mime}, ${plaintext.length} bytes) — sent as file._`,
        parse_mode: 'Markdown',
      });
    } else {
      await ctx.reply(
        `${caption}\n\n*Decrypted message:*\n\`\`\`\n${plaintext.toString('utf-8')}\n\`\`\``,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    logger.error({ owner, err }, 'claimcapsule: reply failed');
    await ctx.reply(
      `🚫 *Decrypted, but couldn't deliver content.*\n\n` +
        `The capsule unlocked successfully (hash verified ${integrityOk ? '✓' : '⚠'}), but Telegram rejected the reply. ` +
        `Try the FE claim page instead: \`/claim/${owner}\` on the Memogent web app.`,
      { parse_mode: 'Markdown' }
    );
  }
}
