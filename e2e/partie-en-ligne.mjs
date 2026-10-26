// Test de bout en bout : N navigateurs indépendants (chacun son compte anonyme et son
// stockage) jouent une partie en ligne complète.
// Utilisation : node e2e/partie-en-ligne.mjs <adresse du jeu> [joueurs=6] [dossier captures]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:4174';
const N = Number(process.argv[3] ?? 6);
const SHOTS = process.argv[4] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NAMES = ['Aubin', 'Margot', 'Basile', 'Ondine', 'Gaspard', 'Léonie', 'Firmin', 'Adèle', 'Côme', 'Suzon', 'Anatole', 'Philomène', 'Hector', 'Rosalie', 'Augustin', 'Mahaut'];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const failures = [];
const check = (cond, msg) => {
  if (!cond) {
    failures.push(msg);
    log('ÉCHEC :', msg);
  } else log('ok :', msg);
};

const browser = await chromium.launch();
const players = [];
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: i % 2 ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|websocket|realtime|ERR_CONNECTION|Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  players.push({ name: NAMES[i], page, errors });
}
const [host] = players;
const shot = async (p, name) => SHOTS && p.page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

// 1. L'hôte crée le salon
await host.page.goto(BASE);
await host.page.fill('input.input', host.name);
await host.page.getByRole('button', { name: 'Créer une partie' }).click();
await host.page.waitForSelector('.invite-code');
const code = (await host.page.locator('.invite-code').innerText()).replace(/\s/g, '');
check(/^[A-Z]{5}$/.test(code), `salon créé, code ${code}`);

// 2. Les autres rejoignent avec le lien d'invitation
for (const p of players.slice(1)) {
  await p.page.goto(`${BASE}/?code=${code}`);
  await p.page.locator('.modal input.input').first().fill(p.name);
  await p.page.getByRole('button', { name: 'Entrer dans le village' }).click();
  await p.page.waitForSelector('.player-list');
}
await host.page.waitForFunction((n) => document.querySelectorAll('.player-row:not(.player-row--empty)').length === n, N, { timeout: 20000 });
check(true, `${N} joueurs visibles chez l'hôte`);
const guestSees = await players[N - 1].page.locator('.player-row:not(.player-row--empty)').count();
check(guestSees === N, `le dernier arrivé voit aussi ${N} joueurs (${guestSees})`);
check((await players[1].page.locator('.lobby__settings.is-locked').count()) === 1, 'les réglages sont verrouillés pour un invité');

// 3. L'hôte règle la partie (N joueurs, chronos courts) et lance
const ranges = host.page.locator('.lobby__settings input[type=range]');
await ranges.nth(0).fill(String(N));
await ranges.nth(1).fill('30');
await ranges.nth(2).fill('60');
await ranges.nth(3).fill('20');
await host.page.waitForTimeout(1500);
await shot(host, '01-salon-hote');
await shot(players[1], '02-salon-invite');
const shownCount = await players[1].page.locator('.lobby__settings .setting__label b').first().innerText();
check(shownCount.trim() === String(N), `l'invité voit le réglage de l'hôte (${shownCount} joueurs)`);
await host.page.getByRole('button', { name: 'Lancer la partie' }).click();

// 4. Chacun découvre son rôle
const roles = {};
for (const p of players) {
  await p.page.getByRole('button', { name: 'Retourner la carte' }).click({ timeout: 20000 });
  await p.page.waitForTimeout(1300);
  roles[p.name] = await p.page.locator('.flip-card__name').innerText();
}
log('rôles :', roles);
const wolves = Object.values(roles).filter((r) => r === 'Loup-garou').length;
check(wolves >= 1 && wolves * 2 < N, `${wolves} loup(s) parmi ${N}`);
await shot(players[0], '03-revelation');
for (const p of players) await p.page.getByRole('button', { name: 'Je suis prêt' }).click();

// 5. Secret des rôles à l'écran : avant toute mort, chacun ne voit que son portrait (les loups : la meute)
await host.page.waitForSelector('.hud', { timeout: 20000 });
await host.page.waitForTimeout(2500);
for (const p of players) {
  const visible = await p.page.locator('.seat__portrait').count();
  const expected = roles[p.name] === 'Loup-garou' ? wolves : 1;
  check(visible === expected, `${p.name} (${roles[p.name]}) voit ${visible} rôle(s) sur la table (attendu ${expected})`);
}

// 6. Partie : chacun agit quand c'est son tour
const t0 = Date.now();
let chatSent = false;
let reloaded = false;
let shots = 0;
let votesSeen = false;
const seen = new Set();
const pick = (n) => Math.floor(Math.random() * n);

