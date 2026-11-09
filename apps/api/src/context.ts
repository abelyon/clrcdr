import type { AppConfig } from './config';
import type { DbAccess } from './db';
import type { Logger } from './lib/logger';
import type { Realtime } from './realtime';
import type { LeaderboardService } from './services/leaderboard';
import type { MatchService } from './services/matches';
import type { MatchmakingService } from './services/matchmaking';
import type { SoloService } from './services/solo';
import type { TournamentService } from './services/tournaments';
import type { Store } from './store';

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  store: Store;
  db: DbAccess;
  realtime: Realtime;
  leaderboard: LeaderboardService;
  solo: SoloService;
  matches: MatchService;
  matchmaking: MatchmakingService;
  tournaments: TournamentService;
}
