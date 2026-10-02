/**
 * How many spaced revisits each mission has, in the order the Design Lab lists them. Progress needs only the count, and
 * this keeps the revisits' conditions off the first paint.
 */
export const SCENARIO_REVISITS: Readonly<Record<string, number>> = {
  'first-scale-up': 3,
  'viral-feed': 3,
  'flash-sale': 3,
  'bot-storm': 3,
  'write-wall': 3,
  'leaderboard-budget': 3,
  'mail-attachments': 3,
  'ledger-month-end': 3,
  'deploy-wave': 3,
};
