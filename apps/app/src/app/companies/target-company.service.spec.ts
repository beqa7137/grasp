import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { replay, type TargetInput } from '@grasp/engine';
import { ProgressService } from '../core/progress.service';
import { TargetCompanyService } from './target-company.service';

const rounds = { coding: 2, design: 1, behavioral: 1 };

function companyOf(target: TargetInput | null) {
  TestBed.resetTestingModule();
  const events = target ? [{ id: 't', at: '2026-11-01T09:00:00.000Z', type: 'target.set' as const, target }] : [];
  TestBed.configureTestingModule({ providers: [{ provide: ProgressService, useValue: { state: signal(replay(events)) } }] });
  return TestBed.inject(TargetCompanyService).company();
}

describe('TargetCompanyService', () => {
  it('names the set Target company only when this client offers it', () => {
    expect(companyOf({ level: 'mid', rounds, company: 'microsoft' })).toBe('microsoft');
    expect(companyOf({ level: 'mid', rounds, company: 'amazon' })).toBeNull();
    expect(companyOf({ level: 'mid', rounds })).toBeNull();
    expect(companyOf(null)).toBeNull();
  });
});
