import type { Round, RoundFunding } from '../api/api.types';
import { translate } from '../i18n/i18n.service';
import { formatTime } from '../member/member-format';
import type { StatusTone } from '../ui';

/** „Eine Runde Helles“, „Ganzer Abend · alle Getränke“. */
export function describeRound(round: Pick<Round, 'kind' | 'drinkName'>): string {
  const evening = round.kind === 'evening';
  if (round.drinkName) {
    return translate(evening ? 'rounds.card.eveningOf' : 'rounds.card.roundOf', {
      drink: round.drinkName,
    });
  }
  return translate(evening ? 'rounds.card.eveningAll' : 'rounds.card.roundAll');
}

/** Restzeit („noch 18 Min“), Uhrzeit des Endes oder „bis Event-Ende“. */
export function validityText(
  round: Pick<Round, 'validUntil' | 'status'>,
  now: Date = new Date(),
): string {
  if (!round.validUntil) return translate('rounds.card.untilEventEnd');
  const end = new Date(round.validUntil);
  const minutes = Math.ceil((end.getTime() - now.getTime()) / 60_000);
  if (round.status === 'running' && minutes > 0 && minutes <= 90) {
    return translate('rounds.card.remaining', { minutes });
  }
  return translate('rounds.card.until', { time: formatTime(round.validUntil) });
}

export function roundStatusLabel(round: Pick<Round, 'status'>): string {
  return translate(`rounds.status.${round.status}`);
}

export function roundStatusTone(round: Pick<Round, 'status'>): StatusTone {
  return round.status === 'running' ? 'success' : 'neutral';
}

/** Zeilenkopf am Terminal: „Runde von Thomas“ bzw. „Abend von Sabine“. */
export function payerLabel(funding: RoundFunding): string {
  return translate(funding.kind === 'evening' ? 'rounds.payer.evening' : 'rounds.payer.round', {
    name: funding.sponsorName,
  });
}
