import { BrowserClient, Scope, createTransport, defaultStackParser, type Event, type StackFrame } from '@sentry/angular';
import { createClientErrorPrivacy } from './client-error-privacy';

const PRIVATE = 'private-learner-answer-token';
const LEARNER_ID = '23b56cfa-0662-4d03-8c3c-b2e49e9d7d93';
const ASSET_URL = 'https://grasp.example/main-ABC12345.js';
const ASSET_NAME = 'main-ABC12345.js';
const CONFIG = { environment: 'test', release: 'abc1234' };
const FILES = new Map([[ASSET_URL, ASSET_NAME]]);
const clients: BrowserClient[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

function setup() {
  const privacy = createClientErrorPrivacy(CONFIG, FILES, defaultStackParser);
  const bodies: string[] = [];
  const client = new BrowserClient({
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
  clients.push(client);
  return { privacy, client, bodies };
}

it('serializes only trusted diagnostics after dirty scope, attachments and late SDK enrichment', async () => {
  const { privacy, client, bodies } = setup();
  const scope = new Scope();
  scope.setUser({ id: LEARNER_ID, email: `${PRIVATE}@example.com` });
  scope.setTag('learnerId', LEARNER_ID);
  scope.setExtra('answer', PRIVATE);
  scope.setContext('learner', { answer: PRIVATE });
  scope.setFingerprint([PRIVATE]);
  scope.setTransactionName(`/interview/${LEARNER_ID}/${PRIVATE}`);
  scope.addBreadcrumb({ message: PRIVATE, data: { url: `https://grasp.example/${PRIVATE}` } });
  scope.addAttachment({ filename: `${PRIVATE}.txt`, data: PRIVATE });
  client.on('beforeSendEvent', (event, hint) => {
    event.extra = { answer: PRIVATE };
    event.tags = { learnerId: LEARNER_ID };
    event.exception!.values![0]!.value = PRIVATE;
    event.sdk = { name: PRIVATE, settings: { infer_ip: 'auto' } };
    event.sdkProcessingMetadata = { dynamicSamplingContext: { transaction: PRIVATE, trace_id: PRIVATE } };
    hint!.attachments = [{ filename: `${PRIVATE}.txt`, data: PRIVATE }];
  });
  client.on('beforeEnvelope', (envelope) => {
    envelope[0]['trace'] = { transaction: PRIVATE };
    envelope[0]['custom'] = PRIVATE;
    envelope[1][0]![0]['custom'] = PRIVATE;
    (envelope[1][0]![1] as Event).request = { url: `https://grasp.example/${LEARNER_ID}`, data: PRIVATE };
  });
  const error = new TypeError(PRIVATE, { cause: new Error(PRIVATE) });
  error.name = PRIVATE;
  error.stack = `${PRIVATE}\n    at ${PRIVATE} (${ASSET_URL}:12:9)\n    at ${PRIVATE} (https://grasp.example/${PRIVATE}.js:10:2)`;
  const [event, hint] = privacy.capture(error);
  event.request = { headers: { authorization: PRIVATE }, data: PRIVATE };
  event.message = PRIVATE;
  expect(hint.originalException).not.toBe(error);
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
    platform: 'javascript',
    level: 'error',
    environment: 'test',
    release: 'abc1234',
    tags: { category: 'type' },
    sdk: { settings: { infer_ip: 'never' } },
    exception: {
      values: [
        {
          type: 'type',
          value: 'Client operation failed',
          stacktrace: { frames: [{ filename: ASSET_NAME, in_app: true, lineno: 12, colno: 9 }] },
        },
      ],
    },
  });
});

it('discards SDK errors and every unauthorized envelope, including direct transport bypasses', async () => {
  const { privacy, client, bodies } = setup();
  client.captureException(new Error(PRIVATE));
  client.captureException(new Error(PRIVATE), { data: { __sentry__: true } });
  client.captureEvent({ message: PRIVATE, tags: { learnerId: LEARNER_ID } });
  const headers = { event_id: PRIVATE, sent_at: PRIVATE, custom: PRIVATE };
  await client.sendEnvelope([headers, [[{ type: 'event' }, { message: PRIVATE }]]]);
  await client.sendEnvelope([headers, [[{ type: 'transaction' }, { transaction: PRIVATE }]]]);
  await client.sendEnvelope([
    headers,
    [[{ type: 'session' }, { init: true, sid: LEARNER_ID, timestamp: PRIVATE, started: PRIVATE, status: 'ok', errors: 0 }]],
  ]);
  await client.sendEnvelope([
    headers,
    [
      [
        { type: 'log', item_count: 1, content_type: 'application/vnd.sentry.items.log+json' },
        { items: [{ timestamp: 0, level: 'error', body: PRIVATE }] },
      ],
    ],
  ]);
  await client.sendEnvelope([headers, [[{ type: 'attachment', filename: PRIVATE, length: PRIVATE.length }, PRIVATE]]]);
  const [event] = privacy.capture(new Error(PRIVATE));
  await client.sendEnvelope([headers, [[{ type: 'event' }, event]]]);
  await client.flush(2_000);
  expect(bodies).toEqual([]);
});

it.each(['https://grasp.example/', 'capacitor://localhost/', 'http://localhost/'])(
  'keeps exact application asset matches for %s and rejects private frame data',
  (base) => {
    const asset = `${base}${ASSET_NAME}`;
    const privacy = createClientErrorPrivacy(CONFIG, new Map([[asset, ASSET_NAME]]), defaultStackParser);
    const error = new TypeError(PRIVATE);
    error.stack = [
      PRIVATE,
      `    at ${PRIVATE} (${asset}:20:4)`,
      `    at ${PRIVATE} (${asset}?token=${PRIVATE}:21:5)`,
      `    at ${PRIVATE} (${asset}#${PRIVATE}:22:6)`,
      `    at ${PRIVATE} (${base}${PRIVATE}.js:23:7)`,
      `    at ${PRIVATE} (https://untrusted.example/${ASSET_NAME}:24:8)`,
    ].join('\n');

    const [event] = privacy.capture(error);

    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([{ filename: ASSET_NAME, in_app: true, lineno: 20, colno: 4 }]);
    expect(JSON.stringify(event)).not.toContain(PRIVATE);
  },
);

it('bounds frame counts and omits invalid coordinates, functions and local variables', () => {
  const frames: StackFrame[] = Array.from({ length: 51 }, (_, index) => ({
    filename: ASSET_URL,
    function: PRIVATE,
    vars: { answer: PRIVATE },
    pre_context: [PRIVATE],
    context_line: PRIVATE,
    post_context: [PRIVATE],
    lineno: index,
    colno: index ? index : 0,
  }));
  frames[1]!.lineno = Number.NaN;
  frames[2]!.lineno = Number.MAX_SAFE_INTEGER + 1;
  frames[3]!.lineno = -1;
  frames[4]!.colno = 1.5;
  frames[5]!.colno = 0;
  const privacy = createClientErrorPrivacy(CONFIG, FILES, () => frames);

  const [event] = privacy.capture(new Error(PRIVATE));
  const safe = event.exception?.values?.[0]?.stacktrace?.frames;

  expect(safe).toHaveLength(50);
  expect(safe?.[0]).toEqual({ filename: ASSET_NAME, in_app: true, colno: 1 });
  expect(safe?.[1]).not.toHaveProperty('lineno');
  expect(safe?.[2]).not.toHaveProperty('lineno');
  expect(safe?.[3]).not.toHaveProperty('colno');
  expect(safe?.[4]).not.toHaveProperty('colno');
  expect(safe?.at(-1)).toEqual({ filename: ASSET_NAME, in_app: true, lineno: 50, colno: 50 });
  expect(JSON.stringify(event)).not.toContain(PRIVATE);
});

it('reports a generic failure without a stack when assets are unavailable or the thrown value is not an Error', () => {
  const privacy = createClientErrorPrivacy({ environment: 'test', release: null }, new Map(), defaultStackParser);
  const error = new Error(PRIVATE);
  error.stack = `${PRIVATE}\n    at ${PRIVATE} (${ASSET_URL}:12:9)`;
  for (const value of [error, PRIVATE, null, { name: PRIVATE, message: PRIVATE, stack: error.stack }]) {
    const [event] = privacy.capture(value);
    expect(event.exception).toEqual({ values: [{ type: 'unknown', value: 'Client operation failed' }] });
    expect(event).not.toHaveProperty('release');
    expect(JSON.stringify(event)).not.toContain(PRIVATE);
  }
});
