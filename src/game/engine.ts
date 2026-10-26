// Moteur de jeu : une machine à états explicite, en TypeScript pur.
//
// - Toutes les fonctions publiques sont pures : elles reçoivent un état et un événement
//   et renvoient un nouvel état, sans rien modifier d'autre.
// - Le hasard est tiré d'une graine stockée dans l'état : même état + mêmes événements
//   ⇒ exactement la même partie (utile pour les tests, et plus tard pour le serveur).
// - Chaque changement de phase passe par `goto`, qui refuse toute transition absente
//   de la table TRANSITIONS. Le schéma est dans docs/machine-a-etats.md.
import { botCupidChoice, botHunterTarget, botSeerTarget, botVote, botWitchDecision, botWolfTarget, createMemory } from './bots';
import { aliveWithRole, alivePlayers, byId, findPlayer, isAlive, isMixedCouple, loverOf } from './helpers';
import { planDebateChat, planWolfChat, reactToHuman, say } from './lines';
import { pick, rand, shuffle } from './rng';
import { ROLE_ORDER, ROLES } from './roles';
import {
  NIGHT_PHASES,
  TRANSIENT_PHASES,
  type DeathCause,
  type GameEvent,
  type GameState,
  type Phase,
  type PlayerAction,
  type Winner,
} from './types';
import type { GameSettings, RoleId } from '../lib/types';

/** Temps de « réflexion » des robots quand aucun humain n'a à agir. */
export const BOT_PAUSE = 2600;
export const DAWN_MS = 8000;
export const VERDICT_MS = 6000;
export const HUNTER_MS = 30000;
/** Durée du débat quand plus aucun humain n'est en vie. */
export const SPECTATOR_DEBATE_MS = 10000;
export const MAX_CHAT_LENGTH = 240;

// ================================================================ table des transitions

export const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  lobby: ['attribution'],
  attribution: ['cupidon', 'voyante', 'loups'],
  cupidon: ['voyante', 'loups'],
  voyante: ['loups'],
  loups: ['sorciere', 'resolution-nuit'],
  sorciere: ['resolution-nuit'],
  'resolution-nuit': ['aube'],
  aube: ['chasseur', 'verification'],
  chasseur: ['chasseur', 'verification'],
  verification: ['debat', 'voyante', 'loups', 'fin'],
  debat: ['vote'],
  vote: ['resolution-vote'],
  'resolution-vote': ['vote', 'verdict'],
  verdict: ['chasseur', 'verification'],
  fin: [],
};

export const isNight = (phase: Phase) => (NIGHT_PHASES as readonly Phase[]).includes(phase);
const DAY_CHAT_PHASES: Phase[] = ['aube', 'chasseur', 'debat', 'vote', 'verdict'];
const SKIPPABLE: Phase[] = ['aube', 'debat', 'verdict'];

function goto(s: GameState, to: Phase, now: number) {
  if (!TRANSITIONS[s.phase].includes(to)) throw new Error(`Transition interdite : ${s.phase} → ${to}`);
  s.history.push({ from: s.phase, to, day: s.day, at: now });
  s.phase = to;
}

/** Installe une phase « avec chrono » : durée, joueurs attendus, durée minimale. */
function rest(s: GameState, now: number, durationMs: number, pending: string[], minMs = 0) {
  s.phaseEndsAt = now + durationMs;
  s.minEndsAt = now + minMs;
  s.pending = pending;
  s.done = [];
}

const clone = (s: GameState): GameState => structuredClone(s);
const rngOf = (s: GameState) => () => rand(s);

// ================================================================ réglages et création

