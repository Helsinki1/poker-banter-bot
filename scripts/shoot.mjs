// Dev screenshot harness: captures every deterministic ?scene= state.
// Usage: node scripts/shoot.mjs [baseUrl] [sceneName ...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const only = process.argv.slice(3);

const SCENES = [
  'picker', 'picker-einstein', 'picker-lebron', 'picker-trump',
  'table-einstein', 'table-lebron', 'table-trump',
  'shuffling', 'holecards', 'opponent-decision', 'player-decision',
  'flop', 'flop-lebron', 'flop-trump', 'turn', 'river',
  'showdown', 'player-win', 'player-loss', 'split-pot', 'fold-resolution',
  'voice-disabled', 'voice-connecting', 'voice-connected', 'mic-active',
  'player-speaking', 'transcript-streaming', 'npc-listening', 'npc-thinking',
  'npc-begin-speak', 'npc-speaking', 'player-interrupting', 'response-cancelled',
  'mic-muted', 'npc-muted', 'connection-lost', 'reconnecting', 'voice-error',
  'text-fallback',
];

const list = only.length ? only : SCENES;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

for (const scene of list) {
  await page.goto(`${base}/?scene=${scene}`, { waitUntil: 'networkidle' });
  // Let scripted hands + entry transitions settle.
  await page.waitForTimeout(scene.startsWith('picker') ? 900 : 2500);
  await page.screenshot({ path: `shots/${scene}.png` });
  console.log(`shot: ${scene}`);
}

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of errors) console.log(' ', e);
} else {
  console.log('\nNo console errors.');
}
await browser.close();
