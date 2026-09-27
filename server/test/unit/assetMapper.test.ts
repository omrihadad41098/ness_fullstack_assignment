import { describe, expect, it } from 'vitest';
import { toAssetDto } from '../../src/services/assetMapper.js';
import { assetRecord } from './fakes.js';

describe('toAssetDto', () => {
  it('maps a record to the documented DTO', () => {
    const record = assetRecord({
      originalName: 'cat.png',
      mimeType: 'image/png',
      kind: 'image',
      sizeBytes: 2048,
      status: 'ready',
      title: 'Black cat',
      description: 'A black cat sitting on a windowsill.',
      tags: ['cat', 'black'],
      keywords: ['animal'],
      extractedText: null,
    });

    const dto = toAssetDto(record);

    expect(dto).toEqual({
      id: record._id.toString(),
      originalName: 'cat.png',
      mimeType: 'image/png',
      kind: 'image',
      sizeBytes: 2048,
      status: 'ready',
      error: null,
      title: 'Black cat',
      description: 'A black cat sitting on a windowsill.',
      tags: ['cat', 'black'],
      extractedText: null,
      contentUrl: `/api/assets/${record._id.toString()}/content`,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-01-02T03:04:06.000Z',
    });
  });

  it('keeps extracted text only for text files, never for images', () => {
    const image = assetRecord({
      kind: 'image',
      mimeType: 'image/png',
      extractedText: 'OCR leftover',
    });
    const text = assetRecord({
      kind: 'text',
      mimeType: 'text/plain',
      extractedText: 'hello',
    });

    expect(toAssetDto(image).extractedText).toBeNull();
    expect(toAssetDto(text).extractedText).toBe('hello');
  });

  it('never leaks storage or AI provenance fields', () => {
    const record = assetRecord({ aiProvider: 'gemini', aiModel: 'flash', promptVersion: 'v1' });

    const dto = JSON.stringify(toAssetDto(record));

    expect(dto).not.toContain(record.fileId.toString());
    expect(dto).not.toContain('gemini');
    expect(dto).not.toContain('promptVersion');
  });

  it('builds a relative contentUrl so it works on any host', () => {
    expect(toAssetDto(assetRecord()).contentUrl).toMatch(/^\/api\/assets\/[0-9a-f]{24}\/content$/);
  });
});
