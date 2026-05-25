import type { Context } from 'grammy';

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `*Memogent commands*\n\n` +
      `/start link\\_<token> — bind your wallet to this chat\n` +
      `/status — show your linked wallet\n` +
      `/claimcapsule <owner\\_address> — unlock & decrypt a Time Capsule (only works if you are the named beneficiary and the owner's will has executed)\n` +
      `/help — this message\n\n` +
      `*About Memogent*\n` +
      `Memogent is an autonomous digital inheritance protocol on Somnia. ` +
      `Wallets register an on-chain will that names a beneficiary. ` +
      `An on-chain AI agent watches wallet activity and, once inactivity passes the configured threshold, ` +
      `the protocol autonomously transfers assets to the beneficiary — no human signature required.\n\n` +
      `*About Time Capsules*\n` +
      `A Time Capsule is a private message the owner encrypts client-side (AES-256-GCM), ` +
      `uploads to IPFS, and locks on-chain with the AES key. ` +
      `Only the named beneficiary's wallet address — verified on-chain — can fetch the key, ` +
      `and only after the will executes. This bot fetches the key on the beneficiary's behalf, ` +
      `decrypts the IPFS blob locally, verifies its keccak256 content hash against the on-chain hash, ` +
      `and posts the plaintext into this chat.`,
    { parse_mode: 'Markdown' }
  );
}
