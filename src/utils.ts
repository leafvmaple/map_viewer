// ============================================================
// Small shared helpers
// ============================================================

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape a string for safe interpolation into innerHTML (both element content
 * and double-quoted attribute values). Game data and user input (map names,
 * item labels, IDs) flow into HTML templates all over the UI — always pass
 * them through here first.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
