import { logger } from '../logger.js';
import { safeSend } from './bot.js';
import * as walletLink from '../db/repos/walletLink.js';

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
  beneficiaryAddress: string
): Promise<void> {
  const ownerLink = await walletLink.getByWallet(ownerAddress);
  if (ownerLink) {
    const shortBnf = `${beneficiaryAddress.slice(0, 6)}...${beneficiaryAddress.slice(-4)}`;
    await safeSend(
      ownerLink.chat_id,
      `Your will has been executed. Assets transferred to beneficiary ${shortBnf}.`
    );
  }

  const bnfLink = await walletLink.getByWallet(beneficiaryAddress);
  if (bnfLink) {
    const shortOwner = `${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}`;
    await safeSend(
      bnfLink.chat_id,
      `You have been named beneficiary by ${shortOwner}. ` +
        `Their digital inheritance has been transferred to your wallet. ` +
        `Check your wallet on the Somnia explorer for received assets.`
    );
  }

  if (!ownerLink && !bnfLink) {
    logger.info(
      { ownerAddress, beneficiaryAddress },
      'WillExecuted: neither party linked to Telegram'
    );
  }
}
