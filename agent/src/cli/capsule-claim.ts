import { promises as fs } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main(): Promise<void> {
  const ownerAddress = process.argv[2];
  const outputPath = process.argv[3] ?? 'capsule-decrypted.bin';

  if (!ownerAddress) {
    console.error('Usage: pnpm capsule-claim <owner_address> [output_file]');
    process.exit(1);
  }
  if (!ethers.isAddress(ownerAddress)) {
    console.error('Invalid owner address:', ownerAddress);
    process.exit(1);
  }
  if (!config.servicePrivateKey) {
    console.error('SERVICE_PRIVATE_KEY not set in .env (beneficiary key)');
    process.exit(1);
  }
  if (!config.contracts.capsule) {
    console.error('TIME_CAPSULE_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.servicePrivateKey, provider);

  console.log(`Beneficiary wallet: ${wallet.address}`);
  console.log(`Owner (capsule):    ${ownerAddress}`);
  console.log('');

  const abi = [
    'function getCapsule(address) external view returns (string cid, bytes32 contentHash, uint256 attachedAt)',
    'function getDecryptionKey(address) external view returns (bytes)',
    'function isReleased(address) external view returns (bool)',
  ];
  const contract = new ethers.Contract(config.contracts.capsule, abi, wallet);

  console.log('Step 1/5: Querying capsule metadata from chain...');
  const meta = await contract.getFunction('getCapsule')(ownerAddress);
  const cid = meta[0] as string;
  const onChainHash = meta[1] as string;
  const attachedAt = meta[2] as bigint;
  if (!cid) {
    console.error('No capsule found for owner:', ownerAddress);
    process.exit(1);
  }
  console.log(`  CID:        ${cid}`);
  console.log(`  Hash:       ${onChainHash}`);
  console.log(`  Attached:   ${new Date(Number(attachedAt) * 1000).toISOString()}`);

  console.log('Step 2/5: Checking release status (will executed?)...');
  const released = await contract.getFunction('isReleased')(ownerAddress);
  if (!released) {
    console.error('  Capsule NOT released — will of owner has not executed.');
    process.exit(1);
  }
  console.log('  ✓ Released');

  console.log('Step 3/5: Fetching decryption key from chain (only beneficiary can read)...');
  const keyHex = (await contract.getFunction('getDecryptionKey')(ownerAddress)) as string;
  const aesKey = Buffer.from(keyHex.slice(2), 'hex');
  console.log(`  Key:        0x${keyHex.slice(2, 18)}... (${aesKey.length} bytes)`);

  console.log('Step 4/5: Fetching encrypted blob from Pinata...');
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://${cid}.ipfs.dweb.link`,
    `https://ipfs.io/ipfs/${cid}`,
  ];
  let encryptedBlob: Buffer | null = null;
  for (const url of gateways) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        encryptedBlob = Buffer.from(await r.arrayBuffer());
        console.log(`  Fetched from: ${url}`);
        break;
      }
    } catch {
      continue;
    }
  }
  if (!encryptedBlob) {
    console.error('  Failed to fetch from any IPFS gateway');
    process.exit(1);
  }

  console.log('Step 5/5: AES-256-GCM decrypting...');
  const iv = encryptedBlob.subarray(0, 12);
  const authTag = encryptedBlob.subarray(12, 28);
  const ciphertext = encryptedBlob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  await fs.writeFile(outputPath, plaintext);
  console.log(`  ✓ Decrypted. Saved to ${outputPath} (${plaintext.length} bytes)`);

  const computedHash = ethers.keccak256(plaintext);
  if (computedHash !== onChainHash) {
    console.warn('');
    console.warn('⚠ Content hash MISMATCH — file may be tampered with');
    console.warn(`  On-chain: ${onChainHash}`);
    console.warn(`  Computed: ${computedHash}`);
  } else {
    console.log('');
    console.log('✓ Content hash verified — file integrity intact');
  }

  console.log('');
  console.log('=== Capsule content ===');
  console.log(plaintext.toString('utf-8'));

  process.exit(0);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'capsule-claim failed');
  process.exit(1);
});
