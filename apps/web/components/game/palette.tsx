'use client';

import * as React from 'react';
import { GAME_PALETTE, PEG_META, type PegColor } from '@mastermind/shared';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n-provider';
import { Peg } from './peg';

interface PaletteProps {
  onPick: (color: PegColor) => void;
  colorblind: boolean;
  disabled?: boolean;
  palette?: readonly PegColor[];
  className?: string;
}

export function Palette({ onPick, colorblind, disabled = false, palette = GAME_PALETTE, className }: PaletteProps) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t('play.palette')} className={cn('flex flex-wrap items-end justify-center gap-2 sm:gap-3', className)}>
      {palette.map((color, index) => {
        const meta = PEG_META[color];
        const name = t(meta.nameKey);
        return (
          <button
            key={color}
            type="button"
            disabled={disabled}
            onClick={() => onPick(color)}
            aria-label={`${name} (${index + 1})`}
            title={`${name} (${index + 1})`}
            className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95"
          >
            <Peg color={color} colorblind={colorblind} showLetter className="h-11 w-11 sm:h-12 sm:w-12" />
            <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">{index + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}
