import { Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export abstract class Mailer {
  /** False when no provider is configured; sign-in by email is then unavailable. */
  abstract readonly enabled: boolean;
  abstract send(message: MailMessage): Promise<void>;
}

/** Development: prints the message (including the sign-in code) to the server log. */
export class ConsoleMailer extends Mailer {
  readonly enabled = true;
  private readonly log = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.log.log(`To ${message.to}: ${message.subject}\n${message.text}`);
  }
}

export class DisabledMailer extends Mailer {
  readonly enabled = false;

  async send(): Promise<void> {
    throw new Error('No mail provider configured');
  }
}

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer extends Mailer {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function signInEmail(code: string, minutes: number): Omit<MailMessage, 'to'> {
  return {
    subject: `${code} is your Grasp sign-in code`,
    text: `Your Grasp sign-in code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<p>Your Grasp sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p><p>It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>`,
  };
}
