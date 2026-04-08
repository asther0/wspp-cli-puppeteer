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

### 3. Bulk send from CSV

Load recipients from a CSV file and send personalized messages.

```bash
# Preview what would be sent (no messages sent)
bun run wspp --csv contacts.csv --dry-run "Hello {{name}}"

# Send for real
bun run wspp --csv contacts.csv "Hello {{name}}, your code is {{code}}"

# CSV with per-row messages (no default template needed)
bun run wspp --csv contacts.csv
```

**CSV format:**

```csv
phone,name,message
+51987654321,Juan,"Hi {{name}}, your appointment is tomorrow"
+56912345678,María,
+1234567890,Mike,"{{name}}, your order #{{code}} is ready"
```

- `phone` or `name` required (at least one per row)
- `message` column optional — overrides the default template for that row
- Any extra column (e.g. `code`, `company`) can be used as `{{variable}}` in templates
- Empty `message` cells fall back to the default template from the CLI

See [Anti-ban tips](#anti-ban-tips) before sending to large lists.

### 4. Schedule a message for later

Send birthday wishes, reminders, or timed notifications.

```bash
# Send at 8:00 AM
bun run wspp 3 "Happy birthday!" --at 08:00

# If the time already passed today, it schedules for tomorrow
bun run wspp "Team Lead" "Daily standup reminder" --at 09:00
```

Shows a real-time countdown in the terminal until the message is sent.

### 5. Browse and search contacts

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

### 6. Interactive mode (full menu)

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

### 7. First-time setup

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
| `bun run wspp --csv file.csv "msg"` | Bulk send from CSV |
| `bun run wspp --csv file.csv --dry-run "msg"` | Preview CSV (no send) |
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

## Anti-ban Tips

This tool automates a real Chrome browser via Puppeteer — WhatsApp sees the same fingerprint as a regular user. However, **no tool can guarantee your account won't be restricted**. Sending too many messages too fast is the #1 cause of bans.

### Built-in protections

- **Random delays (3–7s)** between each message in bulk/CSV mode
- **Warning at 50+ messages** per session
- **`--dry-run` flag** to verify your CSV before sending anything

### Best practices

| | Recommendation |
|---|---|
| **Volume** | Stay under 50 messages per session. For larger lists, split into batches with hours between them |
| **Personalization** | Use `{{name}}` and other template variables — identical messages to many people trigger spam detection |
| **Recipients** | Sending to contacts who already have you saved is much safer than cold-messaging new numbers |
| **Account type** | WhatsApp Business accounts have higher tolerance than personal accounts |
| **Timing** | Don't send at 3 AM — unusual hours draw attention |
| **Frequency** | Avoid daily mass sends. Spread campaigns across days |
| **Reports** | If even one recipient reports you as spam, it weighs heavily. Only message people who expect it |

### Risk levels

| Low risk (< 20/day) | Medium risk (20–50) | High risk (50+) |
|---|---|---|
| Contacts who have you saved | Mix of known and new numbers | All new numbers |
| Every message is different | Template with `{{name}}` | Same text to everyone |
| Old account with history | Account a few months old | New account |

### If you get a temporary ban

1. **Stop immediately** — don't try to send more
2. Wait the full restriction period (usually 24–48h)
3. Reduce your volume by 50% when you resume
4. Add more personalization to your messages

## Disclaimer

This project automates WhatsApp Web via browser — it does not use official WhatsApp APIs. Use responsibly and in compliance with [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service). The authors are not responsible for any account restrictions resulting from misuse.