async function playTurn(p) {
  const page = p.page;
  if (await page.getByRole('button', { name: 'Voir le bilan' }).isVisible().catch(() => false)) return 'fin';
  const title = (await page.locator('.action-panel__title').first().textContent().catch(() => '')) ?? '';
  const phase = (await page.locator('.hud__phase strong').textContent().catch(() => '')) ?? '';
  const key = `${phase}|${title}`;
  if (phase.includes('vote')) votesSeen = true;
  if (!seen.has(key) && SHOTS && shots < 40) {
    seen.add(key);
    await shot(p, `10-${String(++shots).padStart(2, '0')}-${p.name}`);
  }
  const targets = page.locator('.seat.is-targetable');
  const n = await targets.count();
  const click = async (re) => page.getByRole('button', { name: re }).first().click({ timeout: 3000 }).catch(() => undefined);
  if (title.includes('Cupidon') && n >= 2) {
    await targets.nth(0).click();
    await targets.nth(1).click();
    return click(/^Unir/);
  }
  if (title.includes('Voyante') && n) {
    await targets.nth(pick(n)).click();
    return click(/^Sonder/);
  }
  if (title.includes('meute chasse') && n) {
    await targets.nth(0).click();
    return click(/^Dévorer/);
  }
  if (title.includes('Sorcière')) {
    // Elle sauve la victime (pour que la partie dure assez longtemps pour tout tester)
    const save = page.locator('.action-panel input[type=checkbox]');
    if (await save.count()) await save.first().check({ force: true }).catch(() => undefined);
    return page.locator('.action-panel .btn').last().click().catch(() => undefined);
  }
  if (title.includes('dernier tir') && n) {
    await targets.nth(pick(n)).click();
    return click(/^Tirer/);
  }
  if ((title.includes('éliminé') || title.includes('Second vote')) && n) {
    await targets.nth(pick(n)).click();
    await click(/^Voter contre/);
    return click('Confirmer le vote');
  }
  if (phase.includes('débat') && !chatSent && p !== host) {
    const input = page.locator('.chat__form input');
    if (await input.isEnabled().catch(() => false)) {
      await input.fill(`Bonjour, ici ${p.name}`);
      await input.press('Enter');
      chatSent = p.name;
    }
  }
  if (p === host) {
    const skip = page.getByRole('button', { name: /Passer au vote|Continuer/ });
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
  }
  return null;
}

let finished = false;
while (!finished && Date.now() - t0 < 12 * 60 * 1000) {
  const results = await Promise.all(players.map((p) => playTurn(p).catch(() => null)));
  finished = results.every((r) => r === 'fin');
  if (chatSent && !reloaded) {
    // Le message est-il arrivé chez les autres ?
    const other = players.find((p) => p.name !== chatSent);
    const got = await other.page
      .waitForFunction((t) => [...document.querySelectorAll('.msg__text')].some((m) => m.textContent === t), `Bonjour, ici ${chatSent}`, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check(got, `le message de ${chatSent} est arrivé chez ${other.name}`);
    // Reconnexion : un joueur recharge sa page en pleine partie
    const r = players[N - 1];
    await r.page.reload();
    const back = await r.page.waitForSelector('.hud', { timeout: 15000 }).then(() => true).catch(() => false);
    check(back, `${r.name} retrouve la partie après avoir rechargé la page`);
    reloaded = true;
  }
  await new Promise((res) => setTimeout(res, 600));
}
check(votesSeen, 'au moins un vote a eu lieu');
check(reloaded, 'le chat et la reconnexion ont été testés');
check(finished, `partie terminée chez tous les joueurs en ${Math.round((Date.now() - t0) / 1000)} s`);

// 7. Bilan identique pour tous
const banners = [];
for (const p of players) {
  await p.page.getByRole('button', { name: 'Voir le bilan' }).click().catch(() => undefined);
  await p.page.waitForSelector('.end__banner h1', { timeout: 10000 }).catch(() => undefined);
  banners.push(await p.page.locator('.end__banner h1').innerText().catch(() => '?'));
  const revealed = await p.page.locator('.roster__item').count();
  check(revealed === N, `${p.name} voit les ${N} rôles révélés en fin de partie`);
}
await shot(players[0], '20-bilan');
check(new Set(banners).size === 1, `même résultat pour tous : « ${banners[0]} »`);
for (const p of players) check(p.errors.length === 0, `${p.name} : aucune erreur dans la console ${p.errors.length ? JSON.stringify(p.errors.slice(0, 3)) : ''}`);

await browser.close();
log(failures.length ? `${failures.length} échec(s)` : 'TOUT EST VERT');
process.exit(failures.length ? 1 : 0);
