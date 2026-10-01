import { hotAccount } from '../sysdesign/cases/ledger/contention.js';
import { contractFee } from '../sysdesign/cases/ledger/reconcile.js';
import { formatMinor, minorExponent, num } from '../sysdesign/cases/ledger/checkpoint.js';
import { expectedEffects } from '../sysdesign/cases/ledger/retries.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

const distinct = (values: number[], count = 4) => [...new Set(values.map(Math.round).filter((v) => v > 0))].slice(0, count);

const hotAccountRate = item('Postings a hot account commits', (rand) => {
  const lockMs = pick(rand, [2, 4, 5, 10]);
  const subAccounts = pick(rand, [1, 4, 8, 16]);
  const batch = pick(rand, [1, 1, 10]);
  const offered = pick(rand, [1_500, 3_000, 6_000]);
  const run = hotAccount({ offered, lockMs, subAccounts, batch });
  const [correct, ...others] = distinct([run.committed, run.capacity, 1000 / lockMs, run.capacity * 2, run.committed / 2, offered * 2], 4);
  const rate = (v: number) => `${num(v)} postings/s`;
  const sub = subAccounts === 1 ? 'is one row' : `is split into ${subAccounts} sub-accounts`;
  const per = batch === 1 ? 'one posting' : `${batch} postings`;
  return {
    prompt: `A ledger's fee account is sent ${num(offered)} postings a second. Each transaction holds its balance row's lock for ${lockMs} ms and applies ${per}, and the account ${sub}. How many postings a second does it commit?`,
    ...withChoices(rand, rate(correct), others.map(rate)),
    explain: `A row commits one transaction per lock hold, ${num(1000 / lockMs)} a second, so capacity is ${subAccounts} × ${batch} × 1,000 / ${lockMs} = ${num(run.capacity)} postings a second. ${run.utilization > 1 ? `That is below the ${num(offered)} offered, so ${num(run.capacity)} commit and the queue grows.` : `That covers the ${num(offered)} offered, so all of them commit, ${Math.round(run.utilization * 100)}% busy.`}`,
  };
});

const POWERS = ['', '²', '³'];

const retryDuplicates = item('Duplicate charges from retries without a key', (rand) => {
  const payments = pick(rand, [10_000, 100_000, 1_000_000]);
  const lost = pick(rand, [0.1, 0.2, 0.25]);
  const retries = pick(rand, [2, 3]);
  const duplicates = payments * (expectedEffects(lost, 0, retries, 'none') - 1);
  const charges = (v: number) => `about ${num(v)}`;
  return {
    prompt: `During an incident, ${Math.round(lost * 100)}% of payment attempts are charged but lose their response, and clients retry up to ${retries} times with no idempotency key. Out of ${num(payments)} payments, how many duplicate charges are there?`,
    ...withChoices(rand, charges(duplicates), [
      charges(payments * lost),
      charges(payments * lost * retries),
      'None: a retry replaces the attempt it repeats',
    ]),
    explain: `Every attempt that arrives charges the card. A payment is charged a second time when its first response is lost, a third time when the second is lost too, and so on up to ${retries} retries: ${num(payments)} × (${POWERS.slice(
      0,
      retries,
    )
      .map((p) => `${lost}${p}`)
      .join(' + ')}) ≈ ${num(duplicates)}. One idempotency key per payment, resent on every retry, makes it zero.`,
  };
});

const MONEY = [
  { currency: 'USD', major: '12.34' },
  { currency: 'JPY', major: '1500' },
  { currency: 'KWD', major: '2.5' },
  { currency: 'EUR', major: '0.10' },
  { currency: 'BHD', major: '7.125' },
] as const;

