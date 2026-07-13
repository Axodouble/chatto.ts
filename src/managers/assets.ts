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

const UPLOAD_SERVICE = 'chatto.api.v1.AssetUploadService'
const ASSET_SERVICE = 'chatto.api.v1.AssetService'
const MAX_BATCH = 100

const FIT_MODES = {
  contain: 'IMAGE_FIT_MODE_CONTAIN',
  cover: 'IMAGE_FIT_MODE_COVER',
} as const

function thumbnailInput(thumbnail?: ThumbnailOptions) {
  if (thumbnail == null) return undefined
  return {
    width: thumbnail.width,
    height: thumbnail.height,
    fit: thumbnail.fit ? FIT_MODES[thumbnail.fit] : undefined,
  }
}

export class AssetManager {
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Upload a file to a room and return the finished attachment asset. Runs the
   * chunked flow: CreateUpload -> UploadChunk (per chunk) -> CompleteUpload. On
   * any failure after the session is created, the upload is cancelled
   * best-effort before the original error is rethrown.
   */
  async upload(roomId: string, file: FileInput): Promise<Attachment> {
    const bytes = toUint8Array(file.data)
    const sha256 = await sha256Hex(bytes)

    const created = await this.ctx.rest.post(
      UPLOAD_SERVICE,
      'CreateUpload',
      {
        roomId,
        filename: file.filename,
        contentType: file.contentType ?? 'application/octet-stream',
        size: String(bytes.length),
        sha256,
      },
      CreateUploadResponseSchema,
    )

    const { uploadId, maxChunkSize } = created.upload
    if (bytes.length > 0 && maxChunkSize <= 0) {
      await this.ctx.rest
        .post(UPLOAD_SERVICE, 'CancelUpload', { uploadId }, CancelUploadResponseSchema)
        .catch(() => {})
      throw new ChattoValidationError(
        'invalid_max_chunk_size',
        `Server returned an unusable max chunk size (${maxChunkSize})`,
      )
    }
    try {
      for (let offset = 0; offset < bytes.length; offset += maxChunkSize) {
        const chunk = bytes.subarray(offset, offset + maxChunkSize)
        await this.ctx.rest.post(
          UPLOAD_SERVICE,
          'UploadChunk',
          {
            uploadId,
            offset: String(offset),
            content: toBase64(chunk),
            chunkSha256: await sha256Hex(chunk),
          },
          UploadChunkResponseSchema,
        )
      }

      const completed = await this.ctx.rest.post(
        UPLOAD_SERVICE,
        'CompleteUpload',
        { uploadId },
        CompleteUploadResponseSchema,
      )
      return new Attachment(completed.asset)
    } catch (err) {
      await this.ctx.rest
        .post(UPLOAD_SERVICE, 'CancelUpload', { uploadId }, CancelUploadResponseSchema)
        .catch(() => {})
      throw err
    }
  }

  /** Read one room-scoped asset with a freshly signed URL. */
  async fetch(roomId: string, assetId: string, opts: { thumbnail?: ThumbnailOptions } = {}): Promise<Attachment> {
    const res = await this.ctx.rest.post(
      ASSET_SERVICE,
      'GetAsset',
      { roomId, assetId, thumbnail: thumbnailInput(opts.thumbnail) },
      GetAssetResponseSchema,
    )
    return new Attachment(res.asset)
  }

  /**
   * Read many room-scoped assets. Returns `[]` for an empty list without a
   * request. Throws `ChattoValidationError` for more than 100 ids.
   */
  async fetchMany(roomId: string, assetIds: string[], opts: { thumbnail?: ThumbnailOptions } = {}): Promise<Attachment[]> {
    if (assetIds.length === 0) return []
    if (assetIds.length > MAX_BATCH) {
      throw new ChattoValidationError('too_many_asset_ids', `At most ${MAX_BATCH} asset IDs may be fetched at once`)
    }
    const res = await this.ctx.rest.post(
      ASSET_SERVICE,
      'BatchGetAssets',
      { roomId, assetIds, thumbnail: thumbnailInput(opts.thumbnail) },
      BatchGetAssetsResponseSchema,
    )
    return res.assets.map(a => new Attachment(a))
  }
}
