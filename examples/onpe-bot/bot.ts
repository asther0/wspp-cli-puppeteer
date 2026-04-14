/**
 * ONPE Bot 2026
 * Monitorea resultados electorales y los envía a un grupo de WhatsApp
 * vía wspp-cli server (wspp-serve).
 *
 * Uso:
 *   bun run bot.ts "Nombre del Grupo"
 *   bun run bot.ts "Nombre del Grupo" --key mi-clave
 */

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function argValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// Acepta uno o varios grupos separados por coma:
//   bun run bot.ts "Grupo A,Grupo B,Grupo C" --key mi-clave
const rawGroups = args.find(a => !a.startsWith("--")) ?? "";
const GROUPS    = rawGroups.split(",").map(g => g.trim()).filter(Boolean);
const WSPP_KEY  = argValue("--key") ?? "";
const WSPP_API  = "http://localhost:3000";
const INTERVAL  = 10 * 60 * 1000; // 10 minutos fijo
const TOP_N     = 5;               // top 5 fijo
const GROUP_DELAY_MS = 3000;       // 3s entre grupos — suficiente para grupos propios

// ── ONPE endpoints ────────────────────────────────────────────────────────────
const BASE = "https://resultadoelectoral.onpe.gob.pe/presentacion-backend/resumen-general";
const TOTALES_URL      = `${BASE}/totales?idEleccion=10&tipoFiltro=eleccion`;
const PARTICIPANTES_URL = `${BASE}/participantes?idEleccion=10&tipoFiltro=eleccion`;

