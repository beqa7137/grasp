import { NodeClient, Scope, createTransport, defaultStackParser, type Event } from '@sentry/node';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createSentryPrivacy } from './sentry-privacy.js';

const PRIVATE = 'private-learner-answer-token-sql-parameter';
const REQUEST_ID = '6e206bb4-f190-4a7a-b4f6-bb2cfefc3478';
const LEARNER_ID = '23b56cfa-0662-4d03-8c3c-b2e49e9d7d93';
const SOURCE_FILE = fileURLToPath(new URL('./request-context.ts', import.meta.url));

function setup() {
  const privacy = createSentryPrivacy(loadConfig({ SENTRY_ENVIRONMENT: 'test', RELEASE: 'abc1234' }), defaultStackParser);
  const bodies: string[] = [];
  const client = new NodeClient({
    dsn: 'https://public@errors.example/1',
    integrations: [],
    stackParser: defaultStackParser,
    beforeSend: privacy.beforeSend,
    sendClientReports: false,
    transport: (options) =>
      privacy.transport(
        createTransport(options, (request) => {
          bodies.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
          return Promise.resolve({ statusCode: 200 });
        }),
      ),
  });
  client.init();
  return { privacy, client, bodies };
}

it('serializes only trusted diagnostics after dirty scope, causes, attachments, and late SDK enrichment', async () => {
  const { privacy, client, bodies } = setup();
  const scope = new Scope();
  scope.setUser({ id: LEARNER_ID, email: `${PRIVATE}@example.com` });
  scope.setTag('requestId', LEARNER_ID);
  scope.setExtra('answer', PRIVATE);
  scope.setContext('learner', { answer: PRIVATE });
  scope.setFingerprint([PRIVATE]);
  scope.setTransactionName(`/api/learners/${LEARNER_ID}/${PRIVATE}`);
  scope.addBreadcrumb({ message: PRIVATE, data: { query: PRIVATE } });
  scope.addAttachment({ filename: `${PRIVATE}.txt`, data: PRIVATE });
  client.on('beforeSendEvent', (event, hint) => {
    event.extra = { answer: PRIVATE };
    event.tags = { requestId: LEARNER_ID };
    event.exception!.values![0]!.value = PRIVATE;
    event.sdkProcessingMetadata = { dynamicSamplingContext: { transaction: PRIVATE, trace_id: PRIVATE } };
    hint!.attachments = [{ filename: `${PRIVATE}.txt`, data: PRIVATE }];
  });
  client.on('beforeEnvelope', (envelope) => {
    envelope[0].trace = { transaction: PRIVATE };
    envelope[0].custom = PRIVATE;
    envelope[1][0]![0].custom = PRIVATE;
    (envelope[1][0]![1] as Event).request = { url: `/api/learners/${LEARNER_ID}`, data: PRIVATE };
  });
  const cause = Object.assign(new Error(PRIVATE, { cause: new Error(PRIVATE) }), { code: '23505', detail: PRIVATE });
  const error = new DrizzleQueryError(`insert into answers values ('${PRIVATE}')`, [PRIVATE, LEARNER_ID], cause);
  error.name = PRIVATE;
  error.stack = `${PRIVATE}\n    at ${PRIVATE} (${SOURCE_FILE}:12:9)\n    at ${PRIVATE} (/api/learners/${LEARNER_ID}/${PRIVATE}.js:10:2)`;
  const [event, hint] = privacy.capture(error, REQUEST_ID);
  event.request = { headers: { authorization: PRIVATE }, data: PRIVATE };
  event.message = PRIVATE;
  client.captureEvent(event, hint, scope);
  await client.flush(2_000);

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).not.toContain(PRIVATE);
  expect(bodies[0]).not.toContain(LEARNER_ID);
  const [headers, itemHeaders, payload] = bodies[0]!
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(headers).toEqual({ event_id: expect.stringMatching(/^[a-f0-9]{32}$/), sent_at: expect.any(String) });
  expect(itemHeaders).toEqual({ type: 'event' });
  expect(payload).toEqual({
    event_id: headers.event_id,
    timestamp: expect.any(Number),
    platform: 'node',
    level: 'error',
    environment: 'test',
    release: 'abc1234',
    tags: { category: 'database', code: '23505', requestId: REQUEST_ID },
    exception: {
      values: [
        {
          type: 'database',
          value: 'Server operation failed',
          stacktrace: { frames: [{ filename: 'api/observability/request-context.ts', in_app: true, lineno: 12, colno: 9 }] },
        },
      ],
    },
  });
  await client.close();
});

