// Run:  node scripts/hash-password.mjs
// Asks for usernames and passwords (hidden as you type) and prints the USERS
// secret to paste into Cloudflare, plus a fresh SESSION_SECRET.
// Passwords are never stored or sent anywhere; only salted hashes are printed.

import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../functions/_lib/auth.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    if (hidden) {
      const original = rl._writeToOutput;
      rl._writeToOutput = (s) => { if (s.includes(question)) original.call(rl, s); };
      rl.question(question, (answer) => { rl._writeToOutput = original; process.stdout.write('\n'); resolve(answer); });
    } else {
      rl.question(question, resolve);
    }
  });
}

const users = {};
while (true) {
  const name = (await ask('Username (blank to finish): ')).trim().toLowerCase();
  if (!name) break;
  const pw = await ask('Password (min 12 characters): ', true);
  if (pw.length < 12) { console.log('Too short, try again.\n'); continue; }
  const again = await ask('Repeat password: ', true);
  if (pw !== again) { console.log('Passwords did not match, try again.\n'); continue; }
  users[name] = await hashPassword(pw);
  console.log(`Added "${name}".\n`);
}
rl.close();

if (!Object.keys(users).length) { console.log('No users added.'); process.exit(1); }

console.log('\n=== Secret 1: USERS ===');
console.log(JSON.stringify(users));
console.log('\n=== Secret 2: SESSION_SECRET ===');
console.log(randomBytes(32).toString('hex'));
console.log('\nPaste each value into Cloudflare as an encrypted secret (see DEPLOY.md).');
