'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Medal, Swords, Trophy, Gamepad2, Accessibility } from 'lucide-react';
import { CODE_LENGTH, MAX_ATTEMPTS, feedbackToPegs, type PegColor } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeedbackPegs, Peg } from '@/components/game/peg';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';

const HERO_PEGS: PegColor[] = ['R', 'B', 'Y', 'G', 'P', 'O'];
const DEMO_GUESS: PegColor[] = ['R', 'G', 'B', 'Y'];

export default function HomePage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const cb = settings.colorblindMode;

  const features = [
    { href: '/play', icon: Gamepad2, title: t('home.soloTitle'), body: t('home.soloBody') },
    { href: '/1v1', icon: Swords, title: t('home.versusTitle'), body: t('home.versusBody') },
    { href: '/tournaments', icon: Medal, title: t('home.tournamentsTitle'), body: t('home.tournamentsBody') },
    { href: '/leaderboard', icon: Trophy, title: t('home.leaderboardTitle'), body: t('home.leaderboardBody') },
  ];

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div className="container relative grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="animate-fade-up">
            <p className="mb-3 inline-flex items-center rounded-full border bg-card/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              {t('home.kicker')}
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              <span className="text-gradient">{t('home.title')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t('app.tagline')}</p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('app.description')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/play">
                  {t('home.playNow')} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/1v1">
                  <Swords /> {t('home.findDuel')}
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/rules">
                  <BookOpen /> {t('home.learn')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:120ms]">
            <Card className="overflow-hidden border-primary/30 shadow-2xl shadow-primary/10">
              <CardHeader>
                <CardTitle>{t('home.demoTitle')}</CardTitle>
                <CardDescription>{t('home.demoCaption')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--board))] p-3">
                  <div className="flex gap-2">
                    {DEMO_GUESS.map((color, i) => (
                      <Peg key={i} color={color} colorblind={cb} showLetter className="h-11 w-11" />
                    ))}
                  </div>
                  <FeedbackPegs
                    kinds={feedbackToPegs({ exact: 2, partial: 1 }, CODE_LENGTH)}
                    colorblind={cb}
                    label={t('feedback.summary', { exact: 2, partial: 1 })}
                  />
                </div>
                <div className="flex flex-wrap justify-center gap-2" aria-hidden>
                  {HERO_PEGS.map((color, i) => (
                    <Peg key={i} color={color} colorblind={cb} className="h-8 w-8 animate-peg-pop" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
                <p className="text-center font-mono text-xs text-muted-foreground">
                  {CODE_LENGTH} × {MAX_ATTEMPTS}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="container py-14">
        <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">{t('home.featuresTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ href, icon: Icon, title, body }) => (
            <Link key={href} href={href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-all group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-lg">
                <CardHeader>
                  <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{body}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="container pb-16">
        <Card className="border-primary/20 bg-gradient-to-br from-card to-accent/30">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Accessibility className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h2 className="text-xl font-bold">{t('home.accessTitle')}</h2>
              <p className="mt-1 text-muted-foreground">{t('home.accessBody')}</p>
            </div>
            <Button asChild variant="outline" className="sm:ml-auto">
              <Link href="/settings">{t('nav.settings')}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
