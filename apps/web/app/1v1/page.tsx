'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { PegColor, SocketErrorCode } from '@mastermind/shared';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MatchArena } from '@/components/versus/arena';
import { VersusLobby, type LobbyPhase } from '@/components/versus/lobby';
import { MatchResultDialog } from '@/components/versus/result-dialog';
import { colorForKey, isRowComplete } from '@/lib/board';
import { serverNow, syncClock } from '@/lib/clock';
import { errorMessage } from '@/lib/errors';
import { initialMatchState, matchReducer, type MatchStart } from '@/lib/match';
import { playSound, unlockAudio } from '@/lib/sound';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';
import { useGameSocket } from '@/providers/socket-provider';

type Intent =
  | { kind: 'queue' }
  | { kind: 'create' }
  | { kind: 'join'; code: string }
  | { kind: 'tournament'; tournamentId: string; tournamentMatchId: string };

const GUESS_ACK_TIMEOUT_MS = 8000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

export default function VersusPage() {
  return (
    <React.Suspense
      fallback={
        <div className="container flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <VersusInner />
    </React.Suspense>
  );
}

function VersusInner() {
  const search = useSearchParams();
  const { t } = useI18n();
  const { settings } = useSettings();
  const { toast } = useToast();
  const { user, token, status: authStatus, ensureSession, openAuthModal } = useAuth();
  const cb = settings.colorblindMode;

  const invitedCode = search.get('room')?.toUpperCase() ?? null;
  const tournamentParam = search.get('tournament');
  const tournamentMatchParam = search.get('match');

  const [wantSocket, setWantSocket] = React.useState(false);
  const { socket, status: socketStatus } = useGameSocket(wantSocket);
  const [phase, setPhase] = React.useState<LobbyPhase>('lobby');
  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [waiting, setWaiting] = React.useState<number | null>(null);
  const [roomCode, setRoomCode] = React.useState<string | null>(null);
  const [activeTournament, setActiveTournament] = React.useState<string | null>(tournamentParam);
  const [state, dispatch] = React.useReducer(matchReducer, undefined, initialMatchState);
  const [shakeKey, setShakeKey] = React.useState(0);
  const [resultOpen, setResultOpen] = React.useState(false);
  const [forfeitOpen, setForfeitOpen] = React.useState(false);

  const stateRef = React.useRef(state);
  stateRef.current = state;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const autoStarted = React.useRef(false);

  const inMatch = !!state.match;
  const connected = socketStatus === 'connected';

  const codeMessage = React.useCallback(
    (code: SocketErrorCode | undefined, fallback?: string): string => {
      switch (code) {
        case 'ROOM_NOT_FOUND':
          return t('versus.errors.roomNotFound');
        case 'ROOM_FULL':
          return t('versus.errors.roomFull');
        case 'ALREADY_IN_MATCH':
          return t('versus.errors.alreadyInMatch');
        case 'ALREADY_QUEUED':
          return t('versus.errors.alreadyQueued');
        case 'MATCH_NOT_READY':
          return t('versus.errors.matchNotReady');
        case 'MATCH_OVER':
          return t('versus.errors.matchOver');
        case 'NOT_YOUR_MATCH':
          return t('versus.errors.notYourMatch');
        case 'UNAUTHORIZED':
          return t('versus.errors.unauthorized');
        case 'RATE_LIMITED':
          return t('errors.rateLimited');
        case 'INVALID_PAYLOAD':
          return t('versus.errors.invalidCode');
        default:
          return fallback || t('versus.errors.generic');
      }
    },
    [t],
  );

  const backToLobby = React.useCallback(() => {
    dispatch({ type: 'reset' });
    setPhase('lobby');
    setIntent(null);
    setRoomCode(null);
    setBusy(false);
    setResultOpen(false);
    setActiveTournament(null);
    if (typeof window !== 'undefined' && window.location.search) window.history.replaceState(null, '', '/1v1');
  }, []);

  React.useEffect(() => {
    void syncClock();
  }, []);

  // Connect eagerly for signed-in users so an interrupted match is resumed after a reload.
  React.useEffect(() => {
    if (authStatus === 'ready' && token) setWantSocket(true);
  }, [authStatus, token]);

  const begin = React.useCallback(
    async (next: Intent) => {
      unlockAudio();
      setBusy(true);
      setPhase('connecting');
      try {
        await syncClock();
        await ensureSession();
        setWantSocket(true);
        setIntent(next);
      } catch (error) {
        setBusy(false);
        setPhase('lobby');
        toast({ title: t('versus.connection.failed'), description: errorMessage(error, t), variant: 'error' });
      }
    },
    [ensureSession, t, toast],
  );

  // Run the pending intent as soon as the socket is connected.
  React.useEffect(() => {
    if (!socket || !connected || !intent) return;
    const current = intent;
    setIntent(null);

    const fail = (code: SocketErrorCode | undefined, error?: string) => {
      setBusy(false);
      setPhase('lobby');
      toast({ title: codeMessage(code, error), variant: 'error' });
    };

    if (current.kind === 'queue') {
      socket.emit('1v1:queue:join', (res) => {
        if (res.ok) {
          setBusy(false);
          setPhase('queued');
          setWaiting(res.data.waiting ?? null);
        } else if (res.code === 'ALREADY_QUEUED') {
          setBusy(false);
          setPhase('queued');
        } else fail(res.code, res.error);
      });
    } else if (current.kind === 'create') {
      socket.emit('1v1:room:create', (res) => {
        if (res.ok) {
          setBusy(false);
          setRoomCode(res.data.code);
          setPhase('room');
        } else fail(res.code, res.error);
      });
    } else if (current.kind === 'join') {
      socket.emit('1v1:room:join', { code: current.code }, (res) => {
        if (res.ok) {
          setPhase('lobby');
          setBusy(true);
        } else fail(res.code, res.error);
      });
    } else {
      setActiveTournament(current.tournamentId);
      socket.emit(
        'tournament:match:join',
        { tournamentId: current.tournamentId, tournamentMatchId: current.tournamentMatchId },
        (res) => {
          if (res.ok) {
            setBusy(false);
            dispatch({ type: 'started', payload: res.data as MatchStart });
          } else if (res.code === 'MATCH_NOT_READY') {
            setBusy(false);
            setPhase('tournament-wait');
          } else fail(res.code, res.error);
        },
      );
    }
  }, [socket, connected, intent, codeMessage, toast]);

  // Deep links: ?tournament=&match= starts the tournament match automatically.
  React.useEffect(() => {
    if (autoStarted.current || authStatus !== 'ready') return;
    if (!tournamentParam || !tournamentMatchParam) return;
    autoStarted.current = true;
    if (!user) {
      openAuthModal('login');
      return;
    }
    void begin({ kind: 'tournament', tournamentId: tournamentParam, tournamentMatchId: tournamentMatchParam });
  }, [authStatus, user, tournamentParam, tournamentMatchParam, begin, openAuthModal]);

  // Socket events.
  React.useEffect(() => {
    if (!socket) return;

    const onStarted = (payload: MatchStart) => {
      const alreadyKnown = stateRef.current.match?.matchId === payload.matchId;
      dispatch({ type: 'started', payload });
      setPhase('lobby');
      setBusy(false);
      setIntent(null);
      setRoomCode(null);
      if (payload.tournamentId) setActiveTournament(payload.tournamentId);
      if (!alreadyKnown) {
        playSound('match');
        toast({ title: t('toast.matchFound'), description: payload.opponent.username, variant: 'success' });
      }
      if (window.location.search) window.history.replaceState(null, '', '/1v1');
    };
    const onGuessResult = ({ matchId, result }: { matchId: string; result: import('@mastermind/shared').GuessResult }) => {
      if (stateRef.current.match?.matchId !== matchId) return;
      dispatch({ type: 'guessResult', result });
    };
    const onProgress = (payload: import('@mastermind/shared').OpponentProgressPayload) => dispatch({ type: 'opponentProgress', payload });
    const onOpponentStatus = (payload: { matchId: string; status: 'connected' | 'disconnected'; graceMs?: number }) => {
      if (stateRef.current.match?.matchId !== payload.matchId) return;
      dispatch({ type: 'opponentStatus', status: payload.status, graceMs: payload.graceMs });
    };
    const onEnded = (payload: import('@mastermind/shared').MatchEndedPayload) => {
      if (stateRef.current.match?.matchId !== payload.matchId) return;
      dispatch({ type: 'ended', payload });
      const won = payload.winnerId != null && payload.winnerId === user?.id;
      playSound(won ? 'win' : payload.winnerId == null ? 'submit' : 'lose');
      window.setTimeout(() => setResultOpen(true), 700);
    };
    const onError = (payload: { message: string; code: SocketErrorCode }) => {
      toast({ title: codeMessage(payload.code, payload.message), variant: 'error' });
      dispatch({ type: 'guessFailed' });
    };
    const onQueueStatus = (payload: { status: 'idle' | 'queued'; waiting?: number }) => {
      if (payload.status === 'queued') {
        setPhase('queued');
        setWaiting(payload.waiting ?? null);
      } else if (phaseRef.current === 'queued' && !stateRef.current.match) {
        setWaiting(null);
      }
    };
    const onRoomCreated = (payload: { code: string }) => {
      setRoomCode(payload.code);
      setPhase('room');
      setBusy(false);
    };
    const onConnect = () => {
      const current = stateRef.current;
      if (current.match && !current.ended) {
        socket.emit('match:rejoin', { matchId: current.match.matchId }, (res) => {
          if (res.ok) dispatch({ type: 'started', payload: { ...(res.data as MatchStart) } });
        });
      }
    };
    const onDisconnect = () => {
      if (!stateRef.current.match && (phaseRef.current === 'queued' || phaseRef.current === 'room' || phaseRef.current === 'tournament-wait')) {
        setPhase('lobby');
        setRoomCode(null);
        setBusy(false);
        toast({ title: t('versus.queueLost'), variant: 'error' });
      }
    };

    socket.on('match:started', onStarted);
    socket.on('match:guess_result', onGuessResult);
    socket.on('match:opponent_progress', onProgress);
    socket.on('match:opponent_status', onOpponentStatus);
    socket.on('match:ended', onEnded);
    socket.on('match:error', onError);
    socket.on('1v1:queue:status', onQueueStatus);
    socket.on('1v1:room:created', onRoomCreated);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('match:started', onStarted);
      socket.off('match:guess_result', onGuessResult);
      socket.off('match:opponent_progress', onProgress);
      socket.off('match:opponent_status', onOpponentStatus);
      socket.off('match:ended', onEnded);
      socket.off('match:error', onError);
      socket.off('1v1:queue:status', onQueueStatus);
      socket.off('1v1:room:created', onRoomCreated);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, user?.id, t, toast, codeMessage]);

  // Leaving the page while queued must not leave a ghost entry in the queue.
  React.useEffect(() => {
    return () => {
      if (phaseRef.current === 'queued') socket?.emit('1v1:queue:leave');
    };
  }, [socket]);

  const isLive = React.useCallback(() => {
    const match = stateRef.current.match;
    return !!match && serverNow() >= match.startedAt && !stateRef.current.ended;
  }, []);

  const pick = React.useCallback(
    (color: PegColor) => {
      if (!isLive()) return;
      playSound('place');
      dispatch({ type: 'place', color });
    },
    [isLive],
  );
  const undo = React.useCallback(() => {
    if (!isLive()) return;
    playSound('remove');
    dispatch({ type: 'remove' });
  }, [isLive]);
  const clear = React.useCallback(() => {
    if (!isLive()) return;
    playSound('remove');
    dispatch({ type: 'clear' });
  }, [isLive]);

  const submit = React.useCallback(() => {
    const current = stateRef.current;
    if (!socket || !current.match || !isLive() || current.pending) return;
    if (current.board.rows.length >= current.board.maxAttempts) return;
    if (!isRowComplete(current.board.current)) {
      setShakeKey((k) => k + 1);
      playSound('error');
      toast({ title: t('play.incomplete', { length: current.board.codeLength }), variant: 'error', durationMs: 1800 });
      return;
    }
    const matchId = current.match.matchId;
    dispatch({ type: 'submitting' });
    playSound('submit');
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      dispatch({ type: 'guessFailed' });
      toast({ title: t('play.guessError'), variant: 'error' });
    }, GUESS_ACK_TIMEOUT_MS);
    socket.emit('match:guess', { matchId, guess: current.board.current as Array<'R' | 'G' | 'B' | 'Y' | 'P' | 'O'> }, (res) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (res.ok) {
        dispatch({ type: 'guessResult', result: res.data });
      } else {
        dispatch({ type: 'guessFailed' });
        playSound('error');
        toast({ title: t('versus.arena.guessRejected'), description: codeMessage(res.code, res.error), variant: 'error' });
      }
    });
  }, [socket, isLive, t, toast, codeMessage]);

  const forfeit = React.useCallback(() => {
    const match = stateRef.current.match;
    if (!socket || !match) return;
    socket.emit('match:forfeit', { matchId: match.matchId }, (res) => {
      if (!res.ok) toast({ title: codeMessage(res.code, res.error), variant: 'error' });
    });
  }, [socket, toast, codeMessage]);

  React.useEffect(() => {
    if (!inMatch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const color = colorForKey(event.key, stateRef.current.match?.palette as PegColor[] | undefined);
      if (color) {
        event.preventDefault();
        pick(color);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        clear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inMatch, pick, undo, clear, submit]);

  const cancelQueue = () => {
    socket?.emit('1v1:queue:leave', () => undefined);
    setPhase('lobby');
    setWaiting(null);
    toast({ title: t('toast.queueLeft') });
  };

  if (inMatch) {
    return (
      <>
        <MatchArena
          state={state}
          colorblind={cb}
          shakeKey={shakeKey}
          onPick={pick}
          onUndo={undo}
          onClear={clear}
          onSubmit={submit}
          onSlotClick={(index) => {
            if (!isLive()) return;
            playSound('select');
            dispatch({ type: 'toggle', index });
          }}
          onForfeit={() => setForfeitOpen(true)}
          onShowResult={() => setResultOpen(true)}
          connected={connected}
        />
        <ConfirmDialog
          open={forfeitOpen}
          onOpenChange={setForfeitOpen}
          title={t('versus.arena.forfeit')}
          description={t('versus.arena.forfeitConfirm')}
          confirmLabel={t('versus.arena.forfeit')}
          destructive
          onConfirm={forfeit}
        />
        {state.ended && (
          <MatchResultDialog
            open={resultOpen}
            onOpenChange={setResultOpen}
            ended={state.ended}
            colorblind={cb}
            onLobby={backToLobby}
            onRematch={() => {
              backToLobby();
              void begin({ kind: 'queue' });
            }}
          />
        )}
      </>
    );
  }

  return (
    <VersusLobby
      phase={phase}
      socketStatus={socketStatus}
      waiting={waiting}
      roomCode={roomCode}
      invitedCode={invitedCode}
      busy={busy}
      tournamentId={activeTournament}
      onFind={() => void begin({ kind: 'queue' })}
      onCancelQueue={cancelQueue}
      onCreateRoom={() => void begin({ kind: 'create' })}
      onCancelRoom={() => {
        setPhase('lobby');
        setRoomCode(null);
      }}
      onJoinRoom={(code) => void begin({ kind: 'join', code })}
    />
  );
}
