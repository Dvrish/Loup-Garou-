// Moteur de règles de la partie locale. Toutes les fonctions publiques sont pures :
// elles reçoivent un état et renvoient un nouvel état, sans rien modifier d'autre.
// À l'étape 3, ce moteur sera formalisé en machine à états et couvert de tests ;
// à l'étape 4, les mêmes contrôles seront faits côté serveur.
import { botCupidChoice, botHunterTarget, botSeerTarget, botVote, botWitchDecision, botWolfTarget, createMemory } from './bots';
import { aliveWithRole, alivePlayers, byId, human, isMixedCouple, loverOf } from './helpers';
import { planDebateChat, planWolfChat, reactToHuman, say } from './lines';
import { pick, shuffle } from './rng';
import { ROLE_ORDER, ROLES } from './roles';
import { NIGHT_PHASES, type Ctx, type DeathCause, type GameState, type Phase, type Winner } from './types';
import type { GameSettings, RoleId } from '../lib/types';

/** Temps de « réflexion » des robots quand l'humain n'a rien à faire. */
export const BOT_PAUSE = 2600;
const DAWN_MS = 8000;
const VERDICT_MS = 6000;
const HUNTER_MS = 30000;

const clone = (s: GameState): GameState => structuredClone(s);

// ---------------------------------------------------------------- création

export function createGame(opts: {
  settings: GameSettings;
  humanName: string | null;
  botNames: string[];
  ctx: Ctx;
}): GameState {
  const { settings, humanName, botNames, ctx } = opts;
  const roleList: RoleId[] = ROLE_ORDER.flatMap((r) => Array<RoleId>(settings.roles[r]).fill(r));
  while (roleList.length < settings.playerCount) roleList.push('villageois');
  const roles = shuffle(roleList.slice(0, settings.playerCount), ctx.rng);
  const names = humanName !== null ? [humanName, ...botNames] : botNames;

  const s: GameState = {
    settings,
    players: roles.map((role, i) => ({
      id: `p${i}`,
      name: names[i] ?? `Robot ${i}`,
      role,
      alive: true,
      isHuman: humanName !== null && i === 0,
    })),
    humanId: humanName !== null ? 'p0' : null,
    phase: 'attribution',
    day: 1,
    phaseEndsAt: ctx.now,
    minEndsAt: ctx.now,
    waitingHuman: false,
    humanDone: false,
    lovers: null,
    cupidChoice: [],
    wolfTarget: null,
    wolfSuggestions: {},
    witch: { life: true, death: true, saveTonight: false, killTonight: null },
    seerResults: {},
    votes: {},
    runoff: null,
    eliminatedToday: null,
    deaths: [],
    hunterQueue: [],
    hunterShot: null,
    afterHunter: 'debat',
    messages: [],
    notes: [],
    memory: {},
    announcement: 'Les rôles sont distribués…',
    winner: null,
  };
  for (const p of s.players) if (!p.isHuman) s.memory[p.id] = createMemory(s, p.id, ctx.rng);
  return s;
}

/** Fin de l'attribution : la première nuit commence. */
export function startGame(s0: GameState, ctx: Ctx): GameState {
  const s = clone(s0);
  if (s.phase !== 'attribution') return s0;
  say(s, 'Meneur', 'La nuit tombe sur Vaucombe… Fermez les yeux.', 'systeme', ctx.now);
  return startNight(s, ctx);
}

// ---------------------------------------------------------------- outils internes

function enter(s: GameState, phase: Phase, ctx: Ctx, durationMs: number, waitingHuman: boolean, minMs = 0) {
  s.phase = phase;
  s.phaseEndsAt = ctx.now + durationMs;
  s.minEndsAt = ctx.now + minMs;
  s.waitingHuman = waitingHuman;
  s.humanDone = false;
}

function humanHasRole(s: GameState, role: RoleId) {
  const h = human(s);
  return !!h && h.alive && h.role === role;
}

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

