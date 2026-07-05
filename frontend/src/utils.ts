// Pure helper functions extracted from App.tsx so they can be unit tested
// without mocking Freighter, Soroban RPC, or React rendering.

export function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }
  
  export function formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
  
      if (typeof record.message === 'string' && record.message) {
        return record.message;
      }
      if (typeof record.error === 'string' && record.error) {
        return record.error;
      }
      if (record.error && typeof record.error === 'object') {
        const nested = record.error as Record<string, unknown>;
        if (typeof nested.message === 'string' && nested.message) {
          return nested.message;
        }
      }
  
      try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== '{}') {
          return serialized;
        }
      } catch {
        /* JSON.stringify failed */
      }
    }
  
    return 'Something went wrong. Please try again.';
  }
  
  export function parseErrorMessage(error: unknown): string {
    const raw = formatUnknownError(error);
  
    const lower = raw.toLowerCase();
  
    if (
      lower.includes('insufficient') ||
      lower.includes('underfunded') ||
      lower.includes('not enough')
    ) {
      return 'Insufficient balance';
    }
    if (
      lower.includes('user declined') ||
      lower.includes('user rejected') ||
      lower.includes('access denied') ||
      lower.includes('denied')
    ) {
      return 'Transaction cancelled';
    }
    if (
      lower.includes('freighter') ||
      lower.includes('not installed') ||
      lower.includes('connection') ||
      lower.includes('not connected')
    ) {
      return 'Connection failed';
    }
    if (lower.includes('contract not configured')) {
      return 'Service unavailable. Contract not configured.';
    }
  
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }
  
  // Safely stringify tx failure results (XDR objects have no useful toString(),
  // and can contain BigInt fields that JSON.stringify chokes on by default).
  export function formatTxErrorResult(errorResult: unknown): string {
    if (!errorResult) return 'Transaction failed on network';
  
    try {
      const serialized = JSON.stringify(errorResult, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
      return serialized && serialized !== '{}'
        ? serialized
        : 'Transaction failed on network';
    } catch {
      return 'Transaction failed on network';
    }
  }
  
  export function formatExpirationDate(expUnixSeconds: number): string {
    if (!expUnixSeconds) return '';
    const date = new Date(expUnixSeconds * 1000);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  
  export function daysRemaining(expUnixSeconds: number): number {
    if (!expUnixSeconds) return 0;
    const now = Date.now() / 1000;
    const diff = expUnixSeconds - now;
    return diff > 0 ? Math.ceil(diff / 86400) : 0;
  }