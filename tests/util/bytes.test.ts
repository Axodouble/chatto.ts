import { describe, it, expect } from 'bun:test'
import { toUint8Array, sha256Hex, toBase64 } from '../../src/util/bytes'

describe('toUint8Array', () => {
  it('returns a Uint8Array unchanged', () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(toUint8Array(bytes)).toBe(bytes)
  })

  it('wraps an ArrayBuffer', () => {
    const buf = new Uint8Array([4, 5, 6]).buffer
    const out = toUint8Array(buf)
    expect(out).toBeInstanceOf(Uint8Array)
    expect(Array.from(out)).toEqual([4, 5, 6])
  })
})

describe('sha256Hex', () => {
  it('hashes the empty input to the known vector', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('hashes "abc" to the known vector', async () => {
    const abc = new Uint8Array([0x61, 0x62, 0x63])
    expect(await sha256Hex(abc)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('produces lowercase 64-char hex', async () => {
    const hex = await sha256Hex(new Uint8Array([0, 255, 128]))
    expect(hex).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('toBase64', () => {
  it('encodes bytes to standard base64', () => {
    expect(toBase64(new Uint8Array([0x61, 0x62, 0x63]))).toBe('YWJj')
  })

  it('encodes the empty input to an empty string', () => {
    expect(toBase64(new Uint8Array())).toBe('')
  })

  it('encodes bytes needing padding', () => {
    expect(toBase64(new Uint8Array([0xff, 0xfe]))).toBe('//4=')
  })
})
