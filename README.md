# 🤖 Puppeteer Demo

Demo de automatización web usando Puppeteer y Bun. Proyecto inspirado en wspp-cli para mostrar capacidades de web scraping, búsquedas automatizadas, screenshots e interacción con páginas web.

## 📦 Instalación

```bash
bun install
```

## 🚀 Comandos Disponibles

### 1. Web Scraping
Extrae los repositorios trending de GitHub:
```bash
bun run scrape
```

### 2. Búsqueda Automatizada
Busca en Google y extrae los primeros resultados:
```bash
bun run search "tu búsqueda aquí"
# Ejemplo: bun run search "puppeteer automation"
```

### 3. Screenshot
Toma una captura de pantalla completa de cualquier sitio:
```bash
bun run screenshot https://example.com
```

### 4. Interacción
Demuestra interacciones básicas con páginas web:
```bash
bun run interact
```

## ⚙️ Configuración

El navegador Chrome debe estar instalado en:
```
C:\Program Files\Google\Chrome\Application\chrome.exe
```

Puedes modificar la ruta en `src/constants.ts`.

## 🛠️ Tecnologías

- **Bun**: Runtime JavaScript ultra-rápido
- **Puppeteer**: Control programático de Chrome/Chromium
- **Chalk**: Colores en terminal
- **Ora**: Spinners elegantes
- **CLI Table3**: Tablas formateadas

## 📝 Origen

Este proyecto nació del concepto **wspp-cli** (WhatsApp CLI automation) y evoluciona como una demostración general de automatización web con Puppeteer.
