/**
 * Check the status of dispatch transactions to see why no AssessmentReceived
 * response is coming back from the Somnia Agent Platform.
 */
import 'dotenv/config';
import { ethers } from 'ethers';
import { config } from '../src/config.js';

const TX_HASHES = [
  '0x33450a025ecab9e8d108bc5b14fa70e783ddc768d97237b0e156b2a03a2bff3c',
  '0x76684d70228221b27733dc9c2ba7c82238d163a2f42c7f9a04914129c748842b',
  '0x644fcf9ddb6aea6072802bd2b6702441854f0fb7e411d089be96a7245fdb7fa8',
  '0x069a8702446ae826c89f556b829d1c4f63a9214c63d50b823b113bd769d83fce',
  '0x11551c7037a54e35678e3d2f9b662c65ae0db0c416354bc594338aafb069286f',
  '0xc4e57ba5eb6382adcf917734afe549c941896de6576f96cc0804dffd4541772a',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(config.rpc);
  console.log(`Checking ${TX_HASHES.length} dispatch transactions:\n`);

  for (const txHash of TX_HASHES) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        console.log(`  ${txHash.slice(0, 14)}…  ⏳ pending or not found`);
        continue;
      }
      const status = receipt.status === 1 ? '✅ SUCCESS' : '❌ REVERTED';
      console.log(
        `  ${txHash.slice(0, 14)}…  ${status}  block ${receipt.blockNumber}  logs:${receipt.logs.length}  gas:${receipt.gasUsed}`,
      );
    } catch (err) {
      console.log(`  ${txHash.slice(0, 14)}…  💥 query failed: ${(err as Error).message.slice(0, 50)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
