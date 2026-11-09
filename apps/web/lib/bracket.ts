import {
  buildBracketPlan,
  roundLabel,
  type BracketMatch,
  type PlayerRef,
  type Translator,
} from '@mastermind/shared';

/** Groups matches into rounds (ascending), each sorted by match order. */
export function groupByRound(matches: readonly BracketMatch[]): BracketMatch[][] {
  const rounds = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    const list = rounds.get(match.round) ?? [];
    list.push(match);
    rounds.set(match.round, list);
  }
  return [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => list.sort((a, b) => a.matchOrder - b.matchOrder));
}

export function roundTitle(round: number, totalRounds: number, t: Translator): string {
  const label = roundLabel(round, totalRounds);
  switch (label.kind) {
    case 'final':
      return t('tournaments.final');
    case 'semifinal':
      return t('tournaments.semifinal');
    case 'quarterfinal':
      return t('tournaments.quarterfinal');
    default:
      return t('tournaments.round', { round });
  }
}

/** A match the given user can play right now. */
export function isPlayableBy(match: BracketMatch, userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (match.status !== 'READY' && match.status !== 'IN_PROGRESS') return false;
  if (match.winnerId) return false;
  return match.player1?.id === userId || match.player2?.id === userId;
}

/** Finds the first playable match for a user, earliest round first. */
export function findPlayableMatch(matches: readonly BracketMatch[], userId: string | null | undefined): BracketMatch | null {
  const sorted = [...matches].sort((a, b) => a.round - b.round || a.matchOrder - b.matchOrder);
  return sorted.find((m) => isPlayableBy(m, userId)) ?? null;
}

export function opponentOf(match: BracketMatch, userId: string): PlayerRef | null {
  if (match.player1?.id === userId) return match.player2;
  if (match.player2?.id === userId) return match.player1;
  return null;
}

/** Builds a displayable bracket from player names (seed order) using the shared bracket planner. */
export function demoBracket(names: readonly string[]): { matches: BracketMatch[]; totalRounds: number } {
  const ids = names.map((_, i) => `p${i + 1}`);
  const plan = buildBracketPlan(ids);
  const players = new Map<string, PlayerRef>(
    ids.map((id, i) => [id, { id, username: names[i] as string, rating: 1000, seed: i + 1 }]),
  );
  const idOf = (round: number, order: number) => `m-${round}-${order}`;
  const matches: BracketMatch[] = plan.matches.map((m) => ({
    id: idOf(m.round, m.matchOrder),
    tournamentId: 'demo',
    round: m.round,
    matchOrder: m.matchOrder,
    player1: m.player1Id ? (players.get(m.player1Id) ?? null) : null,
    player2: m.player2Id ? (players.get(m.player2Id) ?? null) : null,
    winnerId: m.winnerId,
    matchId: null,
    nextMatchId: m.nextRound && m.nextMatchOrder !== null ? idOf(m.nextRound, m.nextMatchOrder) : null,
    nextMatchSlot: m.nextMatchSlot,
    status: m.status,
  }));
  return { matches, totalRounds: plan.totalRounds };
}
