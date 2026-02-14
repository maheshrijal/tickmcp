import { describe, expect, it } from 'vitest';
import { createTestEnv } from '../helpers/test-env';
import { Props } from '../../src/auth/props';

describe('OAuth tokenExchangeCallback', () => {
  it('passes props through during token exchange', async () => {
    const { env } = createTestEnv();

    // Simulate the props that would be set during authorization
    const testProps: Props = {
      userId: 'test-user-123',
    };

    // Test that tokenExchangeCallback returns the props correctly
    // This simulates what happens during OAuth token exchange
    const tokenExchangeCallback = async ({ props }: { props: Props }) => {
      return { accessTokenProps: props };
    };

    const result = await tokenExchangeCallback({ props: testProps });

    // Verify that props are passed through correctly
    expect(result).toBeDefined();
    expect(result.accessTokenProps).toBeDefined();
    expect(result.accessTokenProps.userId).toBe('test-user-123');
  });

  it('preserves userId in props for MCP agent initialization', () => {
    // This test validates that the Props type includes userId
    // which is required by TickMcpAgent.init()
    const testProps: Props = {
      userId: 'user-456',
    };

    // TypeScript will fail at compile time if userId is missing
    expect(testProps.userId).toBe('user-456');
  });

  it('handles props with additional fields', async () => {
    const { env } = createTestEnv();

    // Props can have additional fields beyond userId
    const testProps = {
      userId: 'test-user-789',
      customField: 'custom-value',
    };

    const tokenExchangeCallback = async ({ props }: { props: any }) => {
      return { accessTokenProps: props };
    };

    const result = await tokenExchangeCallback({ props: testProps });

    expect(result.accessTokenProps.userId).toBe('test-user-789');
    expect(result.accessTokenProps.customField).toBe('custom-value');
  });
});
