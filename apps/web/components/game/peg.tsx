import * as React from 'react';
import { PEG_META, feedbackPegColor, type FeedbackPegKind, type PegColor } from '@mastermind/shared';
import { cn } from '@/lib/utils';

interface PegProps extends React.HTMLAttributes<HTMLSpanElement> {
  color: PegColor;
  colorblind?: boolean;
  /** Draw the letter under the shape (useful on large pegs). */
  showLetter?: boolean;
  /** Pop-in animation when the peg appears. */
  animate?: boolean;
}

/** A game peg. In colorblind mode every color carries a unique SVG shape so color is never the only cue. */
export const Peg = React.forwardRef<HTMLSpanElement, PegProps>(function Peg(
  { color, colorblind = false, showLetter = false, animate = false, className, style, ...rest },
  ref,
) {
  const meta = PEG_META[color];
  return (
    <span
      ref={ref}
      data-peg={color}
      className={cn(
        'peg-ring relative inline-block aspect-square h-10 w-10 shrink-0 select-none rounded-full',
        animate && 'animate-peg-pop',
        className,
      )}
      style={{
        background: `radial-gradient(circle at 32% 28%, ${lighten(meta.hex)} 0%, ${meta.hex} 48%, ${meta.hexDark} 100%)`,
        boxShadow: `inset 0 -2px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.35), 0 0 0 1.5px ${meta.hexDark}`,
        ...style,
      }}
      {...rest}
    >
      {colorblind && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          focusable="false"
          className="absolute inset-0 m-auto h-[58%] w-[58%] drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]"
        >
          <path d={meta.svgPath} fill={meta.textColor} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} strokeLinejoin="round" />
          {showLetter && (
            <text
              x="12"
              y="14.6"
              textAnchor="middle"
              fontSize="8"
              fontWeight={800}
              fill={meta.hexDark}
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {meta.letter}
            </text>
          )}
        </svg>
      )}
    </span>
  );
});

/** Lightens a #rrggbb color for the peg highlight. */
export function lighten(hex: string, amount = 0.38): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function EmptySlot({ className, active = false, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block aspect-square h-10 w-10 shrink-0 rounded-full border-2 border-dashed transition-colors',
        'bg-[hsl(var(--slot))]',
        active ? 'border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]' : 'border-border',
        className,
      )}
      {...rest}
    />
  );
}

/** Hidden opponent peg: shows only that something was placed, never its color. */
export function HiddenPeg({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex aspect-square h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground',
        className,
      )}
    >
      ?
    </span>
  );
}

interface FeedbackPegsProps {
  kinds: readonly FeedbackPegKind[];
  colorblind?: boolean;
  className?: string;
  label?: string;
}

/** Small feedback pegs in a compact grid. Colorblind mode switches black/white to green/yellow with glyphs. */
export function FeedbackPegs({ kinds, colorblind = false, className, label }: FeedbackPegsProps) {
  const columns = Math.ceil(kinds.length / 2);
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-grid gap-1 p-1', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {kinds.map((kind, index) => (
        <FeedbackDot key={index} kind={kind} colorblind={colorblind} />
      ))}
    </span>
  );
}

export function FeedbackDot({
  kind,
  colorblind = false,
  className,
}: {
  kind: FeedbackPegKind;
  colorblind?: boolean;
  className?: string;
}) {
  const fill = feedbackPegColor(kind, colorblind);
  return (
    <span
      data-feedback={kind}
      className={cn(
        'relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full sm:h-4 sm:w-4',
        kind === 'empty' ? 'border border-border/70 bg-[hsl(var(--slot))]' : 'border border-[var(--peg-outline)]',
        className,
      )}
      style={kind === 'empty' ? undefined : { backgroundColor: fill }}
    >
      {colorblind && kind === 'exact' && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path d="M2.5 6.4 L5 8.8 L9.5 3.6" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {colorblind && kind === 'partial' && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
          <path d="M3 6 H9" fill="none" stroke="#422006" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
