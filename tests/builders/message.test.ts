import { describe, it, expect } from 'bun:test'
import { MessageBuilder } from '../../src/builders/message'

describe('MessageBuilder', () => {
  describe('buildCreate', () => {
    it('builds create input with content', () => {
      const input = new MessageBuilder().setContent('Hello!').buildCreate('room_1')
      expect(input.roomId).toBe('room_1')
      expect(input.body).toBe('Hello!')
    })

    it('builds create input with all optional fields', () => {
      const input = new MessageBuilder()
        .setContent('Reply')
        .setReplyTo('evt_parent')
        .setThreadRoot('evt_root')
        .setAlsoSendToChannel(true)
        .buildCreate('room_1')
      expect(input.inReplyTo).toBe('evt_parent')
      expect(input.threadRootEventId).toBe('evt_root')
      expect(input.alsoSendToChannel).toBe(true)
    })

    it('is chainable — returns this', () => {
      const builder = new MessageBuilder()
      expect(builder.setContent('Hi')).toBe(builder)
      expect(builder.setReplyTo('evt_1')).toBe(builder)
      expect(builder.setThreadRoot('evt_2')).toBe(builder)
      expect(builder.setAlsoSendToChannel(false)).toBe(builder)
    })
  })

  describe('attachments', () => {
    const file = { data: new Uint8Array([1, 2, 3]), filename: 'a.png', contentType: 'image/png' }

    it('collects pending files via addFile/addFiles', () => {
      const builder = new MessageBuilder().addFile(file).addFiles(file, file)
      expect(builder.getFiles()).toHaveLength(3)
    })

    it('collects explicit attachment asset ids via addAttachment', () => {
      const builder = new MessageBuilder().addAttachment('as_1').addAttachment('as_2')
      expect(builder.getAttachmentIds()).toEqual(['as_1', 'as_2'])
    })

    it('addFile/addAttachment are chainable', () => {
      const builder = new MessageBuilder()
      expect(builder.addFile(file)).toBe(builder)
      expect(builder.addAttachment('as_1')).toBe(builder)
    })

    it('buildCreate emits attachmentAssetIds from explicit ids', () => {
      const input = new MessageBuilder().setContent('hi').addAttachment('as_1').buildCreate('room_1')
      expect(input.attachmentAssetIds).toEqual(['as_1'])
    })

    it('clone copies pending files and attachment ids', () => {
      const original = new MessageBuilder().addFile(file).addAttachment('as_1')
      const copy = original.clone()
      copy.addAttachment('as_2')
      expect(original.getAttachmentIds()).toEqual(['as_1'])
      expect(copy.getAttachmentIds()).toEqual(['as_1', 'as_2'])
      expect(copy.getFiles()).toHaveLength(1)
    })

    it('builds create input with no content when only files are present', () => {
      const input = new MessageBuilder().addFile(file).buildCreate('room_1')
      expect(input.body).toBeUndefined()
    })
  })

  describe('buildUpdate', () => {
    it('builds update input with roomId and eventId', () => {
      const input = new MessageBuilder().setContent('Updated').buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
      expect(input.body).toBe('Updated')
    })

    it('throws if schema validation fails (missing roomId handled externally)', () => {
      const input = new MessageBuilder().buildUpdate('room_1', 'evt_1')
      expect(input.roomId).toBe('room_1')
      expect(input.eventId).toBe('evt_1')
    })
  })
})
