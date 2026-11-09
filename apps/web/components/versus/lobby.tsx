'use client';

import * as React from 'react';
import { Check, Copy, Link2, Loader2, Search, Swords, Users, X } from 'lucide-react';
import { GAME_LIMITS, roomCodeSchema } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import type { SocketStatus } from '@/providers/socket-provider';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

export type LobbyPhase = 'lobby' | 'connecting' | 'queued' | 'room' | 'tournament-wait';

interface LobbyProps {
  phase: LobbyPhase;
  socketStatus: SocketStatus;
  waiting: number | null;
  roomCode: string | null;
  invitedCode: string | null;
  busy: boolean;
  onFind: () => void;
  onCancelQueue: () => void;
  onCreateRoom: () => void;
  onCancelRoom: () => void;
  onJoinRoom: (code: string) => void;
  tournamentId: string | null;
}

export function VersusLobby({
  phase,
  socketStatus,
  waiting,
  roomCode,
  invitedCode,
  busy,
  onFind,
  onCancelQueue,
  onCreateRoom,
  onCancelRoom,
  onJoinRoom,
  tournamentId,
}: LobbyProps) {
  const { t } = useI18n();
  const { user, isGuest, openAuthModal } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = React.useState(invitedCode ?? '');
  const [codeError, setCodeError] = React.useState(false);
  const [copied, setCopied] = React.useState<'code' | 'link' | null>(null);

  React.useEffect(() => {
    if (invitedCode) setCode(invitedCode);
  }, [invitedCode]);

  const shareLink =
    roomCode && typeof window !== 'undefined' ? `${window.location.origin}/1v1?room=${roomCode}` : roomCode ? `/1v1?room=${roomCode}` : '';

  const copy = async (value: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast({ title: t('toast.copied'), durationMs: 1500 });
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' });
    }
  };

  const submitJoin = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = roomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(true);
      return;
    }
    setCodeError(false);
    onJoinRoom(parsed.data);
  };

  const idle = phase === 'lobby';

  return (
    <div className="container max-w-5xl py-8 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('versus.title')}</h1>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">{t('versus.subtitle')}</p>
        </div>
        <ConnectionBadge status={socketStatus} active={phase !== 'lobby'} />
      </div>

      {(!user || isGuest) && (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span>{t('versus.loginHint')}</span>
          <button type="button" onClick={() => openAuthModal('login')} className="font-semibold text-primary underline-offset-4 hover:underline">
            {t('nav.login')}
          </button>
        </p>
      )}

      {phase === 'tournament-wait' && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <h2 className="text-xl font-bold">{t('tournaments.waitingTitle')}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t('tournaments.waitingBody')}</p>
            {tournamentId && (
              <Button asChild variant="outline">
                <a href={`/tournaments/${tournamentId}`}>{t('versus.result.backToTournament')}</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Swords className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle>{t('versus.findMatch')}</CardTitle>
            <CardDescription>{t('versus.findMatchHint')}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid gap-3">
            {phase === 'queued' ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
                  <div>
                    <p className="font-semibold">{t('versus.searching')}</p>
                    {waiting != null && <p className="text-xs text-muted-foreground">{t('versus.waitingCount', { count: waiting })}</p>}
                  </div>
                </div>
                <Button variant="outline" onClick={onCancelQueue}>
                  <X /> {t('versus.cancelSearch')}
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={onFind} disabled={!idle || busy}>
                {busy && idle ? <Loader2 className="animate-spin" /> : <Search />}
                {phase === 'connecting' ? t('versus.connection.connecting') : t('versus.findMatch')}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle>{t('versus.createRoom')}</CardTitle>
            <CardDescription>{t('versus.createRoomHint')}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid gap-3">
            {phase === 'room' && roomCode ? (
              <>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.roomCode')}</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <output
                      data-testid="room-code"
                      className="flex-1 rounded-lg border bg-muted px-4 py-3 text-center font-mono text-3xl font-black tracking-[0.35em]"
                    >
                      {roomCode}
                    </output>
                    <Button variant="outline" size="icon" onClick={() => void copy(roomCode, 'code')} aria-label={t('versus.copyCode')}>
                      {copied === 'code' ? <Check className="text-success" /> : <Copy />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="room-link" className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('versus.roomLink')}
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input id="room-link" readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={() => void copy(shareLink, 'link')} aria-label={t('versus.copyLink')}>
                      {copied === 'link' ? <Check className="text-success" /> : <Link2 />}
                    </Button>
                  </div>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('versus.waitingForFriend')}
                </p>
                <Button variant="outline" onClick={onCancelRoom}>
                  <X /> {t('common.cancel')}
                </Button>
              </>
            ) : (
              <Button size="lg" variant="secondary" onClick={onCreateRoom} disabled={!idle || busy}>
                {busy && idle ? <Loader2 className="animate-spin" /> : <Users />}
                {t('versus.createRoom')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">{t('versus.joinRoom')}</CardTitle>
          <CardDescription>{invitedCode ? t('versus.invitedTo', { code: invitedCode }) : t('versus.joinRoomHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitJoin} className="flex flex-col gap-3 sm:flex-row" noValidate>
            <div className="flex-1">
              <Label htmlFor="join-code" className="sr-only">
                {t('versus.roomCode')}
              </Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GAME_LIMITS.ROOM_CODE_LENGTH));
                  setCodeError(false);
                }}
                placeholder={t('versus.roomCodePlaceholder')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={codeError}
                aria-describedby={codeError ? 'join-code-error' : undefined}
                className="h-12 text-center font-mono text-xl uppercase tracking-[0.3em]"
              />
              {codeError && (
                <p id="join-code-error" role="alert" className="mt-1 text-xs text-destructive">
                  {t('versus.errors.invalidCode')}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="sm:w-48" disabled={!idle || busy}>
              {busy && idle ? <Loader2 className="animate-spin" /> : null}
              {t('versus.joinSubmit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectionBadge({ status, active }: { status: SocketStatus; active: boolean }) {
  const { t } = useI18n();
  if (status === 'idle' && !active) return null;
  const map = {
    idle: { label: t('versus.connection.connecting'), variant: 'secondary' as const },
    connecting: { label: t('versus.connection.connecting'), variant: 'secondary' as const },
    connected: { label: t('versus.connection.connected'), variant: 'success' as const },
    disconnected: { label: t('versus.connection.disconnected'), variant: 'warning' as const },
    error: { label: t('versus.connection.failed'), variant: 'destructive' as const },
  };
  const info = map[status];
  return (
    <Badge variant={info.variant} role="status">
      {info.label}
    </Badge>
  );
}
