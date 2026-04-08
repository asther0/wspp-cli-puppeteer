# WSPP-CLI

WhatsApp Web automation from your terminal. Send messages, list contacts, bulk send, schedule — all from the command line.

## Features

- **Send messages** by name, position (#), or phone number
- **List contacts** with search and phone number display
- **Interactive mode** with arrow-key navigation menus
- **Bulk messaging** to multiple contacts at once
- **Scheduled messages** with countdown timer
- **Persistent session** — scan QR once, use forever
- **Background mode** — no visible browser after first login

## Requirements

- [Bun](https://bun.sh) >= 1.0
- Google Chrome installed
- Windows (Chrome path in `src/constants.ts`)

## Install

```bash
git clone https://github.com/asther0/wspp-cli.git
cd wspp-cli
bun install
```

## Quick Start

```bash
# 1. Login (scan QR once)
bun run wspp:login

# 2. List your contacts
bun run wspp:contacts

# 3. Send a message
bun run wspp 3 "Hello!"
```

## Usage

### Send Message

```bash
# By contact name
bun run wspp "Juan" "Hola!"

# By position from contact list
bun run wspp 3 "Hola!"

# By phone number
bun run wspp "+51999123456" "Hola!"
```

### Bulk Send

```bash
# Send to multiple contacts by position
bun run wspp 1,3,5 "Meeting at 3pm"
```

### Scheduled Message

```bash
# Send at a specific time (24h format)
bun run wspp 3 "Happy birthday!" --at 08:00
```

### List Contacts

```bash
# Recent chats
bun run wspp:contacts

# Search by keyword
bun run wspp:contacts "Juan"
```

### Interactive Mode

```bash
bun run wspp:i
```

Arrow-key menu with: send, bulk send, view contacts, refresh, exit.

### Login

```bash
bun run wspp:login
```

Opens a visible browser to scan QR. Session is saved in `.wspp-session/`.

## All Commands

| Command | Description |
|---|---|
| `bun run wspp "Contact" "Message"` | Send message |
| `bun run wspp 1,3,5 "Message"` | Bulk send |
| `bun run wspp 3 "Msg" --at 08:00` | Scheduled send |
| `bun run wspp:contacts` | List contacts |
| `bun run wspp:login` | QR login |
| `bun run wspp:i` | Interactive mode |
| `bun run wspp:debug` | Debug mode |

## Configuration

Chrome path is set in `src/constants.ts`:

```typescript
export const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
```

## Session

Session data lives in `.wspp-session/` (gitignored). To re-authenticate, delete this folder and run `bun run wspp:login`.

## Tech Stack

- **Bun** — Runtime
- **Puppeteer** — Browser automation
- **@inquirer/prompts** — Interactive CLI
- **Chalk + Ora** — Terminal UI
- **Figlet** — ASCII art

## License

MIT

## Disclaimer

Educational project. Use responsibly and comply with WhatsApp's Terms of Service.
