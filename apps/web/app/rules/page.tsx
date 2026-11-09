'use client';

import Link from 'next/link';
import { Gamepad2, Medal, Swords, Target } from 'lucide-react';
import { CODE_LENGTH, GAME_LIMITS, MAX_ATTEMPTS, SCORING, calculateScore, type PegColor } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExampleRow } from '@/components/game/example-row';
import { FeedbackLegend } from '@/components/game/feedback-legend';
import { RulesTutorial } from '@/components/game/rules-tutorial';
import { BracketView } from '@/components/tournament/bracket-view';
import { PageHeader } from '@/components/page-header';
import { demoBracket } from '@/lib/bracket';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';

const EXAMPLE_SECRET: PegColor[] = ['R', 'G', 'B', 'Y'];
const EXAMPLES: { guess: PegColor[]; captionKey: 'rules.feedback.example1Caption' | 'rules.feedback.example2Caption' | 'rules.feedback.example3Caption' }[] = [
  { guess: ['R', 'G', 'Y', 'P'], captionKey: 'rules.feedback.example1Caption' },
  { guess: ['R', 'R', 'P', 'P'], captionKey: 'rules.feedback.example2Caption' },
  { guess: ['G', 'B', 'Y', 'R'], captionKey: 'rules.feedback.example3Caption' },
];

const EXAMPLE_ATTEMPTS = 5;
const EXAMPLE_SECONDS = 90;
const BRACKET_DEMO = demoBracket(['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis']);

export default function RulesPage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const cb = settings.colorblindMode;
  const example = calculateScore({ won: true, attemptsUsed: EXAMPLE_ATTEMPTS, durationMs: EXAMPLE_SECONDS * 1000 });
  const steps = [t('rules.howTo.step1'), t('rules.howTo.step2', { length: CODE_LENGTH }), t('rules.howTo.step3'), t('rules.howTo.step4')];
  const versusRules = [
    t('rules.versus.rule1'),
    t('rules.versus.rule2'),
    t('rules.versus.rule3'),
    t('rules.versus.rule4'),
    t('rules.versus.rule5', { seconds: GAME_LIMITS.DISCONNECT_GRACE_MS / 1000 }),
    t('rules.versus.rule6'),
  ];
  const tournamentRules = [
    t('rules.tournament.rule1'),
    t('rules.tournament.rule2'),
    t('rules.tournament.rule3'),
    t('rules.tournament.rule4'),
    t('rules.tournament.rule5'),
  ];

  return (
    <div className="container max-w-5xl py-8 sm:py-10">
      <PageHeader title={t('rules.title')} subtitle={t('rules.subtitle')} />

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Target className="h-5 w-5 text-primary" aria-hidden /> {t('rules.goal.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('rules.goal.body', { length: CODE_LENGTH, max: MAX_ATTEMPTS })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('rules.howTo.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {steps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <section aria-labelledby="feedback-heading" className="grid gap-4">
          <div>
            <h2 id="feedback-heading" className="text-2xl font-bold tracking-tight">
              {t('rules.feedback.title')}
            </h2>
            <p className="mt-1 text-muted-foreground">{t('rules.feedback.intro')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('rules.feedback.exactTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{t('rules.feedback.exactBody')}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t('rules.feedback.partialTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{t('rules.feedback.partialBody')}</CardContent>
            </Card>
          </div>
          <FeedbackLegend className="rounded-xl border bg-card p-4" />
          <div className="grid gap-3">
            {EXAMPLES.map((ex) => (
              <ExampleRow key={ex.captionKey} secret={EXAMPLE_SECRET} guess={ex.guess} colorblind={cb} caption={t(ex.captionKey)} />
            ))}
          </div>
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('rules.feedback.duplicatesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{t('rules.feedback.duplicatesBody')}</CardContent>
          </Card>
        </section>

        <RulesTutorial />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('rules.scoring.title')}</CardTitle>
            <CardDescription>{t('rules.scoring.intro')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ul className="grid gap-4">
              <ScoreItem label={t('rules.scoring.baseLabel')} body={t('rules.scoring.baseBody', { points: SCORING.BASE_WIN_POINTS })} />
              <ScoreItem
                label={t('rules.scoring.attemptLabel')}
                body={t('rules.scoring.attemptBody', { points: SCORING.POINTS_PER_UNUSED_ATTEMPT })}
              />
              <ScoreItem
                label={t('rules.scoring.timeLabel')}
                body={t('rules.scoring.timeBody', {
                  points: SCORING.MAX_TIME_BONUS,
                  minutes: SCORING.TIME_BONUS_WINDOW_MS / 60000,
                })}
              />
              <li className="text-sm text-muted-foreground">{t('rules.scoring.lossBody', { points: SCORING.LOSS_POINTS })}</li>
            </ul>
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="font-semibold">{t('rules.scoring.exampleTitle')}</p>
              <p className="mb-3 text-sm text-muted-foreground">
                {t('rules.scoring.exampleBody', { attempts: EXAMPLE_ATTEMPTS, seconds: EXAMPLE_SECONDS })}
              </p>
              <dl className="grid gap-1.5 font-mono text-sm tabular-nums">
                <Line label={t('play.summary.base')} value={example.base} />
                <Line label={t('play.summary.attemptBonus')} value={`+${example.attemptBonus}`} />
                <Line label={t('play.summary.timeBonus')} value={`+${example.timeBonus}`} />
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold text-primary">
                  <dt>{t('rules.scoring.total')}</dt>
                  <dd data-testid="example-total">{example.total}</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Swords className="h-5 w-5 text-primary" aria-hidden /> {t('rules.versus.title')}
              </CardTitle>
              <CardDescription>{t('rules.versus.intro')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
                {versusRules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Medal className="h-5 w-5 text-primary" aria-hidden /> {t('rules.tournament.title')}
              </CardTitle>
              <CardDescription>{t('rules.tournament.intro')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid list-disc gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
                {tournamentRules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('tournaments.bracket')}</CardTitle>
            <CardDescription>{t('rules.tournament.rule2')}</CardDescription>
          </CardHeader>
          <CardContent>
            <BracketView matches={BRACKET_DEMO.matches} totalRounds={BRACKET_DEMO.totalRounds} compact />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('rules.shortcuts.title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {[
              [t('rules.shortcuts.pickColorKeys'), t('rules.shortcuts.pickColor')],
              [t('rules.shortcuts.backspaceKey'), t('rules.shortcuts.backspace')],
              [t('rules.shortcuts.enterKey'), t('rules.shortcuts.enter')],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <kbd className="rounded border bg-background px-2 py-0.5 font-mono text-xs">{key}</kbd>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/play">
              <Gamepad2 /> {t('rules.cta.play')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/1v1">
              <Swords /> {t('rules.cta.versus')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/tournaments">
              <Medal /> {t('rules.cta.tournaments')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreItem({ label, body }: { label: string; body: string }) {
  return (
    <li className="rounded-lg border-l-4 border-primary bg-muted/30 px-4 py-2">
      <p className="font-semibold">{label}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </li>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="font-sans text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
