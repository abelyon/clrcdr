'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bot, ExternalLink, Loader2, LogIn, Plus, RotateCcw, ShieldCheck, Swords, Trash2, UserPlus, Zap } from 'lucide-react';
import {
  TOURNAMENT_LIMITS,
  createTournamentSchema,
  nextPowerOfTwo,
  type BracketMatch,
  type TournamentDetail,
  type TournamentSummary,
} from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { BracketView } from '@/components/tournament/bracket-view';
import { TournamentStatusBadge } from '@/components/tournament/status-badge';
import { api, type AdminUser } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { localInputToIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

export default function AdminTournamentsPage() {
  const { t } = useI18n();
  const { user, status, isAdmin, switchToDemoAdmin, openAuthModal } = useAuth();
  const { toast } = useToast();
  const [switching, setSwitching] = React.useState(false);

  const demoAdmin = async () => {
    setSwitching(true);
    try {
      const admin = await switchToDemoAdmin();
      toast({ title: t('auth.welcome', { name: admin.username }), description: t('auth.demoAdminActive'), variant: 'success' });
    } catch (error) {
      toast({ title: errorMessage(error, t, 'login'), variant: 'error' });
    } finally {
      setSwitching(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="container py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container max-w-xl py-16">
        <Card className="border-warning/40">
          <CardHeader className="items-center text-center">
            <span className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning">
              <ShieldCheck className="h-7 w-7" aria-hidden />
            </span>
            <CardTitle className="text-2xl">{t('admin.title')}</CardTitle>
            <CardDescription>{t('admin.accessDenied')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {user && <p className="text-center text-sm text-muted-foreground">{t('admin.adminSession', { name: user.username })}</p>}
            <Button size="lg" onClick={() => void demoAdmin()} disabled={switching}>
              {switching ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {switching ? t('admin.switching') : t('admin.switchToDemoAdmin')}
            </Button>
            <Button variant="outline" onClick={() => openAuthModal('login')}>
              <LogIn /> {t('nav.login')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('auth.demoCredentials')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [list, setList] = React.useState<TournamentSummary[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const loadList = React.useCallback(async () => {
    try {
      const items = await api.tournaments();
      setList(items);
      setListError(null);
      return items;
    } catch (error) {
      setListError(errorMessage(error, t));
      return null;
    }
  }, [t]);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  const onCreated = async (created: TournamentDetail) => {
    toast({ title: t('admin.created'), description: created.name, variant: 'success' });
    await loadList();
    setSelectedId(created.id);
  };

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <div className="grid content-start gap-6">
          <CreateTournamentCard onCreated={onCreated} />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('admin.manageTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {list === null && !listError && <Skeleton className="h-32 w-full" />}
              {listError && <p className="text-sm text-destructive">{listError}</p>}
              {list && list.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.noTournaments')}</p>}
              {list && list.length > 0 && (
                <ul className="grid gap-2" data-testid="admin-tournament-list">
                  {list.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        aria-pressed={selectedId === item.id}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
                          selectedId === item.id && 'border-primary bg-primary/10',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {t('tournaments.players', { count: item.participantCount, max: item.maxPlayers })}
                          </span>
                        </span>
                        <TournamentStatusBadge status={item.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedId ? (
          <ManagePanel key={selectedId} id={selectedId} onChanged={() => void loadList()} />
        ) : (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <Swords className="h-10 w-10" aria-hidden />
              <p>{t('admin.selectPrompt')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CreateTournamentCard({ onCreated }: { onCreated: (t: TournamentDetail) => void | Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [maxPlayers, setMaxPlayers] = React.useState('8');
  const [startTime, setStartTime] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const size = Number(maxPlayers);
  const validSize = Number.isInteger(size) && size >= TOURNAMENT_LIMITS.MIN_PLAYERS && size <= TOURNAMENT_LIMITS.MAX_PLAYERS;
  const bracketSize = validSize ? nextPowerOfTwo(size) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createTournamentSchema.safeParse({
      name,
      description: description.trim() || undefined,
      maxPlayers: size,
      startTime: localInputToIso(startTime),
    });
    if (!parsed.success) {
      setError(t('errors.validation'));
      return;
    }
    setBusy(true);
    try {
      const created = await api.createTournament(parsed.data);
      setName('');
      setDescription('');
      setStartTime('');
      await onCreated(created);
    } catch (e) {
      const message = errorMessage(e, t);
      setError(`${t('admin.createError')}: ${message}`);
      toast({ title: t('admin.createError'), description: message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="h-5 w-5 text-primary" aria-hidden /> {t('admin.createTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="t-name">{t('admin.name')}</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.namePlaceholder')} maxLength={60} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-desc">
              {t('admin.description')} <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('admin.descriptionPlaceholder')} maxLength={500} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-max">{t('admin.maxPlayers')}</Label>
            <Input
              id="t-max"
              type="number"
              inputMode="numeric"
              min={TOURNAMENT_LIMITS.MIN_PLAYERS}
              max={TOURNAMENT_LIMITS.MAX_PLAYERS}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              aria-invalid={!validSize}
            />
            <p className="text-xs text-muted-foreground">{t('admin.maxPlayersHint')}</p>
            {bracketSize && (
              <p className="text-xs font-medium text-primary" data-testid="bracket-hint">
                {t('admin.bracketSize', { size: bracketSize })} · {t('admin.byeSlots', { count: bracketSize - size })}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-start">
              {t('admin.startTime')} <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input id="t-start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !name.trim() || !validSize}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {busy ? t('admin.creating') : t('admin.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ManagePanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<TournamentDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<null | 'start' | 'reset'>(null);

  const refresh = React.useCallback(async () => {
    try {
      setDetail(await api.tournament(id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [id, t]);

  React.useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (key: string, action: () => Promise<TournamentDetail>, success: string, failure: string) => {
    setBusy(key);
    try {
      setDetail(await action());
      toast({ title: success, variant: 'success' });
      onChanged();
    } catch (e) {
      toast({ title: failure, description: errorMessage(e, t), variant: 'error' });
      throw e;
    } finally {
      setBusy(null);
    }
  };

  if (error && !detail) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => void refresh()}>{t('common.retry')}</Button>
        </CardContent>
      </Card>
    );
  }
  if (!detail) return <Skeleton className="h-96 w-full rounded-xl" />;

  const registration = detail.status === 'REGISTRATION';
  const count = detail.participants.length;
  const size = nextPowerOfTwo(Math.max(2, count));
  const actionable = detail.matches.filter((m) => (m.status === 'READY' || m.status === 'IN_PROGRESS') && m.player1 && m.player2);

  return (
    <div className="grid content-start gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardDescription>{t('admin.selected')}</CardDescription>
              <CardTitle className="mt-1 text-2xl">{detail.name}</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <TournamentStatusBadge status={detail.status} />
                <span>{t('tournaments.players', { count: detail.participantCount, max: detail.maxPlayers })}</span>
                <span>·</span>
                <span>{t('admin.bracketSize', { size })}</span>
                <span>·</span>
                <span>{t('admin.byeSlots', { count: size - count })}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/tournaments/${detail.id}`}>
                  <ExternalLink /> {t('tournaments.view')}
                </Link>
              </Button>
              {registration && (
                <Button size="sm" onClick={() => setConfirm('start')} disabled={count < 2 || busy !== null}>
                  <Zap /> {t('admin.startBracket')}
                </Button>
              )}
              {!registration && (
                <Button size="sm" variant="destructive" onClick={() => setConfirm('reset')} disabled={busy !== null}>
                  <RotateCcw /> {t('admin.resetMatches')}
                </Button>
              )}
            </div>
          </div>
          {registration && count < 2 && <p className="text-sm text-warning">{t('admin.needTwoPlayers')}</p>}
        </CardHeader>
      </Card>

      {registration && (
        <AddPlayersCard
          detail={detail}
          busy={busy}
          onAddUser={(userId) => run('add-user', () => api.addTournamentParticipants(id, { userIds: [userId] }), t('admin.playersAdded'), t('admin.addError'))}
          onAddBots={(botCount) => run('add-bots', () => api.addTournamentParticipants(id, { botCount }), t('admin.playersAdded'), t('admin.addError'))}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('tournaments.participants')}</CardTitle>
          <CardDescription>{t('admin.participantCount', { count })}</CardDescription>
        </CardHeader>
        <CardContent>
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tournaments.noParticipants')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2" data-testid="admin-participants">
              {[...detail.participants]
                .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999) || b.rating - a.rating)
                .map((player) => (
                  <li key={player.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <span className="w-7 rounded bg-muted px-1 text-center font-mono text-xs leading-5 text-muted-foreground" title={t('admin.seed')}>
                      {player.seed ?? '-'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{player.username}</span>
                    {player.isBot && (
                      <Badge variant="outline" className="gap-1">
                        <Bot className="h-3 w-3" aria-hidden /> {t('admin.bot')}
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{player.rating}</span>
                    {registration && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t('admin.removePlayer')}: ${player.username}`}
                        disabled={busy !== null}
                        onClick={() =>
                          void run(`rm-${player.id}`, () => api.removeTournamentParticipant(id, player.id), t('admin.removed'), t('admin.removeError')).catch(() => undefined)
                        }
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {detail.status === 'IN_PROGRESS' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('admin.walkoverTitle')}</CardTitle>
            <CardDescription>{t('admin.walkoverHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {actionable.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('admin.noReadyMatches')}</p>
            ) : (
              <ul className="grid gap-2">
                {actionable.map((match) => (
                  <WalkoverRow
                    key={match.id}
                    match={match}
                    detail={detail}
                    disabled={busy !== null}
                    onPick={(winnerId) =>
                      void run(`wo-${match.id}`, () => api.walkover(id, match.id, winnerId), t('admin.walkoverDone'), t('admin.walkoverError')).catch(() => undefined)
                    }
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {detail.matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('tournaments.bracket')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BracketView matches={detail.matches} totalRounds={detail.totalRounds} compact />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirm === 'start'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('admin.startBracket')}
        description={t('admin.startConfirm')}
        confirmLabel={t('admin.startBracket')}
        onConfirm={() => run('start', () => api.startTournament(id), t('admin.started'), t('admin.startError')).catch(() => undefined)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('admin.resetMatches')}
        description={t('admin.resetConfirm')}
        confirmLabel={t('admin.resetMatches')}
        destructive
        onConfirm={() => run('reset', () => api.resetTournament(id), t('admin.resetDone'), t('admin.resetError')).catch(() => undefined)}
      />
    </div>
  );
}

function WalkoverRow({
  match,
  disabled,
  onPick,
}: {
  match: BracketMatch;
  detail: TournamentDetail;
  disabled: boolean;
  onPick: (winnerId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <Badge variant="secondary">{t('tournaments.round', { round: match.round })}</Badge>
      {[match.player1, match.player2].map(
        (player) =>
          player && (
            <Button key={player.id} size="sm" variant="outline" disabled={disabled} onClick={() => onPick(player.id)}>
              {t('admin.walkoverAdvance', { name: player.username })}
            </Button>
          ),
      )}
    </li>
  );
}

function AddPlayersCard({
  detail,
  busy,
  onAddUser,
  onAddBots,
}: {
  detail: TournamentDetail;
  busy: string | null;
  onAddUser: (userId: string) => Promise<unknown>;
  onAddBots: (count: number) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [selected, setSelected] = React.useState('');
  const [botCount, setBotCount] = React.useState('4');
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setSearching(true);
      api
        .adminUsers(query.trim(), 50)
        .then((result) => {
          if (!cancelled) setUsers(result);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const taken = new Set(detail.participants.map((p) => p.id));
  const options = users.filter((u) => !u.isBot && !taken.has(u.id));
  const room = Math.max(0, detail.maxPlayers - detail.participants.length);
  const bots = Number(botCount);
  const validBots = Number.isInteger(bots) && bots >= 1 && bots <= room;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="h-5 w-5 text-primary" aria-hidden /> {t('admin.addPlayers')}
        </CardTitle>
        <CardDescription>{t('admin.addPlayersHint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <Label htmlFor="player-search">{t('admin.addUsers')}</Label>
          <Input id="player-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('admin.searchPlayers')} />
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger aria-label={t('admin.selectPlayer')}>
              <SelectValue placeholder={searching ? t('common.loading') : t('admin.selectPlayer')} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 && <div className="px-2 py-2 text-sm text-muted-foreground">{t('admin.noPlayersFound')}</div>}
              {options.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.username} ({u.rating})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            disabled={!selected || busy !== null || room === 0}
            onClick={() => void Promise.resolve(onAddUser(selected)).then(() => setSelected('')).catch(() => undefined)}
          >
            {busy === 'add-user' ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t('common.add')}
          </Button>
        </div>
        <div className="grid content-start gap-3">
          <Label htmlFor="bot-count">{t('admin.botCount')}</Label>
          <Input
            id="bot-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, room)}
            value={botCount}
            onChange={(e) => setBotCount(e.target.value)}
          />
          <Button variant="secondary" disabled={!validBots || busy !== null} onClick={() => void Promise.resolve(onAddBots(bots)).catch(() => undefined)}>
            {busy === 'add-bots' ? <Loader2 className="animate-spin" /> : <Bot />}
            {t('admin.addBotsSubmit', { count: validBots ? bots : 0 })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