/** Problèmes empêchant de lancer une partie avec ces réglages (liste vide = tout va bien). */
export function settingsProblems(settings: GameSettings): string[] {
  const problems: string[] = [];
  const total = ROLE_ORDER.reduce((sum, r) => sum + settings.roles[r], 0);
  const wolves = settings.roles.loup;
  if (settings.playerCount < 6 || settings.playerCount > 16) problems.push('Il faut entre 6 et 16 joueurs.');
  if (total !== settings.playerCount) problems.push(`Il y a ${total} rôle(s) pour ${settings.playerCount} joueurs.`);
  if (wolves < 1) problems.push('Il faut au moins un loup-garou.');
  if (wolves * 2 >= settings.playerCount) problems.push('Trop de loups : ils doivent être moins de la moitié.');
  for (const r of ['voyante', 'sorciere', 'chasseur', 'cupidon'] as const) {
    if (settings.roles[r] > 1) problems.push(`Le rôle ${ROLES[r].name} ne peut être présent qu’une fois.`);
  }
  return problems;
}

export function createGame(opts: {
  settings: GameSettings;
  /** Pseudos des joueurs humains (le premier est l'hôte). */
  humans: string[];
  botNames: string[];
  seed: number;
  now: number;
}): GameState {
  const { settings, humans, botNames, now } = opts;
  const problems = settingsProblems(settings);
  if (problems.length) throw new Error(problems[0]);
  if (humans.length > settings.playerCount) throw new Error('Plus de joueurs humains que de places.');

  const s: GameState = {
    settings,
    players: [],
    hostId: humans.length ? 'p0' : null,
    seed: opts.seed >>> 0,
    phase: 'lobby',
    day: 1,
    phaseEndsAt: now,
    minEndsAt: now,
    pending: [],
    done: [],
    lovers: null,
    cupidChoice: null,
    wolfVotes: {},
    wolfTarget: null,
    witch: { life: true, death: true, saveTonight: false, killTonight: null },
    seerResults: {},
    votes: {},
    runoff: null,
    eliminatedToday: null,
    deaths: [],
    hunterQueue: [],
    hunterShot: null,
    afterVerification: 'debat',
    messages: [],
    notes: [],
    memory: {},
    announcement: 'Les rôles sont distribués…',
    winner: null,
    history: [],
  };

  const roleList: RoleId[] = ROLE_ORDER.flatMap((r) => Array<RoleId>(settings.roles[r]).fill(r));
  const roles = shuffle(roleList, rngOf(s));
  const names = [...humans, ...botNames];
  s.players = roles.map((role, i) => ({
    id: `p${i}`,
    name: names[i] ?? `Robot ${i}`,
    role,
    alive: true,
    isHuman: i < humans.length,
  }));
  for (const p of s.players) if (!p.isHuman) s.memory[p.id] = createMemory(s, p.id, rngOf(s));
  goto(s, 'attribution', now);
  return s;
}

// ================================================================ morts et victoire

const roleName = (s: GameState, id: string) => ROLES[byId(s, id).role].name;

function deathLine(s: GameState, id: string, cause: DeathCause) {
  const name = byId(s, id).name;
  const role = roleName(s, id);
  switch (cause) {
    case 'loups':
      return `Les loups ont emporté ${name}. Son rôle : ${role}.`;
    case 'poison':
      return `${name} a succombé à un poison mystérieux. Son rôle : ${role}.`;
    case 'vote':
      return `Le village a éliminé ${name}. Son rôle : ${role}.`;
    case 'chagrin':
      return `Le cœur brisé, ${name} rejoint l’être aimé dans la mort. Son rôle : ${role}.`;
    case 'chasseur':
      return `La balle du chasseur atteint ${name}. Son rôle : ${role}.`;
  }
}

/** Tue un joueur, révèle son rôle à tous et déclenche les effets (chasseur, amoureux). */
function kill(s: GameState, id: string, cause: DeathCause, votes: Record<string, string> = {}) {
  const p = byId(s, id);
  if (!p.alive) return;
  p.alive = false;
  s.deaths.push({ id, cause, day: s.day });
  for (const [botId, mem] of Object.entries(s.memory)) {
    mem.known[id] = p.role;
    if (byId(s, botId).role === 'loup') continue;
    // Ceux qui ont voté contre un innocent deviennent suspects ; contre un loup, rassurants.
    for (const [voter, target] of Object.entries(votes)) {
      if (target !== id || voter === botId) continue;
      mem.suspicion[voter] = (mem.suspicion[voter] ?? 0) + (p.role === 'loup' ? -1 : 1.2);
    }
  }
  if (p.role === 'chasseur') s.hunterQueue.push(id);
  const lover = loverOf(s, id);
  if (lover && isAlive(s, lover)) kill(s, lover, 'chagrin');
}

