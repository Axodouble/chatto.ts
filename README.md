# Chatto.ts

A very early sketch of a Chatto Typescript library to interface with a Chatto instance

## API

The API will be built upon the documentation that lives at [docs.chatto.run](https://docs.chatto.run/reference/connectrpc-api/).

The documentation itself is bound to change.

## Usage

Only way to use it for now is as the direct git repository, using `npm install git+https://github.com/axodouble/chatto.ts` or `bun i git+https://github.com/axodouble/chatto.ts`.

### ⚠️ CURRENTLY ONLY PASSWORD AUTHENTICATION WORKS ⚠️

This is because https://github.com/chattocorp/chatto/issues/266 is not yet implemented.
Once that is the case I intend to change it to allow for dedicated bot API tokens using a bot account.

A simple example application:

```typescript
import { ChattoClient } from 'chatto.ts'

const baseUrl = 'https://chat.example.com'
const login = 'username'

const client = await ChattoClient.login({baseUrl, login, password: '<password>'})

client.on('messageCreate', async e => {
  const author = await e.author.fetch()
  console.log(`author.displayName: ${author.displayName}`)
})

client.on('error', e => console.error('error:', e))

await client.connect()
```

## Release

```bash
# Bump vers
bun run build
git tag v...
git push && git push --tags
```

I do not own nor claim any ownership of the Chatto name or brand. Chatto and similar branding is all owned by their respective owners.
I do not have any affiliation with Chatto.


- Note, most of this code is AI generated, this is because I am expecting most things to break as Chatto is still in active development. Once a first stable release is announced where breaking changes should not occur anymore I will be going over everything to reimplement and refactor the code.