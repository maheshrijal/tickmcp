import { describe, expect, it } from 'vitest';
import { Props } from '../../src/auth/props';
import { tokenExchangeCallback } from '../../src/auth/oauth-metadata';

describe('OAuth tokenExchangeCallback', () => {
  it('passes props through during token exchange', async () => {
    const testProps: Props = {
      userId: 'test-user-123',
    };

    const result = tokenExchangeCallback({ props: testProps, userId: 'test-user-123' });

    expect(result).toBeDefined();
    expect(result.accessTokenProps).toBeDefined();
    expect(result.accessTokenProps.userId).toBe('test-user-123');
    expect(result.newProps.userId).toBe('test-user-123');
  });

  it('falls back to callback userId when legacy grants have no props', () => {
    const result = tokenExchangeCallback({ props: undefined, userId: 'legacy-user-456' });
    expect(result.accessTokenProps.userId).toBe('legacy-user-456');
    expect(result.newProps.userId).toBe('legacy-user-456');
  });

  it('preserves additional props when present', () => {
    const testProps: Props & { customField: string } = {
      userId: 'test-user-789',
      customField: 'custom-value',
    };

    const result = tokenExchangeCallback({ props: testProps, userId: 'test-user-789' });

    expect(result.accessTokenProps.userId).toBe('test-user-789');
    expect((result.accessTokenProps as Props & { customField: string }).customField).toBe('custom-value');
    expect(result.newProps.userId).toBe('test-user-789');
  });
});