const ONPE_HEADERS = {
  "accept": "*/*",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "referer": "https://resultadoelectoral.onpe.gob.pe/main/resumen",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Totales {
  actasContabilizadas: number;
  contabilizadas: number;
  totalActas: number;
  totalVotosValidos: number;
  fechaActualizacion: number;
}

interface Candidato {
  nombreCandidato: string;
  nombreAgrupacionPolitica: string;
  totalVotosValidos: number;
  porcentajeVotosValidos: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
let lastFechaActualizacion: number | null = null;
let sentCount = 0;

// ── ONPE fetchers ─────────────────────────────────────────────────────────────
async function fetchTotales(): Promise<Totales> {
  const res = await fetch(TOTALES_URL, { headers: ONPE_HEADERS });
  if (!res.ok) throw new Error(`ONPE totales error: ${res.status}`);
  const json = await res.json() as { success: boolean; data: Totales };
  if (!json.success) throw new Error("ONPE totales: success=false");
  return json.data;
}

async function fetchCandidatos(): Promise<Candidato[]> {
  const res = await fetch(PARTICIPANTES_URL, { headers: ONPE_HEADERS });
  if (!res.ok) throw new Error(`ONPE participantes error: ${res.status}`);
  const json = await res.json() as { success: boolean; data: Candidato[] };
  if (!json.success) throw new Error("ONPE participantes: success=false");
  // API returns ascending order — reverse for descending
  return json.data.slice().sort((a, b) => b.totalVotosValidos - a.totalVotosValidos);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function titleCase(str: string): string {
  // Split by spaces to avoid regex \b treating accented chars (ó, á, etc.) as boundaries
  return str.toLowerCase().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Extrae nombre corto según cantidad de partes:
 *   3 partes: "JORGE NIETO MONTESINOS"        → "Jorge Nieto"    (nombre + apellido1)
 *   4+partes: "KEIKO SOFIA FUJIMORI HIGUCHI"   → "Keiko Fujimori" (nombre1 + apellido1, saltando nombre2)
 */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 3) return titleCase(`${parts[0]} ${parts[1]}`);
  if (parts.length >= 4)  return titleCase(`${parts[0]} ${parts[2]}`);
  return titleCase(fullName);
}

function formatVotes(n: number): string {
  return n.toLocaleString("es-PE");
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildMessage(totales: Totales, candidatos: Candidato[]): string {
  const top = candidatos.slice(0, TOP_N);
  const actas = totales.actasContabilizadas.toFixed(3);
  const ts = formatTimestamp(totales.fechaActualizacion);

  const lines: string[] = [
    `📊 *RESULTADOS ONPE 2026*`,
    `━━━━━━━━━━━━━━━━━━━`,
    `🗳 Actas: *${actas}%* (${formatVotes(totales.contabilizadas)} / ${formatVotes(totales.totalActas)})`,
    `👥 Votos válidos: ${formatVotes(totales.totalVotosValidos)}`,
    ``,
  ];

  top.forEach((c, i) => {
    const name = shortName(c.nombreCandidato);
    const pct = c.porcentajeVotosValidos.toFixed(3);
    lines.push(`${i + 1}. *${name}* — ${pct}%`);
    lines.push(`   ${formatVotes(c.totalVotosValidos)} votos`);
  });

  lines.push(``, `━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🕐 ${ts}`);
  lines.push(`📡 resultadoelectoral.onpe.gob.pe`);

  return lines.join("\n");
}

// ── wspp sender ───────────────────────────────────────────────────────────────
async function sendToGroup(group: string, message: string): Promise<void> {
  const res = await fetch(`${WSPP_API}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": WSPP_KEY,
    },
    body: JSON.stringify({ to: group, message }),
  });

  const json = await res.json() as { ok: boolean; error?: string };
  if (!json.ok) throw new Error(`wspp-serve error: ${json.error}`);
}

async function broadcastToGroups(message: string): Promise<void> {
  for (let i = 0; i < GROUPS.length; i++) {
    const group = GROUPS[i];
    try {
      await sendToGroup(group, message);
      console.log(`  ✓ "${group}"`);
    } catch (err: any) {
      console.error(`  ✖ "${group}": ${err.message}`);
    }
    // Delay entre grupos para no parecer automatizado agresivo
    if (i < GROUPS.length - 1) await Bun.sleep(GROUP_DELAY_MS);
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
async function checkWsppHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WSPP_API}/health`);
    const json = await res.json() as { ok: boolean; status: string };
    return json.ok && json.status === "ready";
  } catch {
    return false;
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick(): Promise<void> {
  try {
    const totales = await fetchTotales();

    // Skip if data hasn't changed
    if (lastFechaActualizacion === totales.fechaActualizacion) {
      console.log(`[${new Date().toLocaleTimeString("es-PE")}] Sin cambios (${totales.actasContabilizadas.toFixed(2)}% actas)`);
      return;
    }

    console.log(`[${new Date().toLocaleTimeString("es-PE")}] ¡Datos actualizados! Obteniendo candidatos...`);
    const candidatos = await fetchCandidatos();
    const message = buildMessage(totales, candidatos);

    console.log(`  Enviando a ${GROUPS.length} grupo(s)...`);
    await broadcastToGroups(message);

    lastFechaActualizacion = totales.fechaActualizacion;
    sentCount++;
    console.log(`  ✓ Enviado (#${sentCount}) — ${candidatos[0] ? shortName(candidatos[0].nombreCandidato) : "?"} lidera`);

  } catch (err: any) {
    console.error(`  ✖ Error:`, err.message);
  }
}

async function main(): Promise<void> {
  console.log(`\n🗳  ONPE Bot 2026`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Grupos WA:  ${GROUPS.length ? GROUPS.join(", ") : "(no especificado)"}`);
  console.log(`   wspp API:   ${WSPP_API}`);
  console.log(`   Intervalo:  cada 10 min (solo si ONPE actualiza)`);
  console.log(`   Candidatos: top 5`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (GROUPS.length === 0) {
    console.error("❌ Falta el nombre del grupo. Ejemplos:");
    console.error('   bun run bot.ts "Mi Grupo"');
    console.error('   bun run bot.ts "Grupo A,Grupo B,Grupo C" --key mi-clave');
    process.exit(1);
  }

  // Wait for wspp-serve to be ready
  console.log("Verificando wspp-serve...");
  let ready = false;
  for (let i = 0; i < 10; i++) {
    ready = await checkWsppHealth();
    if (ready) break;
    console.log(`  wspp-serve no listo, reintentando en 5s... (${i + 1}/10)`);
    await Bun.sleep(5000);
  }

  if (!ready) {
    console.error("❌ wspp-serve no responde en http://localhost:3000\n   Inicia el servidor con: wspp-serve --port 3000 --key <clave>");
    process.exit(1);
  }

  console.log("✓ wspp-serve listo\n");

  // First run immediately
  await tick();

  // Then every INTERVAL
  setInterval(tick, INTERVAL);
  console.log(`\n⏱  Próxima verificación en ${INTERVAL / 60000} min. Ctrl+C para detener.\n`);
}

main();
