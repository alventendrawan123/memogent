import { logger } from '../logger.js';
import { safeSend } from './bot.js';
import * as walletLink from '../db/repos/walletLink.js';
import { computeDeliveredAssets, formatAssetSummary } from '../listener/willAssets.js';

const EXPLORER_TX_BASE = 'https://shannon-explorer.somnia.network/tx';
const explorerTxUrl = (txHash: string): string => `${EXPLORER_TX_BASE}/${txHash}`;

export type RiskClassification = 'SAFE' | 'WATCH' | 'GRACE' | 'EXECUTE' | string;

export async function notifyRiskDecision(
  walletAddress: string,
  classification: RiskClassification
): Promise<void> {
  const link = await walletLink.getByWallet(walletAddress);
  if (!link) {
    logger.debug({ walletAddress, classification }, 'No telegram link for wallet, skipping notify');
    return;
  }

  const shortAddr = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  let message: string;
  switch (classification) {
    case 'SAFE':
      logger.debug({ walletAddress }, 'SAFE classification, no notification sent');
      return;
    case 'WATCH':
      message =
        `📋 Wallet ${shortAddr} risk: WATCH\n\n` +
        `Mild inactivity detected. No action needed yet, but please check in soon.`;
      break;
    case 'GRACE':
      message =
        `⚠️ Wallet ${shortAddr} risk: GRACE\n\n` +
        `Significant inactivity detected. Please confirm you're OK by sending any message in this chat.`;
      break;
    case 'EXECUTE':
      message =
        `🚨 Wallet ${shortAddr} risk: EXECUTE\n\n` +
        `Critical inactivity. Your digital inheritance is about to be triggered.`;
      break;
    default:
      message = `Wallet ${shortAddr} assessed: ${classification}`;
  }

  await safeSend(link.chat_id, message);
}

export async function notifyWillExecuted(
  ownerAddress: string,
  beneficiaryAddress: string,
  capsuleCid: string | undefined,
  txHash: string
): Promise<void> {
  const txUrl = explorerTxUrl(txHash);
  const ownerLink = await walletLink.getByWallet(ownerAddress);
  const bnfLink = await walletLink.getByWallet(beneficiaryAddress);

  let assetsBlock = '';
  if (ownerLink || bnfLink) {
    try {
      const summary = await computeDeliveredAssets(ownerAddress);
      assetsBlock =
        `\n\n*Assets transferred:*\n` +
        `${formatAssetSummary(summary)}\n`;
    } catch (err) {
      logger.warn({ ownerAddress, err }, 'notifyWillExecuted: asset summary failed');
    }
  }

  if (ownerLink) {
    await safeSend(
      ownerLink.chat_id,
      `📜 *Your will has been executed.*\n\n` +
        `Memogent classified your wallet as inactive long enough to trigger the inheritance, ` +
        `and assets have been transferred to your beneficiary:\n` +
        `\`${beneficiaryAddress}\`` +
        assetsBlock +
        `\n🔗 On-chain proof:\n${txUrl}`,
      { parse_mode: 'Markdown' }
    );
  }

  if (bnfLink) {
    let msg =
      `🚨 *Inheritance triggered — you are the beneficiary.*\n\n` +
      `*Owner (full address — tap to copy):*\n` +
      `\`${ownerAddress}\`\n\n` +
      `Their wallet went inactive long enough that Memogent autonomously executed their digital will. ` +
      `On-chain assets registered in the will have been transferred to your linked wallet.` +
      assetsBlock +
      `\n🔗 Execution tx:\n${txUrl}`;
    if (capsuleCid) {
      msg +=
        `\n\n🕯️ *Time Capsule attached*\n` +
        `The owner encrypted a personal message for you (AES-256-GCM, stored on IPFS, key locked on-chain). ` +
        `Only your linked wallet can unlock it — and only now that the will has executed.\n\n` +
        `To decrypt directly in this chat, run:\n` +
        `\`/claimcapsule ${ownerAddress}\`\n\n` +
        `IPFS CID: \`${capsuleCid}\``;
    }
    await safeSend(bnfLink.chat_id, msg, { parse_mode: 'Markdown' });
  }

  if (!ownerLink && !bnfLink) {
    logger.info(
      { ownerAddress, beneficiaryAddress, capsuleCid, txHash },
      'WillExecuted: neither party linked to Telegram'
    );
  }
}

export async function notifyEmpathyMessage(
  ownerAddress: string,
  message: string,
  txHash: string
): Promise<void> {
  const { default: supabaseClient } = await import('../db/supabase.js').then(m => ({ default: m.supabase }));
  const { data } = await supabaseClient
    .from('tracked_will')
    .select('beneficiary')
    .eq('owner_address', ownerAddress)
    .maybeSingle();

  if (!data?.beneficiary) {
    logger.info({ ownerAddress }, 'empathyMessage: no tracked beneficiary');
    return;
  }

  const bnfLink = await walletLink.getByWallet(data.beneficiary);
  if (!bnfLink) {
    logger.info({ ownerAddress, beneficiary: data.beneficiary }, 'empathyMessage: beneficiary not linked to Telegram');
    return;
  }

  await safeSend(
    bnfLink.chat_id,
    `💌 *AI farewell message from your owner:*\n` +
      `\`${ownerAddress}\`\n\n` +
      `_${message}_\n\n` +
      `_This note was composed on-chain by Memogent's AI Agent (Somnia LLM consensus). ` +
      `It is supplementary — if the owner also left a Time Capsule, decrypt it with:_\n` +
      `\`/claimcapsule ${ownerAddress}\`\n\n` +
      `🔗 On-chain proof:\n${explorerTxUrl(txHash)}`,
    { parse_mode: 'Markdown' }
  );
}