it('discards untrusted SDK events and non-error envelopes even when they bypass beforeSend', async () => {
  const { privacy, client, bodies } = setup();
  client.captureException(new Error(PRIVATE));
  client.captureEvent({ message: PRIVATE, tags: { requestId: REQUEST_ID } });
  const headers = { event_id: PRIVATE, sent_at: PRIVATE, custom: PRIVATE };
  await client.sendEnvelope([headers, [[{ type: 'event' }, { message: PRIVATE }]]]);
  await client.sendEnvelope([headers, [[{ type: 'transaction' }, { transaction: PRIVATE }]]]);
  const [event] = privacy.capture(new Error(PRIVATE), REQUEST_ID);
  await client.sendEnvelope([headers, [[{ type: 'event' }, event]]]);
  await client.flush(2_000);
  expect(bodies).toEqual([]);
  await client.close();
});

it('ignores request IDs from scope and rejects dynamic filenames, function names, and message-derived values', async () => {
  const { privacy, client, bodies } = setup();
  const scope = new Scope();
  scope.setTag('requestId', LEARNER_ID);
  const error = Object.assign(new TypeError(PRIVATE), { code: PRIVATE });
  error.stack = `${PRIVATE}\n    at ${PRIVATE} (file://${SOURCE_FILE}:20:4)\n    at ${PRIVATE} (file://${SOURCE_FILE}?token=${PRIVATE}:21:5)\n    at ${PRIVATE} (/tmp/${PRIVATE}.js:22:6)`;
  client.captureEvent(...privacy.capture(error), scope);
  await client.flush(2_000);
  expect(bodies).toHaveLength(1);
  const payload = JSON.parse(bodies[0]!.trim().split('\n')[2]!) as Event;
  expect(payload.tags).toEqual({ category: 'type', code: 'unknown' });
  expect(payload.exception?.values?.[0]?.stacktrace?.frames).toEqual([
    { filename: 'api/observability/request-context.ts', in_app: true, lineno: 20, colno: 4 },
  ]);
  expect(bodies[0]).not.toContain(PRIVATE);
  expect(bodies[0]).not.toContain(LEARNER_ID);
  await client.close();
});

it('sends a failure signal as counts and fixed names only, grouped by a stable fingerprint', async () => {
  const { privacy, client, bodies } = setup();
  const scope = new Scope();
  scope.setUser({ id: LEARNER_ID, email: `${PRIVATE}@example.com` });
  scope.setExtra('answer', PRIVATE);
  scope.setFingerprint([PRIVATE]);
  const [event, hint] = privacy.signal({ signal: 'rate-limit.store', failures: 12, category: 'database', code: '57014' });
  client.captureEvent(event, hint, scope);
  await client.flush(2_000);

  expect(bodies).toHaveLength(1);
  expect(bodies[0]).not.toContain(PRIVATE);
  expect(bodies[0]).not.toContain(LEARNER_ID);
  const payload = JSON.parse(bodies[0]!.trim().split('\n')[2]!) as Event;
  expect(payload).toEqual({
    event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
    timestamp: expect.any(Number),
    platform: 'node',
    level: 'error',
    environment: 'test',
    release: 'abc1234',
    message: 'Failure signal rate-limit.store',
    fingerprint: ['failure-signal', 'rate-limit.store'],
    tags: { signal: 'rate-limit.store', category: 'database', code: '57014' },
    extra: { failures: 12 },
  });
  await client.close();
});

it.each([PRIVATE, 'malformed-request-id', '00000000-0000-0000-0000-000000000000'])('drops invalid correlation: %s', (requestId) => {
  const privacy = createSentryPrivacy(loadConfig({}), defaultStackParser);
  const [event] = privacy.capture(new Error(PRIVATE), requestId);
  expect(event.tags).not.toHaveProperty('requestId');
});
