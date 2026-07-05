import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  truncateAddress,
  formatUnknownError,
  parseErrorMessage,
  formatTxErrorResult,
  formatExpirationDate,
  daysRemaining,
} from './utils';

describe('truncateAddress', () => {
  it('truncates long addresses to first 4 and last 4 characters', () => {
    expect(truncateAddress('GBQOABCDEFGHIJKLMNOPQRSTUVWXYZGJ22')).toBe(
      'GBQO…GJ22',
    );
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('GBQO')).toBe('GBQO');
  });
});

describe('formatUnknownError', () => {
  it('returns the message of an Error instance', () => {
    expect(formatUnknownError(new Error('boom'))).toBe('boom');
  });

  it('returns a plain string as-is', () => {
    expect(formatUnknownError('raw string error')).toBe('raw string error');
  });

  it('extracts message from a plain object with a message field', () => {
    expect(formatUnknownError({ message: 'nested message' })).toBe(
      'nested message',
    );
  });

  it('extracts nested error.message when present', () => {
    expect(
      formatUnknownError({ error: { message: 'deeply nested' } }),
    ).toBe('deeply nested');
  });

  it('never returns the literal "[object Object]" for a plain object', () => {
    const result = formatUnknownError({ code: 500, foo: 'bar' });
    expect(result).not.toBe('[object Object]');
    expect(result).toContain('foo');
  });

  it('falls back to a generic message for unrecognized input', () => {
    expect(formatUnknownError(undefined)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('parseErrorMessage', () => {
  it('maps insufficient balance errors to a friendly message', () => {
    expect(parseErrorMessage(new Error('Insufficient funds'))).toBe(
      'Insufficient balance',
    );
  });

  it('maps user rejection errors to "Transaction cancelled"', () => {
    expect(parseErrorMessage(new Error('User declined access'))).toBe(
      'Transaction cancelled',
    );
  });

  it('maps Freighter connection errors to "Connection failed"', () => {
    expect(parseErrorMessage(new Error('Freighter not installed'))).toBe(
      'Connection failed',
    );
  });

  it('maps unconfigured contract errors correctly', () => {
    expect(
      parseErrorMessage(new Error('contract not configured properly')),
    ).toBe('Service unavailable. Contract not configured.');
  });

  it('truncates very long unrecognized error messages to 120 chars', () => {
    const longMessage = 'x'.repeat(200);
    const result = parseErrorMessage(new Error(longMessage));
    expect(result.length).toBe(121); // 120 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('formatTxErrorResult', () => {
  it('returns a fallback message when errorResult is null/undefined', () => {
    expect(formatTxErrorResult(null)).toBe('Transaction failed on network');
    expect(formatTxErrorResult(undefined)).toBe(
      'Transaction failed on network',
    );
  });

  it('serializes a plain object instead of producing "[object Object]"', () => {
    const result = formatTxErrorResult({ code: 'ERR', detail: 'bad op' });
    expect(result).not.toBe('[object Object]');
    expect(result).toContain('bad op');
  });

  it('safely serializes objects containing BigInt fields', () => {
    const result = formatTxErrorResult({ amount: BigInt(1000) });
    expect(result).toContain('1000');
  });
});

describe('formatExpirationDate', () => {
  it('returns an empty string for a zero/falsy timestamp', () => {
    expect(formatExpirationDate(0)).toBe('');
  });

  it('formats a unix timestamp into a readable date', () => {
    // 2026-08-04T00:00:00Z
    const ts = Date.UTC(2026, 7, 4) / 1000;
    const result = formatExpirationDate(ts);
    expect(result).toMatch(/2026/);
  });
});

describe('daysRemaining', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for a zero/falsy timestamp', () => {
    expect(daysRemaining(0)).toBe(0);
  });

  it('returns 0 when the expiration is in the past', () => {
    const pastTs = Date.now() / 1000 - 86400;
    expect(daysRemaining(pastTs)).toBe(0);
  });

  it('returns the correct number of whole days remaining', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T00:00:00Z'));

    const futureTs = Date.UTC(2026, 7, 4) / 1000; // 30 days later
    expect(daysRemaining(futureTs)).toBe(30);
  });
});