import { describe, it, expect } from 'bun:test'
import { Attachment } from '../../src/resources/attachment'

const assetUrl = { url: 'https://cdn.example.com/a.png?sig=x', expiresAt: '2026-07-13T10:00:00Z' }

describe('Attachment', () => {
  it('wraps an Asset (upload result) including size', () => {
    const a = new Attachment({
      id: 'as_1',
      filename: 'a.png',
      contentType: 'image/png',
      size: 2048,
      width: 100,
      height: 80,
      assetUrl,
      thumbnailAssetUrl: assetUrl,
    })
    expect(a.id).toBe('as_1')
    expect(a.filename).toBe('a.png')
    expect(a.size).toBe(2048)
    expect(a.width).toBe(100)
    expect(a.url).toBe(assetUrl.url)
    expect(a.urlExpiresAt).toBe('2026-07-13T10:00:00Z')
    expect(a.thumbnailUrl).toBe(assetUrl.url)
    expect(a.isImage).toBe(true)
    expect(a.isVideo).toBe(false)
  })

  it('wraps a MessageAttachment with no size and no urls', () => {
    const a = new Attachment({
      id: 'at_1',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
    })
    expect(a.size).toBeUndefined()
    expect(a.url).toBeUndefined()
    expect(a.thumbnailUrl).toBeUndefined()
    expect(a.isImage).toBe(false)
    expect(a.isVideo).toBe(false)
  })

  it('exposes video processing metadata', () => {
    const a = new Attachment({
      id: 'as_v',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      videoProcessing: {
        status: 'MESSAGE_VIDEO_PROCESSING_STATUS_COMPLETED',
        durationMs: 4200,
        variants: [],
      },
    })
    expect(a.isVideo).toBe(true)
    expect(a.videoProcessing?.status).toBe('MESSAGE_VIDEO_PROCESSING_STATUS_COMPLETED')
  })
})
