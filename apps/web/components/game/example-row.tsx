'use client';

import { evaluateGuess, feedbackToPegs, PEG_META, type PegColor } from '@mastermind/shared';
import { useI18n } from '@/providers/i18n-provider';
import { FeedbackPegs, Peg } from './peg';

/** Static, computed illustration of a guess against a secret. Feedback comes from `evaluateGuess`. */
export function ExampleRow({
  secret,
  guess,
  colorblind,
  caption,
}: {
  secret: readonly PegColor[];
  guess: readonly PegColor[];
  colorblind: boolean;
  caption: string;
}) {
  const { t } = useI18n();
  const feedback = evaluateGuess(secret, guess);
  const summary = t('feedback.summary', { exact: feedback.exact, partial: feedback.partial });
  return (
    <figure className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_auto] sm:items-center sm:gap-6">
        <PegStrip label={t('rules.feedback.exampleSecret')} colors={secret} colorblind={colorblind} small />
        <PegStrip label={t('rules.feedback.exampleGuess')} colors={guess} colorblind={colorblind} />
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('rules.feedback.exampleResult')}
          </p>
          <FeedbackPegs kinds={feedbackToPegs(feedback, guess.length)} colorblind={colorblind} label={summary} />
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
      </div>
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function PegStrip({
  label,
  colors,
  colorblind,
  small = false,
}: {
  label: string;
  colors: readonly PegColor[];
  colorblind: boolean;
  small?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex gap-1.5">
        {colors.map((color, i) => (
          <Peg
            key={i}
            color={color}
            colorblind={colorblind}
            showLetter
            className={small ? 'h-8 w-8' : 'h-10 w-10'}
            role="img"
            aria-label={t(PEG_META[color].nameKey)}
          />
        ))}
      </div>
    </div>
  );
}
