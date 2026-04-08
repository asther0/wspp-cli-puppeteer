# data/

Put your CSV files here for bulk sending.

## Quick start

```bash
# 1. Copy the example and edit with your real data
cp data/contactos.example.csv data/contactos.csv

# 2. Preview (no messages sent)
bun run wspp --csv data/contactos.csv --dry-run "Hello {{name}}"

# 3. Send
bun run wspp --csv data/contactos.csv "Hello {{name}}"
```

## CSV format

```csv
phone,name,message
+51987654321,Juan,"Custom message for {{name}}"
+56912345678,María,
```

| Column | Required | Description |
|--------|----------|-------------|
| `phone` | one of phone/name | Phone with country code |
| `name` | one of phone/name | Contact name in WhatsApp |
| `message` | no | Per-row message (overrides default template) |
| `*` | no | Any extra column works as `{{variable}}` |

> Your real CSV files (`.csv`) are gitignored — only `.example.csv` is tracked.
