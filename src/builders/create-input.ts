import type { ClientContext } from '../context'
import type { MessageBuilder } from './message'
import type { CreateMessageInput } from '../types'
import { ChattoValidationError } from '../errors'

const MAX_ATTACHMENTS = 10

/**
 * Resolve a builder into a `CreateMessage` input: upload any queued files, merge
 * their asset ids after the explicitly-provided ids, and validate the result.
 * A message must carry body text or at least one attachment, and no more than
 * ten attachments total.
 */
export async function prepareCreateInput(
  ctx: ClientContext,
  roomId: string,
  builder: MessageBuilder,
): Promise<CreateMessageInput> {
  const files = builder.getFiles()
  const attachmentAssetIds = [...builder.getAttachmentIds()]

  // Validate the total before uploading anything, so an over-limit message does
  // not leave orphaned assets on the server.
  if (attachmentAssetIds.length + files.length > MAX_ATTACHMENTS) {
    throw new ChattoValidationError(
      'too_many_attachments',
      `A message may have at most ${MAX_ATTACHMENTS} attachments`,
    )
  }

  for (const file of files) {
    const asset = await ctx.assets.upload(roomId, file)
    attachmentAssetIds.push(asset.id)
  }

  const input = builder.buildCreate(roomId)
  const hasBody = input.body != null && input.body.length > 0
  if (!hasBody && attachmentAssetIds.length === 0) {
    throw new ChattoValidationError(
      'empty_message',
      'A message must have body text or at least one attachment',
    )
  }

  return {
    ...input,
    attachmentAssetIds: attachmentAssetIds.length > 0 ? attachmentAssetIds : undefined,
  }
}
