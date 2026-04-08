/**
 * Simple template engine: replaces {{variable}} with values from a record.
 * Missing variables are replaced with empty string.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