const newDeathLines = (s: GameState, from: number) => s.deaths.slice(from).map((d) => deathLine(s, d.id, d.cause));

export function checkWinner(s: GameState): Winner | null {
  const alive = alivePlayers(s);
  if (!alive.length) return 'aucun';
  if (s.lovers && alive.length === 2 && isMixedCouple(s) && alive.every((p) => s.lovers!.includes(p.id))) return 'amoureux';
  const wolves = alive.filter((p) => p.role === 'loup').length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'loups';
  return null;
}

const WIN_TEXT: Record<Winner, string> = {
  village: 'Le dernier loup est tombé : le village de Vaucombe est sauvé !',
  loups: 'Les loups sont maintenant aussi nombreux que les villageois : la meute a gagné.',
  amoureux: 'Seuls les deux amoureux ont survécu : l’amour triomphe de tout !',
  aucun: 'Plus personne ne respire à Vaucombe…',
};

// ================================================================ nuit

const NARRATION: Record<(typeof NIGHT_PHASES)[number], string> = {
  cupidon: 'Cupidon se réveille et désigne deux amoureux…',
  voyante: 'La voyante se réveille et sonde une âme…',
  loups: 'Les loups-garous se réveillent et choisissent leur victime…',
  sorciere: 'La sorcière se réveille et contemple ses potions…',
};

const ACTOR: Record<(typeof NIGHT_PHASES)[number], RoleId> = {
  cupidon: 'cupidon',
  voyante: 'voyante',
  loups: 'loup',
  sorciere: 'sorciere',
};

function nightStepActive(s: GameState, phase: (typeof NIGHT_PHASES)[number]) {
  const someone = aliveWithRole(s, ACTOR[phase]).length > 0;
  if (phase === 'cupidon') return someone && s.day === 1 && !s.lovers;
  if (phase === 'sorciere') return someone && (s.witch.life || s.witch.death);
  return someone;
}

function startNight(s: GameState, now: number) {
  s.wolfVotes = {};
  s.wolfTarget = null;
  s.witch.saveTonight = false;
  s.witch.killTonight = null;
  s.votes = {};
  s.runoff = null;
  s.eliminatedToday = null;
  s.cupidChoice = null;
  s.hunterShot = null;
  return nextNightStep(s, now, null);
}

function nextNightStep(s: GameState, now: number, after: (typeof NIGHT_PHASES)[number] | null): GameState {
  for (let i = after ? NIGHT_PHASES.indexOf(after) + 1 : 0; i < NIGHT_PHASES.length; i++) {
    if (nightStepActive(s, NIGHT_PHASES[i])) return enterNightStep(s, now, NIGHT_PHASES[i]);
  }
  return resolveNight(s, now);
}

function enterNightStep(s: GameState, now: number, phase: (typeof NIGHT_PHASES)[number]) {
  goto(s, phase, now);
  const actors = aliveWithRole(s, ACTOR[phase]);
  const humans = actors.filter((p) => p.isHuman).map((p) => p.id);
  const bots = actors.filter((p) => !p.isHuman);
  const rng = rngOf(s);
  rest(s, now, humans.length ? s.settings.nightSeconds * 1000 : BOT_PAUSE, humans);
  s.announcement = NARRATION[phase];

  if (phase === 'cupidon' && bots[0]) s.cupidChoice = botCupidChoice(s, bots[0].id, rng);
  if (phase === 'voyante' && bots[0]) {
    const t = botSeerTarget(s, bots[0].id, rng);
    if (t) s.memory[bots[0].id].known[t] = byId(s, t).role;
  }
  if (phase === 'loups') {
    for (const b of bots) {
      const t = botWolfTarget(s, b.id, rng);
      if (t) s.wolfVotes[b.id] = t;
    }
    if (s.settings.discussionMode === 'chat') planWolfChat(s, now, rng);
  }
  if (phase === 'sorciere' && bots[0]) {
    const d = botWitchDecision(s, bots[0].id, rng);
    applyWitch(s, d.save, d.kill);
  }
  return s;
}

