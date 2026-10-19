// Ephemeral QA credentials only. No live account, file or authenticator is read.
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
export async function provisionFixture(path, username, password_hash) {
  const secret = randomBytes(20);
  await writeFile(path, JSON.stringify({ username, password_hash, totp_secret_hex: secret.toString('hex') }), { mode: 0o600 });
  await writeFile(path + '.totp-state', JSON.stringify({ secret_id: createHash('sha256').update(secret).digest('hex'), last_step: 0 }), { mode: 0o600 });
  let last = 0;
  return async () => {
    // Real clock and one-use codes; do not weaken backend replay checks for QA.
    while (Math.floor(Date.now()/30000) <= last) await new Promise(resolve => setTimeout(resolve, 250));
    last = Math.floor(Date.now()/30000);
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(last));
    const hash = createHmac('sha1', secret).update(counter).digest();
    return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
  };
}
