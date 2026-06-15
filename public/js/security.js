/* ═══════════════════════════════════════════
   SECURITY.JS — XSS Prevention Utilities
   Must be loaded BEFORE all other scripts.
   ═══════════════════════════════════════════ */

/**
 * Escapes HTML special characters to prevent XSS when
 * interpolating user-supplied values into innerHTML strings.
 * @param {*} str - Value to escape (coerced to string)
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Escapes a string for safe use inside an HTML attribute
 * value (e.g. onclick="..."). Handles quotes and special chars.
 * @param {*} str - Value to escape
 * @returns {string} Attribute-safe string
 */
function escapeAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\');
}