/** Tue un joueur, révèle son rôle et déclenche les effets (chasseur, amoureux). */
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
  if (lover && byId(s, lover).alive) kill(s, lover, 'chagrin');
}

function announceNewDeaths(s: GameState, from: number) {
  return s.deaths.slice(from).map((d) => deathLine(s, d.id, d.cause));
}

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

function finish(s: GameState, w: Winner, ctx: Ctx) {
  s.winner = w;
  s.phase = 'fin';
  s.phaseEndsAt = ctx.now;
  s.waitingHuman = false;
  s.announcement = WIN_TEXT[w];
  say(s, 'Meneur', s.announcement, 'systeme', ctx.now);
  return s;
}

// ---------------------------------------------------------------- nuit

const NARRATION: Record<string, string> = {
  cupidon: 'Cupidon se réveille et désigne deux amoureux…',
  voyante: 'La voyante se réveille et sonde une âme…',
  loups: 'Les loups-garous se réveillent et choisissent leur victime…',
  sorciere: 'La sorcière se réveille et contemple ses potions…',
};

const actorOf = (phase: Phase): RoleId => (phase === 'loups' ? 'loup' : (phase as RoleId));

function nightStepActive(s: GameState, phase: Phase) {
  switch (phase) {
    case 'cupidon':
      return s.day === 1 && !s.lovers && !!aliveWithRole(s, 'cupidon');
    case 'voyante':
      return !!aliveWithRole(s, 'voyante');
    case 'loups':
      return !!aliveWithRole(s, 'loup');
    case 'sorciere':
      return !!aliveWithRole(s, 'sorciere') && (s.witch.life || s.witch.death);
    default:
      return false;
  }
}

function startNight(s: GameState, ctx: Ctx) {
  s.wolfTarget = null;
  s.wolfSuggestions = {};
  s.witch.saveTonight = false;
  s.witch.killTonight = null;
  s.votes = {};
  s.runoff = null;
  s.eliminatedToday = null;
  s.cupidChoice = [];
  return nextNightStep(s, ctx, null);
}

function nextNightStep(s: GameState, ctx: Ctx, after: Phase | null): GameState {
  for (let i = after ? NIGHT_PHASES.indexOf(after) + 1 : 0; i < NIGHT_PHASES.length; i++) {
    if (nightStepActive(s, NIGHT_PHASES[i])) return startNightStep(s, ctx, NIGHT_PHASES[i]);
  }
  return resolveNight(s, ctx);
}

function wolfMajority(s: GameState, ctx: Ctx): string | null {
  const count: Record<string, number> = {};
  for (const t of Object.values(s.wolfSuggestions)) count[t] = (count[t] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(count));
  const top = Object.keys(count).filter((t) => count[t] === max && byId(s, t).alive);
  return top.length ? pick(top, ctx.rng) : null;
}

function applyWitch(s: GameState, save: boolean, killId: string | null) {
  if (save && s.witch.life && s.wolfTarget) {
    s.witch.saveTonight = true;
    s.witch.life = false;
  }
  if (killId && s.witch.death && byId(s, killId).alive) {
    s.witch.killTonight = killId;
    s.witch.death = false;
  }
}

function startNightStep(s: GameState, ctx: Ctx, phase: Phase) {
  const role = actorOf(phase);
  const humanActs = humanHasRole(s, role);
  enter(s, phase, ctx, humanActs ? s.settings.nightSeconds * 1000 : BOT_PAUSE, humanActs);
  s.announcement = NARRATION[phase];
  const bots = s.players.filter((p) => p.alive && !p.isHuman && p.role === role);
  const bot = bots[0];

  if (phase === 'cupidon' && !humanActs && bot) s.cupidChoice = botCupidChoice(s, bot.id, ctx.rng);
  if (phase === 'voyante' && !humanActs && bot) {
    const t = botSeerTarget(s, bot.id, ctx.rng);
    if (t) s.memory[bot.id].known[t] = byId(s, t).role;
  }
  if (phase === 'loups') {
    for (const b of bots) {
      const t = botWolfTarget(s, b.id, ctx.rng);
      if (t) s.wolfSuggestions[b.id] = t;
    }
    planWolfChat(s, ctx);
    if (!humanActs) s.wolfTarget = wolfMajority(s, ctx);
  }
  if (phase === 'sorciere' && !humanActs && bot) {
    const d = botWitchDecision(s, bot.id, ctx.rng);
    applyWitch(s, d.save, d.kill);
  }
  return s;
}

