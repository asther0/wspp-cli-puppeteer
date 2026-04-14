# onpe-bot

Bot que monitorea los resultados electorales en tiempo real desde la ONPE y los envía automáticamente a uno o varios grupos de WhatsApp.

Usa [wspp-cli](https://www.npmjs.com/package/wspp-cli) como capa de envío — sin APIs de pago, sin Twilio, sin Kapso. Solo tu propio número de WhatsApp.

---

## Fuente de datos

**Resultados Electorales ONPE 2026:**
🔗 [resultadoelectoral.onpe.gob.pe](https://resultadoelectoral.onpe.gob.pe/main/resumen)

El bot consulta dos endpoints oficiales de la ONPE cada 10 minutos:

| Endpoint | Datos |
|---|---|
| `/resumen-general/totales` | Actas contabilizadas, total votos válidos, timestamp de actualización |
| `/resumen-general/participantes` | Lista completa de candidatos con votos y porcentajes |

Solo envía mensaje cuando `fechaActualizacion` cambia — no spamea si la ONPE no ha actualizado.

---

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- [wspp-cli](https://www.npmjs.com/package/wspp-cli) instalado y con sesión activa
- `wspp-serve` corriendo en `localhost:3000`

---

## Instalación

```bash
git clone https://github.com/asther0/onpe-bot.git
cd onpe-bot
```

No necesita `bun install` — no tiene dependencias externas.

---

## Uso

**Paso 1 — Iniciar wspp-serve** (en una terminal aparte):

```bash
wspp-serve --port 3000 --key mi-clave
```

**Paso 2 — Iniciar el bot:**

```bash
# Un grupo
bun run bot.ts "Nombre del Grupo" --key mi-clave

# Múltiples grupos separados por coma
bun run bot.ts "Grupo A,Grupo B,Grupo C" --key mi-clave
```

El nombre del grupo debe coincidir exactamente con el nombre que aparece en WhatsApp.
Puedes verificarlo con `wspp-contacts`.

---

## Ejemplo de mensaje enviado

```
📊 RESULTADOS ONPE 2026
━━━━━━━━━━━━━━━━━━━
🗳 Actas: 77.456% (71,853 / 92,766)
👥 Votos válidos: 13,524,152

1. Keiko Fujimori — 16.867%
   2,281,063 votos
2. Rafael López — 12.665%
   1,712,803 votos
3. Jorge Nieto — 11.742%
   1,588,013 votos
4. Roberto Sanchez — 10.442%
   1,412,157 votos
5. Ricardo Belmont — 10.032%
   1,356,704 votos

━━━━━━━━━━━━━━━━━━━
🕐 14 abr, 02:43 p. m.
📡 resultadoelectoral.onpe.gob.pe
```

---

## Cómo funciona

```
[cada 10 minutos]
    → GET /resumen-general/totales (ONPE)
    → ¿cambió fechaActualizacion?
        NO  → skip, esperar siguiente ciclo
        SÍ  → GET /resumen-general/participantes (ONPE)
            → formatear mensaje con top 5
            → POST /send a cada grupo (wspp-serve)
                → 3s de delay entre grupos
```

1. **Polling inteligente** — consulta la ONPE cada 10 min pero solo envía si los datos cambiaron
2. **Multi-grupo** — itera los grupos con 3s de delay entre cada envío
3. **Nombres cortos** — "KEIKO SOFIA FUJIMORI HIGUCHI" → "Keiko Fujimori"
4. **Sin dependencias** — solo Bun nativo + fetch, sin librerías externas

---

## Argumentos CLI

```
bun run bot.ts <grupos> [--key <api-key>]
```

| Argumento | Descripción |
|---|---|
| `<grupos>` | Nombre del grupo o lista separada por comas |
| `--key` | API key del wspp-serve (si lo iniciaste con `--key`) |

---

## Anti-ban

El riesgo de ban en este caso es bajo porque:

- Se envía a **grupos propios** (no mensajes fríos a desconocidos)
- El **contenido varía** en cada envío (distintos votos y porcentajes)
- La **frecuencia real** depende de cuando ONPE actualiza (~cada 30-60 min en noche electoral)
- Hay un **delay de 3s entre grupos** para comportamiento natural

---

## Stack

- **Bun** — runtime y fetch nativo
- **wspp-cli** — envío de mensajes a WhatsApp vía browser automation
- **ONPE API** — datos electorales oficiales en tiempo real

---

## Licencia

MIT
