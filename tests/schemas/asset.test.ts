import { describe, it, expect } from 'bun:test'
import {
  MessageAssetUrlSchema,
  MessageAttachmentSchema,
  AssetSchema,
  AssetUploadSchema,
  ImageTransformOptionsSchema,
  CreateUploadResponseSchema,
  UploadChunkResponseSchema,
  CompleteUploadResponseSchema,
  CancelUploadResponseSchema,
  GetAssetResponseSchema,
  BatchGetAssetsResponseSchema,
} from '../../src/schemas/asset'

const assetUrl = { url: 'https://cdn.example.com/a.png?sig=x', expiresAt: '2026-07-13T10:00:00Z' }

const asset = {
  id: 'as_1',
  filename: 'a.png',
  contentType: 'image/png',
  size: '2048',
  width: 100,
  height: 80,
  assetUrl,
  thumbnailAssetUrl: assetUrl,
}

const videoAttachment = {
  id: 'as_v',
  filename: 'clip.mp4',
  contentType: 'video/mp4',
  width: 1920,
  height: 1080,
  assetUrl,
  videoProcessing: {
    status: 'MESSAGE_VIDEO_PROCESSING_STATUS_COMPLETED',
    durationMs: '4200',
    width: 1920,
    height: 1080,
    sourceAvailable: true,
    variants: [
      { quality: '720p', width: 1280, height: 720, size: '999', assetUrl },
    ],
  },
}

describe('MessageAssetUrlSchema', () => {
  it('parses a signed url with expiry', () => {
    const u = MessageAssetUrlSchema.parse(assetUrl)
    expect(u.url).toBe(assetUrl.url)
    expect(u.expiresAt).toBe('2026-07-13T10:00:00Z')
  })
})

describe('AssetSchema', () => {
  it('parses an asset and coerces int64 size from string', () => {
    const a = AssetSchema.parse(asset)
    expect(a.size).toBe(2048)
    expect(typeof a.size).toBe('number')
    expect(a.assetUrl?.url).toBe(assetUrl.url)
  })
})

describe('MessageAttachmentSchema', () => {
  it('parses an image attachment without size', () => {
    const a = MessageAttachmentSchema.parse({
      id: 'at_1', filename: 'p.png', contentType: 'image/png', width: 10, height: 10, assetUrl,
    })
    expect(a.id).toBe('at_1')
  })

  it('parses a video attachment with processing metadata', () => {
    const a = MessageAttachmentSchema.parse(videoAttachment)
    expect(a.videoProcessing?.status).toBe('MESSAGE_VIDEO_PROCESSING_STATUS_COMPLETED')
    expect(a.videoProcessing?.durationMs).toBe(4200)
    expect(a.videoProcessing?.variants[0]?.size).toBe(999)
  })

  it('falls back to UNSPECIFIED for an unknown video status', () => {
    const a = MessageAttachmentSchema.parse({
      ...videoAttachment,
      videoProcessing: { ...videoAttachment.videoProcessing, status: 'SOMETHING_NEW' },
    })
    expect(a.videoProcessing?.status).toBe('MESSAGE_VIDEO_PROCESSING_STATUS_UNSPECIFIED')
  })
})

describe('AssetUploadSchema', () => {
  it('parses an open upload session coercing int64/int32 numbers', () => {
    const u = AssetUploadSchema.parse({
      uploadId: 'up_1',
      roomId: 'R_1',
      status: 'ASSET_UPLOAD_STATUS_OPEN',
      committedOffset: '0',
      size: '5000',
      maxChunkSize: 1024,
      sha256: 'a'.repeat(64),
    })
    expect(u.status).toBe('ASSET_UPLOAD_STATUS_OPEN')
    expect(u.committedOffset).toBe(0)
    expect(u.size).toBe(5000)
    expect(u.maxChunkSize).toBe(1024)
  })

  it('falls back to UNSPECIFIED for an unknown upload status', () => {
    const u = AssetUploadSchema.parse({
      uploadId: 'up_1', roomId: 'R_1', status: 'WAT', committedOffset: '0', size: '0', maxChunkSize: 1, sha256: 'a'.repeat(64),
    })
    expect(u.status).toBe('ASSET_UPLOAD_STATUS_UNSPECIFIED')
  })
})

describe('ImageTransformOptionsSchema', () => {
  it('parses thumbnail transform options', () => {
    const t = ImageTransformOptionsSchema.parse({ width: 64, height: 64, fit: 'IMAGE_FIT_MODE_COVER' })
    expect(t.fit).toBe('IMAGE_FIT_MODE_COVER')
  })
})

describe('response wrappers', () => {
  it('parses CreateUploadResponse', () => {
    const r = CreateUploadResponseSchema.parse({
      upload: { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_OPEN', committedOffset: '0', size: '10', maxChunkSize: 5, sha256: 'a'.repeat(64) },
    })
    expect(r.upload.uploadId).toBe('up_1')
  })

  it('parses UploadChunkResponse and CancelUploadResponse', () => {
    const upload = { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_OPEN', committedOffset: '5', size: '10', maxChunkSize: 5, sha256: 'a'.repeat(64) }
    expect(UploadChunkResponseSchema.parse({ upload }).upload.committedOffset).toBe(5)
    expect(CancelUploadResponseSchema.parse({ upload }).upload.uploadId).toBe('up_1')
  })

  it('parses CompleteUploadResponse with upload and asset', () => {
    const r = CompleteUploadResponseSchema.parse({
      upload: { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_COMPLETED', committedOffset: '2048', size: '2048', maxChunkSize: 1024, sha256: 'a'.repeat(64), assetId: 'as_1' },
      asset,
    })
    expect(r.asset.id).toBe('as_1')
    expect(r.upload.assetId).toBe('as_1')
  })

  it('parses GetAssetResponse and BatchGetAssetsResponse', () => {
    expect(GetAssetResponseSchema.parse({ asset }).asset.id).toBe('as_1')
    const b = BatchGetAssetsResponseSchema.parse({ assets: [asset] })
    expect(b.assets).toHaveLength(1)
  })

  it('defaults BatchGetAssetsResponse assets to empty array', () => {
    expect(BatchGetAssetsResponseSchema.parse({}).assets).toEqual([])
  })
})