function resolveNight(s: GameState, ctx: Ctx) {
  const before = s.deaths.length;
  if (s.wolfTarget && !s.witch.saveTonight) kill(s, s.wolfTarget, 'loups');
  if (s.witch.killTonight) kill(s, s.witch.killTonight, 'poison');
  const lines = announceNewDeaths(s, before);
  s.announcement = `Le village se réveille. ${lines.length ? lines.join(' ') : 'Miracle : personne n’est mort cette nuit.'}`;
  say(s, 'Meneur', s.announcement, 'systeme', ctx.now);
  enter(s, 'aube', ctx, DAWN_MS, false);
  return s;
}

// ---------------------------------------------------------------- jour

function continueAfterDeaths(s: GameState, ctx: Ctx, next: 'debat' | 'nuit'): GameState {
  if (s.hunterQueue.length) {
    const hunter = byId(s, s.hunterQueue[0]);
    s.afterHunter = next;
    s.hunterShot = null;
    enter(s, 'chasseur', ctx, hunter.isHuman ? HUNTER_MS : BOT_PAUSE, hunter.isHuman);
    s.announcement = `${hunter.name}, le chasseur, rassemble ses dernières forces pour tirer…`;
    return s;
  }
  const w = checkWinner(s);
  if (w) return finish(s, w, ctx);
  if (next === 'debat') return startDebate(s, ctx);
  s.day += 1;
  say(s, 'Meneur', `La nuit ${s.day} tombe sur Vaucombe… Fermez les yeux.`, 'systeme', ctx.now);
  return startNight(s, ctx);
}

function startDebate(s: GameState, ctx: Ctx) {
  const ms = human(s)?.alive ? s.settings.daySeconds * 1000 : 10000;
  enter(s, 'debat', ctx, ms, false);
  s.announcement = `Jour ${s.day} : le village débat. Qui sont les loups ?`;
  planDebateChat(s, ctx, Math.min(ms * 0.7, 60000));
  return s;
}

function startVote(s: GameState, ctx: Ctx, runoff: string[] | null) {
  s.runoff = runoff;
  s.votes = {};
  const candidates = runoff ?? alivePlayers(s).map((p) => p.id);
  const voteMs = s.settings.voteSeconds * 1000;
  const window = Math.min(voteMs * 0.5, 9000);
  let last = ctx.now;
  for (const bot of alivePlayers(s).filter((p) => !p.isHuman)) {
    const at = ctx.now + 800 + ctx.rng() * window;
    s.votes[bot.id] = { target: botVote(s, bot.id, candidates, ctx.rng), at };
    last = Math.max(last, at);
  }
  const humanVotes = !!human(s)?.alive;
  enter(s, 'vote', ctx, humanVotes ? voteMs : Math.min(voteMs, last - ctx.now + 1500), humanVotes, last - ctx.now + 600);
  s.announcement = runoff
    ? `Égalité ! Second vote entre ${runoff.map((id) => byId(s, id).name).join(' et ')}.`
    : 'Le village vote. Qui doit être éliminé ?';
  return s;
}

