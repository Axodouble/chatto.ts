import type { ClientContext } from '../context'
import type { FileInput, ThumbnailOptions } from '../types'
import { Attachment } from '../resources/attachment'
import { ChattoValidationError } from '../errors'
import { toUint8Array, sha256Hex, toBase64 } from '../util/bytes'
import {
  CreateUploadResponseSchema,
  UploadChunkResponseSchema,
  CompleteUploadResponseSchema,
  CancelUploadResponseSchema,
  GetAssetResponseSchema,
  BatchGetAssetsResponseSchema,
} from '../schemas/asset'

export class AssetManager {
  constructor(private readonly ctx: ClientContext) {}

  async upload(roomId: string, file: FileInput): Promise<Attachment> {
    const bytes = toUint8Array(file.data)
    const created = await this.ctx.rest.post(
      'chatto.api.v1.AssetUploadService',
      'CreateUpload',
      {
        roomId,
        filename: file.filename,
        contentType: file.contentType ?? 'application/octet-stream',
        size: String(bytes.length),
        sha256: await sha256Hex(bytes),
      },
      CreateUploadResponseSchema,
    )

    // Upload the file in chunks sized by the server, then finalize. On any
    // failure the upload is cancelled best-effort so no orphan session lingers.
    const { uploadId, maxChunkSize } = created.upload
    if (bytes.length > 0 && maxChunkSize <= 0) {
      await this.cancelUpload(uploadId)
      throw new ChattoValidationError(
        'invalid_max_chunk_size',
        `Server returned an unusable max chunk size (${maxChunkSize})`,
      )
    }
    try {
      for (let offset = 0; offset < bytes.length; offset += maxChunkSize) {
        const chunk = bytes.subarray(offset, offset + maxChunkSize)
        await this.ctx.rest.post(
          'chatto.api.v1.AssetUploadService',
          'UploadChunk',
          { uploadId, offset: String(offset), content: toBase64(chunk), chunkSha256: await sha256Hex(chunk) },
          UploadChunkResponseSchema,
        )
      }
      const completed = await this.ctx.rest.post(
        'chatto.api.v1.AssetUploadService',
        'CompleteUpload',
        { uploadId },
        CompleteUploadResponseSchema,
      )
      return new Attachment(completed.asset)
    } catch (err) {
      await this.cancelUpload(uploadId)
      throw err
    }
  }

  async fetch(roomId: string, assetId: string, opts: { thumbnail?: ThumbnailOptions } = {}): Promise<Attachment> {
    const res = await this.ctx.rest.post(
      'chatto.api.v1.AssetService',
      'GetAsset',
      { roomId, assetId, thumbnail: this.thumbnailInput(opts.thumbnail) },
      GetAssetResponseSchema,
    )
    return new Attachment(res.asset)
  }

  async fetchMany(roomId: string, assetIds: string[], opts: { thumbnail?: ThumbnailOptions } = {}): Promise<Attachment[]> {
    if (assetIds.length === 0) return []
    if (assetIds.length > 100) {
      throw new ChattoValidationError('too_many_asset_ids', 'At most 100 asset IDs may be fetched at once')
    }
    const res = await this.ctx.rest.post(
      'chatto.api.v1.AssetService',
      'BatchGetAssets',
      { roomId, assetIds, thumbnail: this.thumbnailInput(opts.thumbnail) },
      BatchGetAssetsResponseSchema,
    )
    return res.assets.map(a => new Attachment(a))
  }

  private thumbnailInput(thumbnail?: ThumbnailOptions) {
    if (thumbnail == null) return undefined
    const fit =
      thumbnail.fit === 'cover' ? 'IMAGE_FIT_MODE_COVER'
      : thumbnail.fit === 'contain' ? 'IMAGE_FIT_MODE_CONTAIN'
      : undefined
    return { width: thumbnail.width, height: thumbnail.height, fit }
  }

  private async cancelUpload(uploadId: string): Promise<void> {
    await this.ctx.rest
      .post('chatto.api.v1.AssetUploadService', 'CancelUpload', { uploadId }, CancelUploadResponseSchema)
      .catch(() => {})
  }
}
