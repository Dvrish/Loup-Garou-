// Ce que disent les robots dans le chat. Chaque phrase a aussi un effet sur les soupçons.
import { pick } from './rng';
import { alivePlayers, byId, isWolf, loverOf } from './helpers';
import { publicSuspicion, spreadSuspicion } from './bots';
import type { Ctx, GameState } from './types';

const ACCUSE = [
  '{x}, tu es bien silencieux depuis ce matin…',
  'Je ne sens pas {x}. Vraiment pas.',
  'Moi je vote {x}, son histoire ne tient pas debout.',
  "{x} a hésité quand on a parlé des loups, vous l'avez vu ?",
  "J'ai vu {x} rôder près de la forêt hier soir.",
];
const DEFEND = [
  'Je suis innocent, je vous le jure !',
  "Pourquoi tout le monde me regarde ? Je n'ai rien fait.",
  'Vous faites fausse route, cherchez ailleurs.',
];
const FILLER = [
  "Quelqu'un a entendu quelque chose cette nuit ?",
  'Restons calmes et réfléchissons.',
  'Les loups sont parmi nous, ne votons pas au hasard.',
  "J'ai mal dormi… ces hurlements…",
];
const MOURN = ['Pauvre {x}… Qui a pu faire ça ?', 'Pas {x} ! Le village a perdu quelqu’un de bien.'];
const WOLF_SUGGEST = ['Je propose {x}.', 'On prend {x} cette nuit ?', '{x} commence à nous soupçonner. Il faut l’arrêter.'];
const REPLY_ACCUSED = ['Moi ? Tu te trompes de cible.', "C'est facile d'accuser les autres…", 'Et toi alors ?'];

const fill = (line: string, name: string) => line.replace('{x}', name);
let counter = 0;
const nextId = () => `m${(counter++).toString(36)}`;

export function say(s: GameState, author: string, text: string, channel: 'public' | 'loups' | 'systeme', at: number) {
  s.messages.push({ id: nextId(), author, text, channel, at });
}

/** Prépare les messages des robots pendant le débat, étalés sur `windowMs`. */
export function planDebateChat(s: GameState, ctx: Ctx, windowMs: number) {
  const { rng, now } = ctx;
  const bots = alivePlayers(s).filter((p) => !p.isHuman);
  const at = () => now + 1500 + rng() * windowMs;
  const lastNight = s.deaths.filter((d) => d.day === s.day && d.cause !== 'vote');

  if (lastNight.length && bots.length) {
    const speaker = pick(bots, rng);
    say(s, speaker.name, fill(pick(MOURN, rng), byId(s, lastNight[0].id).name), 'public', now + 1200);
  }

  for (const bot of bots) {
    const mem = s.memory[bot.id];
    const lover = loverOf(s, bot.id);
    const candidates = alivePlayers(s).filter((p) => p.id !== bot.id && p.id !== lover);
    if (!candidates.length) continue;

    // La voyante annonce un loup qu'elle a découvert
    if (bot.role === 'voyante') {
      const wolf = candidates.find((p) => mem.known[p.id] === 'loup');
      if (wolf && rng() < 0.75) {
        mem.claimedSeer = true;
        say(s, bot.name, `Je suis la voyante. ${wolf.name} est un loup-garou !`, 'public', at());
        spreadSuspicion(s, wolf.id, 3, bot.id);
        continue;
      }
      const clean = candidates.find((p) => mem.known[p.id] && mem.known[p.id] !== 'loup');
      if (clean && rng() < 0.3) {
        say(s, bot.name, `Je me porte garant de ${clean.name}.`, 'public', at());
        spreadSuspicion(s, clean.id, -0.8, bot.id);
        continue;
      }
    }

    // Un loup contre-attaque la voyante qui s'est dévoilée
    if (isWolf(s, bot.id)) {
      const seer = candidates.find((p) => s.memory[p.id]?.claimedSeer && !isWolf(s, p.id));
      if (seer && rng() < 0.6) {
        say(s, bot.name, `${seer.name} ment ! Une vraie voyante ne se dévoilerait jamais comme ça.`, 'public', at());
        spreadSuspicion(s, seer.id, 0.8, bot.id);
        continue;
      }
    }

    const roll = rng();
    if (roll < 0.55) {
      const target = isWolf(s, bot.id)
        ? candidates.filter((p) => !isWolf(s, p.id)).sort((a, b) => publicSuspicion(s, b.id) - publicSuspicion(s, a.id))[0]
        : candidates.sort((a, b) => (mem.suspicion[b.id] ?? 0) - (mem.suspicion[a.id] ?? 0))[0];
      if (!target) continue;
      say(s, bot.name, fill(pick(ACCUSE, rng), target.name), 'public', at());
      spreadSuspicion(s, target.id, 0.4, bot.id);
    } else if (roll < 0.7 && publicSuspicion(s, bot.id) > 1) {
      say(s, bot.name, pick(DEFEND, rng), 'public', at());
    } else if (roll < 0.85) {
      say(s, bot.name, pick(FILLER, rng), 'public', at());
    }
  }
}

/** Les loups-robots proposent leur victime dans le chat de la meute. */
export function planWolfChat(s: GameState, ctx: Ctx) {
  Object.entries(s.wolfSuggestions).forEach(([wolfId, target], i) => {
    say(s, byId(s, wolfId).name, fill(pick(WOLF_SUGGEST, ctx.rng), byId(s, target).name), 'loups', ctx.now + 900 + i * 1400);
  });
}

/** Réaction des robots à un message de l'humain qui cite un joueur. */
export function reactToHuman(s: GameState, ctx: Ctx, channel: 'public' | 'loups', text: string) {
  const lower = text.toLowerCase();
  const named = alivePlayers(s).filter((p) => !p.isHuman && lower.includes(p.name.toLowerCase()));
  for (const p of named) {
    if (channel === 'public') {
      spreadSuspicion(s, p.id, 0.6);
      if (ctx.rng() < 0.7) say(s, p.name, pick(REPLY_ACCUSED, ctx.rng), 'public', ctx.now + 1500 + ctx.rng() * 2000);
    }
  }
  if (channel === 'loups' && named.length) {
    const wolf = alivePlayers(s).find((p) => p.role === 'loup' && !p.isHuman);
    if (wolf) say(s, wolf.name, `D'accord, va pour ${named[0].name}.`, 'loups', ctx.now + 1500);
  }
}
