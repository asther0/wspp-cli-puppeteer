import chalk from "chalk";

export function parseScheduleTime(timeStr: string): Date {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Formato de hora inválido: "${timeStr}". Usa HH:MM (ej: 08:00, 14:30)`);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours > 23 || minutes > 59) {
    throw new Error(`Hora inválida: ${timeStr}`);
  }

  const now = new Date();
  const scheduled = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
  );

  // If time already passed today, schedule for tomorrow
  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
    console.log(chalk.yellow("  ⚡ La hora ya pasó hoy, programado para mañana"));
  }

  return scheduled;
}

export async function waitUntil(targetTime: Date): Promise<void> {
  return new Promise((resolve) => {
    const showCountdown = () => {
      const now = Date.now();
      const diff = targetTime.getTime() - now;

      if (diff <= 0) {
        clearInterval(interval);
        process.stdout.write("\r" + " ".repeat(60) + "\r");
        console.log(chalk.bold.green("  ✓ Hora alcanzada — enviando...\n"));
        resolve();
        return;
      }

      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);

      const timeStr = [
        h > 0 ? `${h}h` : "",
        `${m}m`,
        `${s}s`,
      ].filter(Boolean).join(" ");

      process.stdout.write(
        `\r${chalk.cyan("  ⏰ Esperando...")} ${chalk.bold.white(timeStr)}   `,
      );
    };

    showCountdown();
    const interval = setInterval(showCountdown, 1000);
  });
}