/** Victime de la meute : le choix le plus fréquent parmi les loups vivants (tirage en cas d'égalité). */
function wolfMajority(s: GameState): string | null {
  const count: Record<string, number> = {};
  for (const [wolf, target] of Object.entries(s.wolfVotes)) {
    if (!isAlive(s, wolf) || !isAlive(s, target) || byId(s, target).role === 'loup') continue;
    count[target] = (count[target] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(count));
  const top = Object.keys(count).filter((t) => count[t] === max);
  return top.length ? pick(top, rngOf(s)) : null;
}

function applyWitch(s: GameState, save: boolean, killId: string | null) {
  if (save && s.witch.life && s.wolfTarget) {
    s.witch.saveTonight = true;
    s.witch.life = false;
  }
  if (killId && s.witch.death && isAlive(s, killId)) {
    s.witch.killTonight = killId;
    s.witch.death = false;
  }
}

function endNightStep(s: GameState, now: number, phase: (typeof NIGHT_PHASES)[number]) {
  if (phase === 'cupidon') {
    const choice = s.cupidChoice ?? (shuffle(alivePlayers(s), rngOf(s)).slice(0, 2).map((p) => p.id) as [string, string]);
    s.lovers = choice;
    const [a, b] = choice;
    for (const [me, other] of [
      [a, b],
      [b, a],
    ]) {
      if (byId(s, me).isHuman)
        s.notes.push({
          playerId: me,
          at: now,
          text: `Une flèche de Cupidon vous lie à ${byId(s, other).name} (${roleName(s, other)}). Si l’un de vous meurt, l’autre meurt de chagrin.`,
        });
    }
    const cupid = aliveWithRole(s, 'cupidon')[0];
    if (cupid?.isHuman) s.notes.push({ playerId: cupid.id, at: now, text: `Vous avez uni ${byId(s, a).name} et ${byId(s, b).name}.` });
  }
  if (phase === 'loups') s.wolfTarget = wolfMajority(s);
  if (phase === 'sorciere') return resolveNight(s, now);
  return nextNightStep(s, now, phase);
}

function resolveNight(s: GameState, now: number) {
  goto(s, 'resolution-nuit', now);
  const before = s.deaths.length;
  if (s.wolfTarget && !s.witch.saveTonight) kill(s, s.wolfTarget, 'loups');
  if (s.witch.killTonight) kill(s, s.witch.killTonight, 'poison');
  const lines = newDeathLines(s, before);
  s.announcement = `Le village se réveille. ${lines.length ? lines.join(' ') : 'Miracle : personne n’est mort cette nuit.'}`;
  say(s, 'Meneur', s.announcement, 'systeme', now);
  goto(s, 'aube', now);
  rest(s, now, DAWN_MS, []);
  s.afterVerification = 'debat';
  return s;
}

// ================================================================ chasseur et vérification

function afterDeaths(s: GameState, now: number): GameState {
  if (s.hunterQueue.length) {
    const hunter = byId(s, s.hunterQueue[0]);
    goto(s, 'chasseur', now);
    s.hunterShot = null;
    rest(s, now, hunter.isHuman ? HUNTER_MS : BOT_PAUSE, hunter.isHuman ? [hunter.id] : []);
    s.announcement = `${hunter.name}, le chasseur, rassemble ses dernières forces pour tirer…`;
    return s;
  }
  return verify(s, now);
}

function endHunter(s: GameState, now: number) {
  const hunter = byId(s, s.hunterQueue.shift()!);
  let target = s.hunterShot;
  if (!hunter.isHuman) target = botHunterTarget(s, hunter.id, rngOf(s));
  const before = s.deaths.length;
  if (target && isAlive(s, target)) kill(s, target, 'chasseur');
  const lines = newDeathLines(s, before);
  say(s, 'Meneur', lines.length ? `${hunter.name} tire une dernière fois. ${lines.join(' ')}` : `${hunter.name} meurt sans tirer.`, 'systeme', now);
  s.hunterShot = null;
  return afterDeaths(s, now);
}

function verify(s: GameState, now: number): GameState {
  goto(s, 'verification', now);
  const w = checkWinner(s);
  if (w) {
    goto(s, 'fin', now);
    s.winner = w;
    rest(s, now, 0, []);
    s.announcement = WIN_TEXT[w];
    say(s, 'Meneur', s.announcement, 'systeme', now);
    return s;
  }
  if (s.afterVerification === 'debat') return enterDebate(s, now);
  s.day += 1;
  say(s, 'Meneur', `La nuit ${s.day} tombe sur Vaucombe… Fermez les yeux.`, 'systeme', now);
  return startNight(s, now);
}

// ================================================================ jour

const aliveHumans = (s: GameState) => alivePlayers(s).filter((p) => p.isHuman);

function enterDebate(s: GameState, now: number) {
  goto(s, 'debat', now);
  const ms = aliveHumans(s).length ? s.settings.daySeconds * 1000 : SPECTATOR_DEBATE_MS;
  rest(s, now, ms, []);
  s.announcement = `Jour ${s.day} : le village débat. Qui sont les loups ?`;
  planDebateChat(s, now, rngOf(s), Math.min(ms * 0.7, 60000));
  return s;
}

function enterVote(s: GameState, now: number, runoff: string[] | null) {
  goto(s, 'vote', now);
  s.runoff = runoff;
  s.votes = {};
  const candidates = runoff ?? alivePlayers(s).map((p) => p.id);
  const voteMs = s.settings.voteSeconds * 1000;
  const window = Math.min(voteMs * 0.5, 9000);
  const rng = rngOf(s);
  let last = now;
  for (const bot of alivePlayers(s).filter((p) => !p.isHuman)) {
    const at = Math.round(now + 800 + rng() * window);
    s.votes[bot.id] = { target: botVote(s, bot.id, candidates, rng), at };
    last = Math.max(last, at);
  }
  const humans = aliveHumans(s).map((p) => p.id);
  rest(s, now, humans.length ? voteMs : Math.min(voteMs, last - now + 1500), humans, last - now + 600);
  s.announcement = runoff
    ? `Égalité ! Second vote entre ${runoff.map((id) => byId(s, id).name).join(' et ')}.`
    : 'Le village vote. Qui doit être éliminé ?';
  return s;
}

/** Décompte des voix valides (votants vivants, cibles vivantes, candidats du second tour). */
export function tally(s: GameState) {
  const count: Record<string, number> = {};
  const valid: Record<string, string> = {};
  for (const [voter, v] of Object.entries(s.votes)) {
    if (!isAlive(s, voter) || v.target === 'abstention' || !isAlive(s, v.target)) continue;
    if (s.runoff && !s.runoff.includes(v.target)) continue;
    count[v.target] = (count[v.target] ?? 0) + 1;
    valid[voter] = v.target;
  }
  return { count, valid };
}

function resolveVote(s: GameState, now: number) {
  goto(s, 'resolution-vote', now);
  const { count, valid } = tally(s);
  const max = Math.max(0, ...Object.values(count));
  const top = max ? Object.keys(count).filter((id) => count[id] === max) : [];
  const summary = Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${byId(s, id).name} (${n})`)
    .join(', ');

  let eliminated: string | null = null;
  let tieText = '';
  if (top.length === 1) eliminated = top[0];
  else if (top.length > 1) {
    if (s.settings.tieRule === 'hasard') {
      eliminated = pick(top, rngOf(s));
      tieText = 'Égalité : le sort a tranché. ';
    } else if (s.settings.tieRule === 'revote' && !s.runoff) {
      say(s, 'Meneur', `Votes : ${summary}. Égalité, un second vote départage les ex æquo.`, 'systeme', now);
      return enterVote(s, now, top);
    } else tieText = 'Égalité : personne n’est éliminé. ';
  }

  const before = s.deaths.length;
  s.eliminatedToday = eliminated;
  if (eliminated) kill(s, eliminated, 'vote', valid);
  const lines = newDeathLines(s, before);
  s.announcement = `${summary ? `Votes : ${summary}. ` : 'Aucun vote. '}${tieText}${
    lines.length ? lines.join(' ') : eliminated ? '' : 'Le village n’élimine personne aujourd’hui.'
  }`.trim();
  say(s, 'Meneur', s.announcement, 'systeme', now);
  goto(s, 'verdict', now);
  rest(s, now, VERDICT_MS, []);
  s.afterVerification = 'nuit';
  return s;
}

// ================================================================ temps qui passe

/** La phase courante peut-elle se terminer à l'heure `now` ? */
export function canEnd(s: GameState, now: number) {
  if (s.phase === 'attribution' || s.phase === 'fin' || TRANSIENT_PHASES.includes(s.phase)) return false;
  if (now >= s.phaseEndsAt) return true;
  return s.pending.length > 0 && s.pending.every((id) => s.done.includes(id)) && now >= s.minEndsAt;
}

function endPhase(s: GameState, now: number): GameState {
  switch (s.phase) {
    case 'cupidon':
    case 'voyante':
    case 'loups':
    case 'sorciere':
      return endNightStep(s, now, s.phase);
    case 'aube':
    case 'verdict':
      return afterDeaths(s, now);
    case 'chasseur':
      return endHunter(s, now);
    case 'debat':
      return enterVote(s, now, null);
    case 'vote':
      return resolveVote(s, now);
    default:
      return s;
  }
}

// ================================================================ actions des joueurs

/** Vérifie qu'une action est permise. Renvoie la raison du refus, ou null si elle est valide. */
export function validateAction(s: GameState, playerId: string, action: PlayerAction): string | null {
  const p = findPlayer(s, playerId);
  if (!p) return 'Joueur inconnu.';
  if (!p.isHuman) return 'Ce joueur est un robot.';
  if (s.phase === 'fin') return 'La partie est terminée.';
  const myTurn = (phase: Phase) => s.phase === phase && s.pending.includes(playerId) && !s.done.includes(playerId);
  const NOT_YOUR_TURN = 'Ce n’est pas à vous d’agir maintenant.';
  const alive = (id: string | null) => isAlive(s, id);

  switch (action.type) {
    case 'cupidon': {
      if (!myTurn('cupidon')) return NOT_YOUR_TURN;
      const [a, b] = action.targets;
      if (a === b) return 'Choisissez deux joueurs différents.';
      if (!alive(a) || !alive(b)) return 'Les amoureux doivent être vivants.';
      return null;
    }
    case 'voyante':
      if (!myTurn('voyante')) return NOT_YOUR_TURN;
      if (action.target === playerId) return 'Vous connaissez déjà votre rôle.';
      if (!alive(action.target)) return 'Ce joueur n’est pas en vie.';
      return null;
    case 'loups':
      if (!myTurn('loups')) return NOT_YOUR_TURN;
      if (!alive(action.target)) return 'Ce joueur n’est pas en vie.';
      if (byId(s, action.target).role === 'loup') return 'Un loup ne peut pas dévorer un autre loup.';
      return null;
    case 'sorciere':
      if (!myTurn('sorciere')) return NOT_YOUR_TURN;
      if (action.save && !s.witch.life) return 'La potion de vie est déjà utilisée.';
      if (action.save && !s.wolfTarget) return 'Personne n’est à sauver cette nuit.';
      if (action.kill) {
        if (!s.witch.death) return 'La potion de mort est déjà utilisée.';
        if (action.kill === playerId) return 'Vous ne pouvez pas vous empoisonner.';
        if (!alive(action.kill)) return 'Ce joueur n’est pas en vie.';
      }
      return null;
    case 'chasseur':
      if (!myTurn('chasseur')) return NOT_YOUR_TURN;
      if (action.target && (action.target === playerId || !alive(action.target))) return 'Cible invalide.';
      return null;
    case 'vote':
      if (!myTurn('vote')) return NOT_YOUR_TURN;
      if (action.target === 'abstention') return s.settings.allowAbstain ? null : 'L’abstention n’est pas autorisée.';
      if (action.target === playerId) return 'Vous ne pouvez pas voter contre vous-même.';
      if (!alive(action.target)) return 'Ce joueur n’est pas en vie.';
      if (s.runoff && !s.runoff.includes(action.target)) return 'Ce second vote ne concerne que les ex æquo.';
      return null;
    case 'chat': {
      const text = action.text.trim();
      if (!p.alive) return 'Les morts ne parlent pas.';
      if (s.settings.discussionMode !== 'chat') return 'Pas de chat en mode « même pièce ».';
      if (!text) return 'Message vide.';
      if (text.length > MAX_CHAT_LENGTH) return 'Message trop long.';
      if (action.channel === 'public' && !DAY_CHAT_PHASES.includes(s.phase)) return 'Le village dort : silence.';
      if (action.channel === 'loups' && (p.role !== 'loup' || !isNight(s.phase))) return 'Seule la meute parle la nuit.';
      return null;
    }
    case 'passer':
      if (playerId !== s.hostId) return 'Seul l’hôte peut passer cette étape.';
      if (!SKIPPABLE.includes(s.phase)) return 'Cette étape ne peut pas être passée.';
      return null;
  }
}

function perform(s: GameState, playerId: string, action: PlayerAction, now: number) {
  const me = byId(s, playerId);
  const done = () => s.done.push(playerId);
  switch (action.type) {
    case 'cupidon':
      s.cupidChoice = action.targets;
      return done();
    case 'voyante': {
      const role = byId(s, action.target).role;
      s.seerResults[action.target] = role;
      s.notes.push({ playerId, at: now, text: `Votre vision : ${byId(s, action.target).name} est ${ROLES[role].name}.` });
      return done();
    }
    case 'loups':
      s.wolfVotes[playerId] = action.target;
      // Les loups-robots se rallient au choix des humains de la meute.
      for (const w of aliveWithRole(s, 'loup')) if (!w.isHuman) s.wolfVotes[w.id] = action.target;
      if (s.settings.discussionMode === 'chat') say(s, me.name, `Je choisis ${byId(s, action.target).name}.`, 'loups', now);
      return done();
    case 'sorciere':
      applyWitch(s, action.save, action.kill);
      return done();
    case 'chasseur':
      s.hunterShot = action.target;
      return done();
    case 'vote':
      s.votes[playerId] = { target: action.target, at: now };
      return done();
    case 'chat': {
      const text = action.text.trim();
      say(s, me.name, text, action.channel, now);
      reactToHuman(s, now, rngOf(s), playerId, action.channel, text);
      return;
    }
    case 'passer':
      s.phaseEndsAt = now;
      return;
  }
}

// ================================================================ point d'entrée unique

/** Fait évoluer la partie. Un événement refusé ou sans effet renvoie l'état tel quel. */
export function applyEvent(s0: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'demarrer': {
      if (s0.phase !== 'attribution') return s0;
      const s = clone(s0);
      say(s, 'Meneur', 'La nuit tombe sur Vaucombe… Fermez les yeux.', 'systeme', event.now);
      return startNight(s, event.now);
    }
    case 'tic':
      return canEnd(s0, event.now) ? endPhase(clone(s0), event.now) : s0;
    case 'action': {
      if (validateAction(s0, event.playerId, event.action)) return s0;
      const s = clone(s0);
      perform(s, event.playerId, event.action, event.now);
      return s;
    }
  }
}
