# data/

Put your files here for bulk sending.

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

## PDF format

```bash
Coloca tu PDF en data/, por ejemplo data/servicios.pdf, y luego:

# Enviar solo el documento (sin caption)
bun run wspp "Juan Pérez" --doc servicios.pdf

# Con caption
bun run wspp "Juan Pérez" "Hola, aquí te envío la info de mis servicios 🎯" --doc servicios.pdf

# Por teléfono
bun run wspp +51987654321 "Mira este brochure" --doc servicios.pdf

# Masivo (mismo doc a varios)
bun run wspp "Juan,María,Carlos" "Oferta especial para ti" --doc servicios.pdf

```
