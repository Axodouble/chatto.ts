import { loginWithPassword } from './integrated'
import { ChattoAuthError } from '../errors'

export interface StoredCredentials {
  login: string
  password: string
}

export type LoginFn = (
  baseUrl: string,
  login: string,
  password: string,
) => Promise<{ token: string }>

export class TokenStore {
  private inFlight: Promise<string> | null = null

  constructor(
    private readonly baseUrl: string,
    private token: string,
    private readonly credentials?: StoredCredentials,
    private readonly loginFn: LoginFn = loginWithPassword,
  ) {}

  getToken(): string {
    return this.token
  }

  canRefresh(): boolean {
    return this.credentials != null
  }

  refresh(): Promise<string> {
    if (this.inFlight != null) return this.inFlight
    if (this.credentials == null) {
      return Promise.reject(
        new ChattoAuthError('no_credentials', 'Cannot refresh token: no credentials retained'),
      )
    }
    const creds = this.credentials
    this.inFlight = this.loginFn(this.baseUrl, creds.login, creds.password)
      .then(result => {
        this.token = result.token
        return result.token
      })
      .finally(() => {
        this.inFlight = null
      })
    return this.inFlight
  }
}