function resolveVote(s: GameState, ctx: Ctx) {
  const tally: Record<string, number> = {};
  const plain: Record<string, string> = {};
  for (const [voter, v] of Object.entries(s.votes)) {
    if (!byId(s, voter).alive || v.target === 'abstention' || !byId(s, v.target).alive) continue;
    if (s.runoff && !s.runoff.includes(v.target)) continue;
    tally[v.target] = (tally[v.target] ?? 0) + 1;
    plain[voter] = v.target;
  }
  const max = Math.max(0, ...Object.values(tally));
  const top = max ? Object.keys(tally).filter((id) => tally[id] === max) : [];
  const summary = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${byId(s, id).name} (${n})`)
    .join(', ');

  let eliminated: string | null = null;
  let tieText = '';
  if (top.length === 1) eliminated = top[0];
  else if (top.length > 1) {
    if (s.settings.tieRule === 'hasard') {
      eliminated = pick(top, ctx.rng);
      tieText = 'Égalité : le sort a tranché. ';
    } else if (s.settings.tieRule === 'revote' && !s.runoff) {
      say(s, 'Meneur', `Votes : ${summary}. Égalité, un second vote départage les ex æquo.`, 'systeme', ctx.now);
      return startVote(s, ctx, top);
    } else tieText = 'Égalité : personne n’est éliminé. ';
  }

  const before = s.deaths.length;
  s.eliminatedToday = eliminated;
  if (eliminated) kill(s, eliminated, 'vote', plain);
  const lines = announceNewDeaths(s, before);
  s.announcement = `${summary ? `Votes : ${summary}. ` : 'Aucun vote. '}${tieText}${
    lines.length ? lines.join(' ') : eliminated ? '' : 'Le village n’élimine personne aujourd’hui.'
  }`.trim();
  say(s, 'Meneur', s.announcement, 'systeme', ctx.now);
  enter(s, 'verdict', ctx, VERDICT_MS, false);
  return s;
}

// ---------------------------------------------------------------- avancer le temps

/** La phase peut-elle se terminer maintenant ? */
export function canEnd(s: GameState, now: number) {
  if (s.phase === 'attribution' || s.phase === 'fin') return false;
  if (now >= s.phaseEndsAt) return true;
  return s.waitingHuman && s.humanDone && now >= s.minEndsAt;
}

/** Termine la phase en cours (chrono écoulé ou tout le monde a agi) et passe à la suivante. */
export function endPhase(s0: GameState, ctx: Ctx): GameState {
  const s = clone(s0);
  switch (s.phase) {
    case 'cupidon': {
      if (s.cupidChoice.length !== 2) s.cupidChoice = shuffle(alivePlayers(s), ctx.rng).slice(0, 2).map((p) => p.id);
      const [a, b] = s.cupidChoice;
      s.lovers = [a, b];
      const h = human(s);
      const partner = h ? loverOf(s, h.id) : null;
      if (partner)
        s.notes.push({
          at: ctx.now,
          text: `Une flèche de Cupidon vous lie à ${byId(s, partner).name} (${roleName(s, partner)}). Si l’un de vous meurt, l’autre meurt de chagrin.`,
        });
      return nextNightStep(s, ctx, 'cupidon');
    }
    case 'voyante':
      return nextNightStep(s, ctx, 'voyante');
    case 'loups':
      if (!s.wolfTarget) s.wolfTarget = wolfMajority(s, ctx);
      return nextNightStep(s, ctx, 'loups');
    case 'sorciere':
      return resolveNight(s, ctx);
    case 'aube':
      return continueAfterDeaths(s, ctx, 'debat');
    case 'chasseur': {
      const hunter = byId(s, s.hunterQueue.shift()!);
      let target = s.hunterShot;
      if (!target && !hunter.isHuman) target = botHunterTarget(s, hunter.id, ctx.rng);
      const before = s.deaths.length;
      if (target && byId(s, target).alive) kill(s, target, 'chasseur');
      const lines = announceNewDeaths(s, before);
      say(s, 'Meneur', lines.length ? `${hunter.name} tire une dernière fois. ${lines.join(' ')}` : `${hunter.name} meurt sans tirer.`, 'systeme', ctx.now);
      s.hunterShot = null;
      return continueAfterDeaths(s, ctx, s.afterHunter);
    }
    case 'debat':
      return startVote(s, ctx, null);
    case 'vote':
      return resolveVote(s, ctx);
    case 'verdict':
      return continueAfterDeaths(s, ctx, 'nuit');
    default:
      return s0;
  }
}

// ---------------------------------------------------------------- actions du joueur humain

export type HumanAction =
  | { type: 'cupidon'; targets: [string, string] }
  | { type: 'voyante'; target: string }
  | { type: 'loups'; target: string }
  | { type: 'sorciere'; save: boolean; kill: string | null }
  | { type: 'chasseur'; target: string | null }
  | { type: 'vote'; target: string | 'abstention' }
  | { type: 'chat'; channel: 'public' | 'loups'; text: string }
  | { type: 'passer' };

export const isNight = (phase: Phase) => NIGHT_PHASES.includes(phase);

/** Applique une action du joueur humain si elle est autorisée ; sinon renvoie l'état inchangé. */
export function act(s0: GameState, action: HumanAction, ctx: Ctx): GameState {
  const h = human(s0);
  if (!h) return s0;
  const valid = (id: string | null) => !!id && s0.players.some((p) => p.id === id && p.alive);
  const s = clone(s0);
  const canAct = (phase: Phase) => s.phase === phase && s.waitingHuman && !s.humanDone;

  switch (action.type) {
    case 'cupidon': {
      const [a, b] = action.targets;
      if (!canAct('cupidon') || a === b || !valid(a) || !valid(b)) return s0;
      s.cupidChoice = [a, b];
      break;
    }
    case 'voyante': {
      if (!canAct('voyante') || action.target === h.id || !valid(action.target)) return s0;
      const role = byId(s, action.target).role;
      s.seerResults[action.target] = role;
      s.notes.push({ at: ctx.now, text: `Votre vision : ${byId(s, action.target).name} est ${ROLES[role].name}.` });
      break;
    }
    case 'loups': {
      if (!canAct('loups') || !valid(action.target) || byId(s, action.target).role === 'loup') return s0;
      s.wolfTarget = action.target;
      say(s, h.name, `Je choisis ${byId(s, action.target).name}.`, 'loups', ctx.now);
      break;
    }
    case 'sorciere': {
      if (!canAct('sorciere')) return s0;
      if (action.kill && (!valid(action.kill) || action.kill === h.id)) return s0;
      applyWitch(s, action.save, action.kill);
      break;
    }
    case 'chasseur': {
      if (s.phase !== 'chasseur' || s.hunterQueue[0] !== h.id || s.humanDone) return s0;
      if (action.target && (!valid(action.target) || action.target === h.id)) return s0;
      s.hunterShot = action.target;
      break;
    }
    case 'vote': {
      if (!canAct('vote') || !h.alive) return s0;
      if (action.target === 'abstention') {
        if (!s.settings.allowAbstain) return s0;
      } else if (action.target === h.id || !valid(action.target) || (s.runoff && !s.runoff.includes(action.target))) return s0;
      s.votes[h.id] = { target: action.target, at: ctx.now };
      break;
    }
    case 'chat': {
      const text = action.text.trim().slice(0, 240);
      if (!text || !h.alive || s.settings.discussionMode !== 'chat') return s0;
      if (action.channel === 'public' && !['aube', 'chasseur', 'debat', 'vote', 'verdict'].includes(s.phase)) return s0;
      if (action.channel === 'loups' && (h.role !== 'loup' || !isNight(s.phase))) return s0;
      say(s, h.name, text, action.channel, ctx.now);
      reactToHuman(s, ctx, action.channel, text);
      return s; // un message ne termine pas la phase
    }
    case 'passer': {
      if (!['aube', 'debat', 'verdict'].includes(s.phase)) return s0;
      s.phaseEndsAt = ctx.now;
      return s;
    }
  }
  s.humanDone = true;
  return s;
}
