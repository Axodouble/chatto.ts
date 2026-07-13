import { describe, it, expect, mock } from 'bun:test'
import { AssetManager } from '../../src/managers/assets'
import { Attachment } from '../../src/resources/attachment'
import { ChattoValidationError } from '../../src/errors'
import { toBase64, sha256Hex } from '../../src/util/bytes'

const UPLOAD_SVC = 'chatto.api.v1.AssetUploadService'
const ASSET_SVC = 'chatto.api.v1.AssetService'

const asset = (id = 'as_1') => ({
  id, filename: 'a.bin', contentType: 'application/octet-stream', size: 10,
})

/**
 * Dispatching rest.post mock. `maxChunkSize` shapes the CreateUpload response so
 * a single test can force one or many chunks.
 */
function makeCtx(maxChunkSize: number, opts: { failChunk?: boolean } = {}) {
  const post = mock(async (service: string, method: string, input: any) => {
    if (service === UPLOAD_SVC && method === 'CreateUpload') {
      return { upload: { uploadId: 'up_1', roomId: input.roomId, status: 'ASSET_UPLOAD_STATUS_OPEN', committedOffset: 0, size: Number(input.size), maxChunkSize, sha256: input.sha256 } }
    }
    if (service === UPLOAD_SVC && method === 'UploadChunk') {
      if (opts.failChunk) throw new Error('chunk boom')
      return { upload: { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_OPEN', committedOffset: input.offset, size: 10, maxChunkSize, sha256: 'x' } }
    }
    if (service === UPLOAD_SVC && method === 'CompleteUpload') {
      return { upload: { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_COMPLETED', committedOffset: 10, size: 10, maxChunkSize, sha256: 'x', assetId: 'as_1' }, asset: asset() }
    }
    if (service === UPLOAD_SVC && method === 'CancelUpload') {
      return { upload: { uploadId: 'up_1', roomId: 'R_1', status: 'ASSET_UPLOAD_STATUS_CANCELLED', committedOffset: 0, size: 10, maxChunkSize, sha256: 'x' } }
    }
    if (service === ASSET_SVC && method === 'GetAsset') return { asset: asset() }
    if (service === ASSET_SVC && method === 'BatchGetAssets') return { assets: (input.assetIds as string[]).map(asset) }
    throw new Error(`unexpected ${service}/${method}`)
  })
  return { rest: { post } } as any
}

function calls(ctx: any, method: string) {
  return ctx.rest.post.mock.calls.filter((c: any[]) => c[1] === method)
}

describe('AssetManager.upload', () => {
  it('runs create -> single chunk -> complete and returns an Attachment', async () => {
    const ctx = makeCtx(1024)
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = await new AssetManager(ctx).upload('R_1', { data: bytes, filename: 'a.bin', contentType: 'image/png' })

    expect(result).toBeInstanceOf(Attachment)
    expect(result.id).toBe('as_1')

    const create = calls(ctx, 'CreateUpload')[0]
    expect(create[0]).toBe(UPLOAD_SVC)
    expect(create[2]).toMatchObject({ roomId: 'R_1', filename: 'a.bin', contentType: 'image/png' })
    expect(create[2].size).toBe('10') // int64 as string
    expect(create[2].sha256).toBe(await sha256Hex(bytes))

    const chunks = calls(ctx, 'UploadChunk')
    expect(chunks).toHaveLength(1)
    expect(chunks[0][2].offset).toBe('0')
    expect(chunks[0][2].content).toBe(toBase64(bytes))
    expect(chunks[0][2].chunkSha256).toBe(await sha256Hex(bytes))

    expect(calls(ctx, 'CompleteUpload')[0][2]).toEqual({ uploadId: 'up_1' })
  })

  it('splits large files into multiple chunks at the right offsets', async () => {
    const ctx = makeCtx(4)
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    await new AssetManager(ctx).upload('R_1', { data: bytes, filename: 'a.bin' })

    const chunks = calls(ctx, 'UploadChunk')
    expect(chunks.map(c => c[2].offset)).toEqual(['0', '4', '8'])
    expect(chunks[0][2].content).toBe(toBase64(bytes.subarray(0, 4)))
    expect(chunks[2][2].content).toBe(toBase64(bytes.subarray(8, 10)))
    expect(chunks[2][2].chunkSha256).toBe(await sha256Hex(bytes.subarray(8, 10)))
  })

  it('defaults contentType to application/octet-stream', async () => {
    const ctx = makeCtx(1024)
    await new AssetManager(ctx).upload('R_1', { data: new Uint8Array([1]), filename: 'a.bin' })
    expect(calls(ctx, 'CreateUpload')[0][2].contentType).toBe('application/octet-stream')
  })

  it('uploads a zero-byte file without sending any chunk', async () => {
    const ctx = makeCtx(1024)
    const result = await new AssetManager(ctx).upload('R_1', { data: new Uint8Array(), filename: 'empty.bin' })
    expect(calls(ctx, 'UploadChunk')).toHaveLength(0)
    expect(calls(ctx, 'CompleteUpload')).toHaveLength(1)
    expect(result.id).toBe('as_1')
  })

  it('rejects and cancels when the server returns an unusable max chunk size', async () => {
    const ctx = makeCtx(0)
    await expect(
      new AssetManager(ctx).upload('R_1', { data: new Uint8Array([1, 2, 3]), filename: 'a.bin' }),
    ).rejects.toBeInstanceOf(ChattoValidationError)
    expect(calls(ctx, 'UploadChunk')).toHaveLength(0)
    expect(calls(ctx, 'CancelUpload')).toHaveLength(1)
  })

  it('cancels the upload and rethrows when a chunk fails', async () => {
    const ctx = makeCtx(1024, { failChunk: true })
    await expect(
      new AssetManager(ctx).upload('R_1', { data: new Uint8Array([1, 2, 3]), filename: 'a.bin' }),
    ).rejects.toThrow('chunk boom')
    expect(calls(ctx, 'CancelUpload')[0][2]).toEqual({ uploadId: 'up_1' })
  })
})

describe('AssetManager.fetch', () => {
  it('reads one asset via GetAsset', async () => {
    const ctx = makeCtx(1024)
    const a = await new AssetManager(ctx).fetch('R_1', 'as_1')
    expect(a).toBeInstanceOf(Attachment)
    expect(calls(ctx, 'GetAsset')[0][2]).toEqual({ roomId: 'R_1', assetId: 'as_1' })
  })

  it('maps thumbnail options to the transform enum', async () => {
    const ctx = makeCtx(1024)
    await new AssetManager(ctx).fetch('R_1', 'as_1', { thumbnail: { width: 64, height: 64, fit: 'cover' } })
    expect(calls(ctx, 'GetAsset')[0][2].thumbnail).toEqual({ width: 64, height: 64, fit: 'IMAGE_FIT_MODE_COVER' })
  })
})

describe('AssetManager.fetchMany', () => {
  it('reads many assets via BatchGetAssets', async () => {
    const ctx = makeCtx(1024)
    const list = await new AssetManager(ctx).fetchMany('R_1', ['as_1', 'as_2'])
    expect(list).toHaveLength(2)
    expect(list[0]).toBeInstanceOf(Attachment)
    expect(calls(ctx, 'BatchGetAssets')[0][2]).toMatchObject({ roomId: 'R_1', assetIds: ['as_1', 'as_2'] })
  })

  it('returns [] for an empty id list without any request', async () => {
    const ctx = makeCtx(1024)
    expect(await new AssetManager(ctx).fetchMany('R_1', [])).toEqual([])
    expect(ctx.rest.post).not.toHaveBeenCalled()
  })

  it('throws ChattoValidationError for more than 100 ids', async () => {
    const ctx = makeCtx(1024)
    const ids = Array.from({ length: 101 }, (_, i) => `as_${i}`)
    await expect(new AssetManager(ctx).fetchMany('R_1', ids)).rejects.toBeInstanceOf(ChattoValidationError)
  })
})
