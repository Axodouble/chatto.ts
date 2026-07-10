# Chatto.ts

[![npm version](https://img.shields.io/npm/v/chatto.ts&color=cb3837&logo=npm)](https://www.npmjs.com/package/chatto.ts)
[![npm downloads](https://img.shields.io/npm/dm/chatto.ts&color=cb3837)](https://www.npmjs.com/package/chatto.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Publish to npm](https://github.com/axodouble/chatto.ts/actions/workflows/publish.yml/badge.svg)](https://github.com/axodouble/chatto.ts/actions/workflows/publish.yml)

A Chatto Typescript library to interface with a Chatto instance.
Tested against v0.4.3 of Chatto.

## API

The API will be built upon the documentation that lives at [docs.chatto.run](https://docs.chatto.run/reference/connectrpc-api/).

The documentation itself is bound to change.

The request/response types are generated from Chatto's published protobuf definitions
([`chattocorp/chatto`](https://github.com/chattocorp/chatto)) into `src/gen/` using
[Connect-ES](https://connectrpc.com/docs/web/). The generated code is committed, so a normal
`bun install` + build needs no extra tooling. When Chatto's API changes, re-vendor the protos
under `proto/` and run `bun run generate` to refresh the clients.

## Usage

You can install this easily as an NPM package, just by using either bun or npm to install it.
Use `bun i chatto.ts` or `npm i chatto.ts`.

### ⚠️ CURRENTLY ONLY PASSWORD AUTHENTICATION WORKS ⚠️

This is because https://github.com/chattocorp/chatto/issues/266 is not yet implemented.
Once that is the case I intend to change it to allow for dedicated bot API tokens using a bot account.

A simple example application:

```typescript
import { ChattoClient } from "chatto.ts";

// Login to the account
const client = await ChattoClient.login({
    baseUrl: "https://chat.example.com",
    login: "<username>",
    password: "<password>"
})

// Listen for a "command"
client.on('messageCreate', async message=>{
    if(message.content?.toLowerCase().startsWith('/ping')){
        const time = Date.now()
        const msg = await message.reply('Ping...')
        await msg.edit(`Pong! API Latency is ${Date.now() - time}ms`)
    }
})

// Connect
client.connect()
```

I do not own nor claim any ownership of the Chatto name or brand. Chatto and similar branding is all owned by their respective owners.
I do not have any affiliation with Chatto.

- Note, most of this code is AI generated, this is because I am expecting most things to break as Chatto is still in active development. Once a first stable release is announced where breaking changes should not occur anymore I will be going over everything to reimplement and refactor the code.