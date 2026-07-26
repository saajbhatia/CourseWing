/**
 * Stored PluginAuth identifiers keep their pre-CourseWing names ('learnlight'/'learnlink'
 * plugin keys, LEARNLIGHT_/LEARNLINK_ Canvas fields) — they name data at rest in the
 * production database and renaming them would require a live-data migration.
 */
const COURSEWING_PLUGIN_KEY = 'learnlight';
const LEGACY_COURSEWING_PLUGIN_KEY = 'learnlink';

const CANVAS_TOKEN_FIELD = 'LEARNLIGHT_CANVAS_TOKEN';
const CANVAS_TENANT_FIELD = 'LEARNLIGHT_CANVAS_TENANT';
const CANVAS_PENDING_REVOCATION_FIELD = 'LEARNLIGHT_CANVAS_PENDING_REVOCATION';
const LEGACY_CANVAS_TOKEN_FIELD = 'LEARNLINK_CANVAS_TOKEN';
const LEGACY_CANVAS_TENANT_FIELD = 'LEARNLINK_CANVAS_TENANT';

/** Exact PluginAuth fields currently owned exclusively by the server-side Canvas flow. */
const RESERVED_COURSEWING_AUTH_FIELDS = Object.freeze([
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
]);
const reservedCourseWingAuthFieldSet = new Set(RESERVED_COURSEWING_AUTH_FIELDS);
const RESERVED_COURSEWING_AUTH_PREFIXES = [
  'COURSEWING_CANVAS_',
  'LEARNLIGHT_CANVAS_',
  'LEARNLINK_CANVAS_',
];
const RESERVED_COURSEWING_PLUGIN_KEYS = new Set([
  'coursewing',
  COURSEWING_PLUGIN_KEY,
  LEGACY_COURSEWING_PLUGIN_KEY,
]);
const CANVAS_TENANT_ID_PATTERN = /^[a-f\d]{16}$/;

/** Blocks both today's fields and future base/user fields inside the reserved Canvas namespaces. */
function isReservedCourseWingAuthField(authField) {
  return (
    typeof authField === 'string' &&
    (reservedCourseWingAuthFieldSet.has(authField) ||
      RESERVED_COURSEWING_AUTH_PREFIXES.some((prefix) => authField.startsWith(prefix)))
  );
}

function isReservedCourseWingPluginKey(pluginKey) {
  return (
    typeof pluginKey === 'string' && RESERVED_COURSEWING_PLUGIN_KEYS.has(pluginKey.toLowerCase())
  );
}

/** Tenant ids are lowercase, 16-character SHA-256 prefixes issued by the Canvas service. */
function isValidCourseWingTenantId(value) {
  return typeof value === 'string' && CANVAS_TENANT_ID_PATTERN.test(value);
}

module.exports = {
  COURSEWING_PLUGIN_KEY,
  LEGACY_COURSEWING_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  RESERVED_COURSEWING_AUTH_FIELDS,
  isReservedCourseWingAuthField,
  isReservedCourseWingPluginKey,
  isValidCourseWingTenantId,
};