const minorUnits = item('An amount in minor units', (rand) => {
  const { currency, major } = pick(rand, MONEY);
  const exponent = minorExponent(currency);
  const [whole, fraction = ''] = major.split('.');
  const minor = Number(whole + fraction.padEnd(exponent, '0'));
  const others = [
    minor * 10,
    minor * 100,
    Math.round(minor / 10),
    Number(whole),
    Number(whole + fraction.padEnd(2, '0').slice(0, 2)),
    Number(whole + fraction.padEnd(3, '0')),
  ]
    .filter((v) => v !== minor && v > 0)
    .map((v) => `\`${v}\``);
  return {
    prompt: `A payments API sends amounts as integers in the currency's minor unit, with the ISO 4217 code beside them. Which amount does it send for ${major} ${currency}?`,
    ...withChoices(rand, `\`${minor}\``, [...new Set(others)].slice(0, 3)),
    explain: `${currency} has ${exponent === 0 ? 'no minor unit' : `${exponent} decimal places`} (exponent ${exponent}), so ${major} ${currency} is ${minor}. Using 100 for every currency breaks JPY, which has none, and KWD and BHD, which have 3. Integers keep sums exact, where binary floating point cannot even hold 0.10.`,
  };
});

const postingCloze = item('The missing posting of a capture', (rand) => {
  const amount = pick(rand, [1_250, 4_999, 5_000, 10_000, 25_000]);
  const fee = contractFee(amount);
  const merchant = amount - fee;
  const lines = [`+${amount}  processor receivable`, `-${merchant}  merchant payable`, `-${fee}  fee revenue`];
  const blank = pick(rand, [0, 1, 2]);
  const answer = lines[blank];
  const [value, ...name] = answer.split('  ');
  const flipped = `${value.startsWith('+') ? '-' : '+'}${value.slice(1)}  ${name.join('  ')}`;
  const wrong = blank === 0 ? merchant : blank === 1 ? amount : merchant;
  return {
    prompt: `A card capture of ${formatMinor(amount, 'USD')} (${amount} cents) splits into the merchant's share and the platform's fee at a typical card rate, 2.9% plus 30 cents (${fee} cents). Debits are positive and credits negative. Which posting completes the entry?`,
    code: { lines: ['entry: capture of order 1042', ...lines.map((l) => `  ${l}`)], blank: blank + 1 },
    ...withChoices(rand, answer, [flipped, `${value[0]}${wrong}  ${name.join('  ')}`, `${value[0]}${amount + fee}  ${name.join('  ')}`]),
    explain: `An entry's postings sum to zero: ${amount} - ${merchant} - ${fee} = 0. The processor owes us the whole ${amount} (a debit), and we owe the merchant ${merchant} and keep ${fee} as revenue (credits).`,
  };
});

const ledgerInvariant = concept(
  'A bug posted only the debit half of some transfers. Which continuous check catches it?',
  'The sum of every posting in the ledger is zero in each currency',
  [
    'No account balance is ever negative',
    'The number of entries equals the number of payments',
    'Cached balances on the primary equal those on the replicas',
  ],
  'Double entry makes every correct entry sum to zero, so the whole ledger does too; one missing half leaves the total off by exactly that amount. A one-sided debit can leave every balance positive, entries still match payments one to one, and replicas copy the bug faithfully.',
);

const crossShardTransfer = concept(
  'A wallet transfer moves $50 between two users whose accounts live on different ledger shards. How do you post it?',
  'Two entries, one on each shard, through an in-transit account on each',
  [
    'One entry whose postings span both shards, committed with two-phase commit',
    "Debit the sender now and add to the receiver's balance in a nightly batch",
    'Move one user to the other shard before every transfer between them',
  ],
  "Each entry balances on its own shard, the second is delivered through the first shard's outbox with the transfer id as its idempotency key, and until it lands the in-transit accounts show exactly the money in flight. A reversal undoes it if the receiver cannot take it. Cross-service 2PC holds locks in doubt when the coordinator fails, and a nightly batch leaves money nowhere for a day.",
);

export const LEDGER_ITEMS = {
  'hot-account': hotAccountRate,
  'retry-duplicates': retryDuplicates,
  'minor-units': minorUnits,
  'posting-cloze': postingCloze,
  'ledger-invariant': ledgerInvariant,
  'cross-shard-transfer': crossShardTransfer,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
