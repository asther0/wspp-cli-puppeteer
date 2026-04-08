# WSPP-CLI

WhatsApp Web automation from your terminal. Send messages, list contacts, bulk send, schedule — all from the command line.

Built with Puppeteer + Bun. No APIs, no tokens — just browser automation.

## Features

- Send messages by name, position, or phone number
- List and search contacts from recent chats
- Interactive mode with arrow-key navigation
- Bulk messaging to multiple contacts at once
- Scheduled messages with real-time countdown
- Persistent session — scan QR once, reuse forever
- Background mode — no visible browser window

## Requirements

- [Bun](https://bun.sh) >= 1.0
- Google Chrome installed
- Windows (Chrome path configurable in `src/constants.ts`)

## Install

```bash
git clone https://github.com/asther0/wspp-cli-puppeteer.git
cd wspp-cli-puppeteer
bun install
```

## Quick Start

```bash
# 1. Login — opens browser to scan QR (only once)
bun run wspp:login

# 2. See your recent contacts
bun run wspp:contacts

# 3. Send a message by position
bun run wspp 3 "Hello from CLI!"
```

After scanning the QR the first time, all subsequent commands run in the background — no browser window visible.

## Use Cases

### 1. Send a quick message

```bash
# By contact name
bun run wspp "Chema" "Hey, are we still on for tomorrow?"

# By position number (from wspp:contacts list)
bun run wspp 5 "On my way!"

# By phone number
bun run wspp "+51999123456" "Hi, this is my new number"
```

### 2. Send the same message to multiple people

Useful for announcements, reminders, or event invitations.

```bash
# By positions (comma-separated)
bun run wspp 1,3,5,7 "Reminder: meeting at 3pm"
```

Shows progress for each contact and a summary at the end.

### 3. Schedule a message for later

Send birthday wishes, reminders, or timed notifications.

```bash
# Send at 8:00 AM
bun run wspp 3 "Happy birthday!" --at 08:00

# If the time already passed today, it schedules for tomorrow
bun run wspp "Team Lead" "Daily standup reminder" --at 09:00
```

Shows a real-time countdown in the terminal until the message is sent.

### 4. Browse and search contacts

```bash
# List your 10 most recent chats
bun run wspp:contacts

# Search for a specific contact
bun run wspp:contacts "Juan"
```

Output:
```
╔══════╦════════════════════════════╗
║ #    ║ Contacto                   ║
╠══════╬════════════════════════════╣
║ 1    ║ Team | 26 Labs             ║
║ 2    ║ Bloc USIL                  ║
║ 3    ║ Chema                      ║
║ ...  ║ ...                        ║
╚══════╩════════════════════════════╝
```

### 5. Interactive mode (full menu)

For when you want to browse, select, and send without memorizing commands.

```bash
bun run wspp:i
```

Features:
- Arrow-key menu: Send / Bulk send / View contacts / Refresh / Exit
- Contact selection with arrow keys
- Message input inline
- Confirmation before sending
- Stays open for multiple actions

### 6. First-time setup

```bash
bun run wspp:login
```

Opens a visible Chrome window. Scan the QR code with your phone. Session is saved automatically in `.wspp-session/` — you won't need to scan again.

## All Commands

| Command | Description |
|---|---|
| `bun run wspp:login` | First-time QR login |
| `bun run wspp:contacts` | List recent contacts |
| `bun run wspp:contacts "name"` | Search contacts |
| `bun run wspp "Name" "msg"` | Send by name |
| `bun run wspp 3 "msg"` | Send by position |
| `bun run wspp 1,3,5 "msg"` | Bulk send |
| `bun run wspp 3 "msg" --at 08:00` | Scheduled send |
| `bun run wspp:i` | Interactive mode |
| `bun run wspp:debug` | Debug with screenshots |

## How It Works

1. **Login**: Opens Chrome, navigates to WhatsApp Web, you scan QR
2. **Session**: Chrome's user data directory is saved in `.wspp-session/`
3. **Background**: On subsequent runs, Chrome opens off-screen (position -2400,-2400)
4. **Contacts**: Extracts chat names from the WhatsApp sidebar DOM
5. **Send**: Searches contact, selects chat, types message, presses Enter
6. **Bulk**: Iterates contacts with 3s delay between sends (anti rate-limit)
7. **Schedule**: Keeps browser open with countdown, sends at target time

## Configuration

Chrome path in `src/constants.ts`:

```typescript
export const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
```

For Mac: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`

## Session Management

Session lives in `.wspp-session/` (gitignored). To reset:

```bash
rm -rf .wspp-session
bun run wspp:login
```

## Tech Stack

- **Bun** — TypeScript runtime
- **Puppeteer** — Chrome automation
- **@inquirer/prompts** — Interactive menus
- **Chalk + Ora** — Terminal styling

## License

MIT

## Disclaimer

Educational project. Use responsibly and in compliance with WhatsApp's Terms of Service.
