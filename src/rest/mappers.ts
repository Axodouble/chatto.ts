import { timestampDate } from '@bufbuild/protobuf/wkt'
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import type { Message } from '../gen/chatto/api/v1/message_types_pb'
import type { DirectoryMember } from '../gen/chatto/api/v1/member_directory_pb'
import type { Room } from '../gen/chatto/api/v1/rooms_pb'
import type { MessageData, DirectoryMemberData, RoomData } from '../types'

// google.protobuf.Timestamp (or undefined) -> RFC 3339 string (or undefined).
function tsToIso(ts: Timestamp | undefined): string | undefined {
  return ts == null ? undefined : timestampDate(ts).toISOString()
}

// Non-optional proto3 scalars arrive as "" when unset; the SDK exposes them as undefined.
function emptyToUndef(s: string): string | undefined {
  return s === '' ? undefined : s
}

// Protobuf-ES generates enum members with the common prefix stripped; the SDK's
// public contract exposes the full proto enum value name. Map explicitly.
export const PRESENCE_NAMES: Record<number, string> = {
  0: 'PRESENCE_STATUS_UNSPECIFIED',
  1: 'PRESENCE_STATUS_ONLINE',
  2: 'PRESENCE_STATUS_AWAY',
  3: 'PRESENCE_STATUS_DO_NOT_DISTURB',
  4: 'PRESENCE_STATUS_OFFLINE',
}
export const ROOM_KIND_NAMES: Record<number, string> = {
  0: 'ROOM_KIND_UNSPECIFIED',
  1: 'ROOM_KIND_CHANNEL',
  2: 'ROOM_KIND_DM',
}

export function mapMessage(m: Message): MessageData {
  return {
    id: m.id,
    roomId: m.roomId,
    createdAt: tsToIso(m.createdAt) ?? '',
    actorId: m.actorId,
    body: m.body, // proto `optional string` -> already string | undefined
    updatedAt: tsToIso(m.updatedAt),
    inReplyTo: emptyToUndef(m.inReplyTo),
    threadRootEventId: emptyToUndef(m.threadRootEventId),
    reactions: m.reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      hasReacted: r.hasReacted,
      previewUserIds: r.previewUserIds,
    })),
  }
}

export function mapDirectoryMember(dm: DirectoryMember): DirectoryMemberData {
  const u = dm.user!
  return {
    user: {
      id: u.id,
      login: u.login,
      displayName: u.displayName,
      deleted: u.deleted,
      avatarUrl: u.avatarUrl, // proto `optional string`
      presenceStatus: PRESENCE_NAMES[u.presenceStatus] ?? 'PRESENCE_STATUS_UNSPECIFIED',
      customStatus: u.customStatus
        ? { emoji: u.customStatus.emoji, text: u.customStatus.text, expiresAt: tsToIso(u.customStatus.expiresAt) }
        : undefined,
    },
    roles: dm.roles,
    createdAt: tsToIso(dm.createdAt),
  }
}

export function mapRoom(r: Room): RoomData {
  return {
    id: r.id,
    name: r.name,
    kind: ROOM_KIND_NAMES[r.kind] ?? 'ROOM_KIND_UNSPECIFIED',
    description: emptyToUndef(r.description),
    archived: r.archived,
    groupId: emptyToUndef(r.groupId),
    universal: r.universal,
  }
}
