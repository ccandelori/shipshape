#!/usr/bin/env node
// ship CLI - thin wrapper on @ship/sdk for public platform (TTFE gate + developer DX).
// Persists token in ~/.ship/config.json (ITokenStore). Commands: login (device), docs create, webhooks verify/tail stub.

import { ShipClient, type ITokenStore, PublicApiError } from '@ship/sdk';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.ship');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

class FileTokenStore implements ITokenStore {
  async get(): Promise<string | null> {
    try {
      if (!existsSync(CONFIG_FILE)) return null;
      const raw = readFileSync(CONFIG_FILE, 'utf8');
      const j = JSON.parse(raw);
      return j.token || null;
    } catch { return null; }
  }
  async set(token: string): Promise<void> {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    const j = { token, updated_at: new Date().toISOString() };
    writeFileSync(CONFIG_FILE, JSON.stringify(j, null, 2), 'utf8');
  }
  async clear(): Promise<void> {
    try { writeFileSync(CONFIG_FILE, JSON.stringify({}), 'utf8'); } catch {}
  }
}

const args = process.argv.slice(2);
const cmd = args[0];
const store = new FileTokenStore();

async function main() {
  if (cmd === 'login') {
    console.log('Starting device login...');
    const client = await ShipClient.deviceLogin({
      onUserCode: (code: string, url: string) => {
        console.log(`\nVisit ${url} and enter code: ${code}\n`);
      },
      baseUrl: process.env.SHIP_API_BASE || undefined,
    });
    await client.saveToStore(store);
    console.log('Logged in. Token saved to ~/.ship/config.json');
    process.exit(0);
  }

  if (cmd === 'docs' && args[1] === 'create') {
    const title = args[2] || 'Untitled from CLI';
    let t: string | null = process.env.SHIP_TOKEN || null;
    if (!t) t = await store.get();
    if (!t) { console.error('No token. Run: ship login or set SHIP_TOKEN'); process.exit(1); }
    const token = t;
    const client = new ShipClient({ token, baseUrl: process.env.SHIP_API_BASE });
    try {
      const doc = await client.documents.create({ title });
      console.log('Created:', doc);
    } catch (e) {
      if (e instanceof PublicApiError) {
        console.error('Error:', e.code, e.message, e.request_id ? `(req ${e.request_id})` : '');
      } else { console.error(e); }
      process.exit(1);
    }
    process.exit(0);
  }

  if (cmd === 'webhooks' && args[1] === 'verify') {
    // Simple: takes --secret --sig --ts --body or stdin; uses sdk verify
    console.log('webhooks verify: use SDK verifyWebhook(headers, rawBody, secret) in your subscriber. (CLI stub)');
    process.exit(0);
  }

  if (cmd === 'webhooks' && args[1] === 'tail') {
    console.log('webhooks tail: ephemeral listener in TTFE harness (not direct CLI poll). See e2e public TTFE.');
    process.exit(0);
  }

  console.log('ship <login|docs create <title>|webhooks verify|tail> (uses public /api/v1)');
}

main().catch(e => { console.error(e); process.exit(1); });
