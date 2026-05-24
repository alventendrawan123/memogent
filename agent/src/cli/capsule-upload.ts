import { promises as fs } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: pnpm capsule-upload <file>');
    process.exit(1);
  }
  if (!config.pinata.jwt) {
    console.error('PINATA_JWT not set in .env');
    console.error('Get one at: https://pinata.cloud → Sign Up → API Keys → New Key (Admin) → copy JWT');
    process.exit(1);
  }
  if (!config.servicePrivateKey) {
    console.error('SERVICE_PRIVATE_KEY not set in .env');
    process.exit(1);
  }
  if (!config.contracts.capsule) {
    console.error('TIME_CAPSULE_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.servicePrivateKey, provider);

  console.log(`Owner wallet: ${wallet.address}`);
  console.log(`File:         ${filePath}`);
  console.log('');

  console.log('Step 1/4: Reading + hashing file...');
  const plaintext = await fs.readFile(filePath);
  const contentHash = ethers.keccak256(plaintext);
  console.log(`  Size: ${plaintext.length} bytes`);
  console.log(`  Hash: ${contentHash}`);

  console.log('Step 2/4: AES-256-GCM encrypting locally...');
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedBlob = Buffer.concat([iv, authTag, ciphertext]);
  console.log(`  Encrypted blob: ${encryptedBlob.length} bytes (iv 12 + tag 16 + ct ${ciphertext.length})`);

  console.log('Step 3/4: Uploading ciphertext to Pinata IPFS...');
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(encryptedBlob)]), 'capsule.bin');
  const pinResp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.pinata.jwt}` },
    body: formData,
  });
  if (!pinResp.ok) {
    throw new Error(`Pinata upload failed: ${pinResp.status} ${await pinResp.text()}`);
  }
  const pinData = (await pinResp.json()) as { IpfsHash: string; PinSize: number };
  const cid = pinData.IpfsHash;
  console.log(`  CID: ${cid}`);
  console.log(`  Gateway: https://gateway.pinata.cloud/ipfs/${cid}`);

  console.log('Step 4/4: Attaching capsule on-chain (cid + hash + AES key)...');
  const abi = ['function attachCapsule(string,bytes32,bytes) external'];
  const contract = new ethers.Contract(config.contracts.capsule, abi, wallet);
  const attach = contract.getFunction('attachCapsule');
  const tx = await attach(cid, contentHash, aesKey, { gasLimit: 5_000_000n });
  console.log(`  Tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  Confirmed in block ${receipt?.blockNumber}`);

  console.log('');
  console.log('✓ Time Capsule attached!');
  console.log(`  Owner:    ${wallet.address}`);
  console.log(`  CID:      ${cid}`);
  console.log(`  Hash:     ${contentHash}`);
  console.log(`  Key:      0x${aesKey.toString('hex').slice(0, 16)}... (stored on-chain, returned by getDecryptionKey only to beneficiary after will executes)`);
  console.log('');
  console.log('Beneficiary will receive notification when will executes. They run:');
  console.log(`  pnpm capsule-claim ${wallet.address}`);

  process.exit(0);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'capsule-upload failed');
  process.exit(1);
});
