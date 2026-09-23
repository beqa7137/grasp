import { ResendMailer, signInEmail } from './mailer.js';

describe('ResendMailer', () => {
  it('posts the message to the Resend API and surfaces failures', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = new ResendMailer('re_test_key', 'Grasp <login@grasp.dev>', async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return new Response('{"id":"1"}', { status: 200 });
    });
    await ok.send({ to: 'ada@example.com', ...signInEmail('123456', 10) });
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer re_test_key');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      from: 'Grasp <login@grasp.dev>',
      to: ['ada@example.com'],
      subject: '123456 is your Grasp sign-in code',
    });

    const failing = new ResendMailer('re_test_key', 'x@y.z', async () => new Response('domain not verified', { status: 403 }));
    await expect(failing.send({ to: 'a@b.co', subject: 's', text: 't', html: 'h' })).rejects.toThrow(
      'Resend responded 403: domain not verified',
    );
  });
});
