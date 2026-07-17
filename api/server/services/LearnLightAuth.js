const LEARNLIGHT_PLUGIN_KEY = 'learnlight';
const LEGACY_LEARNLIGHT_PLUGIN_KEY = 'learnlink';

const CANVAS_TOKEN_FIELD = 'LEARNLIGHT_CANVAS_TOKEN';
const CANVAS_TENANT_FIELD = 'LEARNLIGHT_CANVAS_TENANT';
const CANVAS_PENDING_REVOCATION_FIELD = 'LEARNLIGHT_CANVAS_PENDING_REVOCATION';
const LEGACY_CANVAS_TOKEN_FIELD = 'LEARNLINK_CANVAS_TOKEN';
const LEGACY_CANVAS_TENANT_FIELD = 'LEARNLINK_CANVAS_TENANT';

/** Exact PluginAuth fields currently owned exclusively by the server-side Canvas flow. */
const RESERVED_LEARNLIGHT_AUTH_FIELDS = Object.freeze([
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
]);
const reservedLearnLightAuthFieldSet = new Set(RESERVED_LEARNLIGHT_AUTH_FIELDS);
const RESERVED_LEARNLIGHT_AUTH_PREFIXES = ['LEARNLIGHT_CANVAS_', 'LEARNLINK_CANVAS_'];
const RESERVED_LEARNLIGHT_PLUGIN_KEYS = new Set([
  LEARNLIGHT_PLUGIN_KEY,
  LEGACY_LEARNLIGHT_PLUGIN_KEY,
]);
const CANVAS_TENANT_ID_PATTERN = /^[a-f\d]{16}$/;

/** Blocks both today's fields and future base/user fields inside the reserved Canvas namespaces. */
function isReservedLearnLightAuthField(authField) {
  return (
    typeof authField === 'string' &&
    (reservedLearnLightAuthFieldSet.has(authField) ||
      RESERVED_LEARNLIGHT_AUTH_PREFIXES.some((prefix) => authField.startsWith(prefix)))
  );
}

function isReservedLearnLightPluginKey(pluginKey) {
  return (
    typeof pluginKey === 'string' && RESERVED_LEARNLIGHT_PLUGIN_KEYS.has(pluginKey.toLowerCase())
  );
}

/** Tenant ids are lowercase, 16-character SHA-256 prefixes issued by the Canvas service. */
function isValidLearnLightTenantId(value) {
  return typeof value === 'string' && CANVAS_TENANT_ID_PATTERN.test(value);
}

module.exports = {
  LEARNLIGHT_PLUGIN_KEY,
  LEGACY_LEARNLIGHT_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  RESERVED_LEARNLIGHT_AUTH_FIELDS,
  isReservedLearnLightAuthField,
  isReservedLearnLightPluginKey,
  isValidLearnLightTenantId,
};
