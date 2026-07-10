import { describe, it, expect } from 'bun:test'
import { PresenceStatus } from '../../src/gen/chatto/api/v1/presence_pb'
import { RoomKind } from '../../src/gen/chatto/api/v1/rooms_pb'
import { PRESENCE_NAMES, ROOM_KIND_NAMES } from '../../src/rest/mappers'

// TS numeric enums compile to an object with a reverse mapping (number -> string
// name) alongside the forward mapping (string name -> number). Object.values()
// on that object therefore mixes numbers and strings; filtering to `number`
// isolates the actual enum values, so this count tracks the generated enum's
// size without depending on its reverse-mapping shape.
function numericEnumSize(e: object): number {
  return Object.values(e).filter(v => typeof v === 'number').length
}

describe('enum-map drift guard', () => {
  it('PRESENCE_NAMES covers every PresenceStatus value', () => {
    expect(Object.keys(PRESENCE_NAMES).length).toBe(numericEnumSize(PresenceStatus))
  })

  it('ROOM_KIND_NAMES covers every RoomKind value', () => {
    expect(Object.keys(ROOM_KIND_NAMES).length).toBe(numericEnumSize(RoomKind))
  })
})
