# Chatto.ts

[![npm version](https://img.shields.io/npm/v/chatto.ts?style=flat)](https://www.npmjs.com/package/chatto.ts)
[![npm downloads](https://img.shields.io/npm/dw/chatto.ts?style=flat)](https://www.npmjs.com/package/chatto.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat)](LICENSE)
[![Publish to npm](https://img.shields.io/github/actions/workflow/status/axodouble/chatto.ts/.github%2Fworkflows%2Fpublish.yml)](https://github.com/Axodouble/chatto.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6&logo=typescript&logoColor=white?style=flat)](https://www.typescriptlang.org/)

A Chatto Typescript library to interface with a Chatto instance.
Tested against `v0.4.9` of Chatto.

If you are looking for a `Java` SDK, [feel free to use this SDK made by a fellow developer](https://github.com/freakynit/chatto-java-sdk)!

## API

The API will be built upon the documentation that lives at [docs.chatto.run](https://docs.chatto.run/reference/connectrpc-api/).

The documentation itself is bound to change.

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

### Uploading images & media

Attach files directly when sending or replying — they are uploaded to the room
and attached automatically (at most 10 attachments per message):

```typescript
const bytes = await Bun.file("cat.png").bytes() // any Uint8Array / ArrayBuffer

// Attach inline when sending
await client.messages.send(roomId, {
    content: "look at this",
    files: [{ data: bytes, filename: "cat.png", contentType: "image/png" }],
})

// Or reply with a file
client.on('messageCreate', async message => {
    if (message.content === '/cat') {
        await message.reply({ files: [{ data: bytes, filename: "cat.png", contentType: "image/png" }] })
    }
})
```

You can also upload once and reuse the asset id, or read attachments off a
message:

```typescript
const asset = await client.assets.upload(roomId, { data: bytes, filename: "cat.png", contentType: "image/png" })
await client.messages.send(roomId, { content: "reused", attachmentIds: [asset.id] })

client.on('messageCreate', message => {
    for (const attachment of message.attachments) {
        console.log(attachment.filename, attachment.url) // signed URL, may expire
    }
})
```

I do not own nor claim any ownership of the Chatto name or brand. Chatto and similar branding is all owned by their respective owners.
I do not have any affiliation with Chatto.

- Note, most of this code is AI generated, this is because I am expecting most things to break as Chatto is still in active development. Once a first stable release is announced where breaking changes should not occur anymore I will be going over everything to reimplement and refactor the code.