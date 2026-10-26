// Convertit l'instantané envoyé par le serveur en état de partie compris par les écrans
// (les mêmes écrans servent aux parties contre les robots et aux parties en ligne).
import type { GameState } from '../game/types';
import type { GameSnapshot } from './types';

/**
 * `offset` = heure du serveur − heure de l'appareil (en ms). Les heures du serveur sont
 * converties en heures locales pour que les chronos soient justes même si l'horloge
 * du téléphone est décalée.
 */
export function toGameState(snap: GameSnapshot, offset: number): GameState {
  const { game: g, view: v, me } = snap;
  const local = (iso: string) => Date.parse(iso) - offset;
  const players = snap.players.map((p) => ({
    id: p.id,
    name: p.pseudo,
    // Un rôle inconnu n'est jamais affiché par les écrans : la valeur par défaut ne sert qu'au typage.
    role: p.role ?? (p.id === v.partner ? v.partner_role : null) ?? 'villageois',
    alive: p.alive,
    isHuman: true,
    online: p.online,
  }));
  const deaths = snap.players
    .filter((p) => !p.alive && p.death_cause)
    .sort((a, b) => (a.death_seq ?? 0) - (b.death_seq ?? 0))
    .map((p) => ({ id: p.id, cause: p.death_cause!, day: p.death_day ?? g.day }));

  return {
    settings: g.settings,
    players,
    hostId: snap.host_id,
    seed: 0,
    phase: g.phase,
    day: g.day,
    phaseEndsAt: local(g.phase_ends_at),
    minEndsAt: local(g.phase_ends_at),
    pending: v.pending || v.acted ? [me] : [],
    done: v.acted ? [me] : [],
    lovers: v.lovers ?? (v.partner ? [me, v.partner] : null),
    cupidChoice: null,
    wolfVotes: snap.wolf_votes,
    wolfTarget: v.wolf_target,
    witch: { life: v.witch?.life ?? false, death: v.witch?.death ?? false, saveTonight: false, killTonight: null },
    seerResults: v.seer_results ?? {},
    votes: Object.fromEntries(snap.votes.map((x) => [x.voter, { target: x.target ?? 'abstention', at: local(x.at) }])),
    runoff: g.runoff,
    eliminatedToday: g.eliminated_today,
    deaths,
    hunterQueue: g.phase === 'chasseur' && (v.pending || v.acted) ? [me] : [],
    hunterShot: null,
    afterVerification: 'debat',
    messages: snap.messages.map((m) => ({ id: `m${m.id}`, author: m.author, text: m.text, channel: m.channel, at: local(m.created_at) })),
    notes: snap.notes.map((n) => ({ playerId: me, at: local(n.at), text: n.text })),
    memory: {},
    announcement: g.announcement,
    winner: g.winner,
    history: [],
  };
}
