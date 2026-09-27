import { describe, expect, it } from 'vitest';
import { describeConfig, loadConfig } from '../../src/config.js';

const validEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/kms',
  AI_PROVIDER: 'fake',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      aiProvider: 'fake',
      aiApiKey: null,
      aiModel: null,
      maxUploadMb: 10,
      logLevel: 'info',
      clientDistDir: '../client/dist',
    });
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => loadConfig({ AI_PROVIDER: 'fake' })).toThrow(/MONGODB_URI is required/);
  });

  it('rejects a MONGODB_URI with the wrong scheme', () => {
    expect(() => loadConfig({ ...validEnv, MONGODB_URI: 'postgres://localhost/kms' })).toThrow(
      /must start with mongodb/,
    );
  });

  it('requires the API key of the selected provider', () => {
    expect(() => loadConfig({ ...validEnv, AI_PROVIDER: 'gemini' })).toThrow(
      /GEMINI_API_KEY is required when AI_PROVIDER=gemini/,
    );
  });

  it('accepts a provider with its key set', () => {
    const config = loadConfig({ ...validEnv, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'secret' });

    expect(config.aiProvider).toBe('gemini');
    expect(config.aiApiKey).toBe('secret');
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ ...validEnv, AI_PROVIDER: 'llama' })).toThrow(/AI_PROVIDER must be/);
  });

  it('rejects non-positive integers for numeric vars', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '0' })).toThrow(/PORT must be a positive integer/);
    expect(() => loadConfig({ ...validEnv, MAX_UPLOAD_MB: '2.5' })).toThrow(
      /MAX_UPLOAD_MB must be a positive integer/,
    );
  });

  it('reports every problem at once', () => {
    const run = () => loadConfig({ PORT: 'abc', AI_PROVIDER: 'gemini' });

    expect(run).toThrow(/MONGODB_URI is required/);
    expect(run).toThrow(/GEMINI_API_KEY is required/);
    expect(run).toThrow(/PORT must be a positive integer/);
  });

  it('treats blank values as unset', () => {
    const config = loadConfig({ ...validEnv, AI_MODEL: '   ', LOG_LEVEL: '' });

    expect(config.aiModel).toBeNull();
    expect(config.logLevel).toBe('info');
  });
});

describe('describeConfig', () => {
  it('never exposes the API key or Mongo credentials', () => {
    const config = loadConfig({
      MONGODB_URI: 'mongodb+srv://user:pa55w0rd@cluster0.example.net/kms',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'super-secret',
    });

    const described = JSON.stringify(describeConfig(config));

    expect(described).not.toContain('super-secret');
    expect(described).not.toContain('pa55w0rd');
    expect(described).toContain('mongodb+srv://***@cluster0.example.net/kms');
  });
});
