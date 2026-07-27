jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));
jest.mock('~/models', () => ({
  findOnePluginAuth: jest.fn(),
  updatePluginAuth: jest.fn(),
  deletePluginAuth: jest.fn(),
}));

const { decrypt } = require('@librechat/api');
const { findOnePluginAuth } = require('~/models');
const { getOptionalUserPluginAuthValue } = require('../PluginService');

describe('getOptionalUserPluginAuthValue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null only when the requested auth row is absent', async () => {
    findOnePluginAuth.mockResolvedValue(null);

    await expect(
      getOptionalUserPluginAuthValue('user-1', 'COURSEWING_FIELD', 'coursewing'),
    ).resolves.toBeNull();
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('decrypts a present optional auth value', async () => {
    findOnePluginAuth.mockResolvedValue({ value: 'encrypted-value' });
    decrypt.mockResolvedValue('decrypted-value');

    await expect(
      getOptionalUserPluginAuthValue('user-1', 'COURSEWING_FIELD', 'coursewing'),
    ).resolves.toBe('decrypted-value');
    expect(findOnePluginAuth).toHaveBeenCalledWith({
      userId: 'user-1',
      authField: 'COURSEWING_FIELD',
      pluginKey: 'coursewing',
    });
  });

  it('propagates storage failures instead of treating them as an absent value', async () => {
    findOnePluginAuth.mockRejectedValue(new Error('database unavailable'));

    await expect(
      getOptionalUserPluginAuthValue('user-1', 'COURSEWING_FIELD', 'coursewing'),
    ).rejects.toThrow('database unavailable');
  });

  it('propagates decryption failures instead of treating them as an absent value', async () => {
    findOnePluginAuth.mockResolvedValue({ value: 'corrupt-ciphertext' });
    decrypt.mockRejectedValue(new Error('decryption failed'));

    await expect(
      getOptionalUserPluginAuthValue('user-1', 'COURSEWING_FIELD', 'coursewing'),
    ).rejects.toThrow('decryption failed');
  });
});
