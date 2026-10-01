import { BadGatewayException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { reportError, reportSignal } from '../observability/error-reporting.js';
import { InterviewController } from './interview.controller.js';
import type { InterviewService } from './interview.service.js';

vi.mock('../observability/error-reporting.js', () => ({ reportError: vi.fn(), reportSignal: vi.fn() }));

function send(failure: unknown) {
  const interviews = { respond: () => Promise.reject(failure) } as unknown as InterviewService;
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    on: vi.fn(),
    status: vi.fn((status: number) => ((sent.status = status), res)),
    json: vi.fn((body: unknown) => ((sent.body = body), res)),
    end: vi.fn(),
  } as unknown as Response;
  const req = { id: 'request-1' } as Request;
  const body = { content: 'my private answer', hint: false };
  return new InterviewController(interviews).message('learner-1', 'session-1', body, req, res).then(() => sent);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('InterviewController.message failures', () => {
  it('answers a database outage before the stream with a 503, signalled rather than reported alone', async () => {
    const sent = await send(new Error('timeout exceeded when trying to connect'));
    expect(sent.status).toBe(503);
    expect(vi.mocked(reportSignal).mock.calls.map(([report]) => report.signal)).toEqual(['db.timeout']);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('leaves a mapped provider failure to its signal', async () => {
    const sent = await send(new BadGatewayException('The interviewer is unavailable right now. Please try again.'));
    expect(sent.status).toBe(502);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports an unexpected failure on its own', async () => {
    const failure = new TypeError('private learner answer');
    const sent = await send(failure);
    expect(sent.status).toBe(502);
    expect(reportError).toHaveBeenCalledWith(failure, 'request-1');
    expect(reportSignal).not.toHaveBeenCalled();
  });
});
