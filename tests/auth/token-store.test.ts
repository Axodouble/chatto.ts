import { describe, it, expect, mock } from 'bun:test'
import { TokenStore } from '../../src/auth/token-store'
import { ChattoAuthError } from '../../src/errors'

describe('TokenStore', () => {
  it('returns the initial token', () => {
    const store = new TokenStore('https://c', 'tk0')
    expect(store.getToken()).toBe('tk0')
  })

  it('canRefresh is false without credentials, true with', () => {
    expect(new TokenStore('https://c', 'tk0').canRefresh()).toBe(false)
    expect(new TokenStore('https://c', 'tk0', { login: 'u', password: 'p' }).canRefresh()).toBe(true)
  })

  it('refresh() re-logs-in, stores and returns the new token', async () => {
    const loginFn = mock(async () => ({ token: 'tk1' }))
    const store = new TokenStore('https://c', 'tk0', { login: 'u', password: 'p' }, loginFn)
    const t = await store.refresh()
    expect(t).toBe('tk1')
    expect(store.getToken()).toBe('tk1')
    expect(loginFn).toHaveBeenCalledWith('https://c', 'u', 'p')
  })

  it('refresh() without credentials rejects with ChattoAuthError', async () => {
    const store = new TokenStore('https://c', 'tk0')
    await expect(store.refresh()).rejects.toBeInstanceOf(ChattoAuthError)
  })

  it('refresh() is single-flight: concurrent calls trigger one login', async () => {
    let resolve!: (v: { token: string }) => void
    const loginFn = mock(() => new Promise<{ token: string }>(r => { resolve = r }))
    const store = new TokenStore('https://c', 'tk0', { login: 'u', password: 'p' }, loginFn)
    const a = store.refresh()
    const b = store.refresh()
    resolve({ token: 'tk1' })
    expect(await a).toBe('tk1')
    expect(await b).toBe('tk1')
    expect(loginFn).toHaveBeenCalledTimes(1)
  })

  it('refresh() can be called again after a prior refresh settles', async () => {
    let n = 0
    const loginFn = mock(async () => ({ token: `tk${++n}` }))
    const store = new TokenStore('https://c', 'tk0', { login: 'u', password: 'p' }, loginFn)
    expect(await store.refresh()).toBe('tk1')
    expect(await store.refresh()).toBe('tk2')
    expect(loginFn).toHaveBeenCalledTimes(2)
  })
})
