// Minimal JSON-schema check for model output (type, properties, required, items, enum).
function validate(value, schema, at = "$") {
  const errs = [];
  const type = schema.type;
  const isType = {
    object: v => v !== null && typeof v === "object" && !Array.isArray(v),
    array: Array.isArray,
    string: v => typeof v === "string",
    integer: Number.isInteger,
    number: v => typeof v === "number" && Number.isFinite(v),
    boolean: v => typeof v === "boolean",
  };
  const types = Array.isArray(type) ? type : [type];
  if (type && !types.some(t => (t === "null" ? value === null : isType[t] && isType[t](value)))) {
    return [`${at}: expected ${types.join(" or ")}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: must be one of ${schema.enum.join(", ")}`);
  if (isType.object(value) && schema.properties) {
    (schema.required || []).forEach(k => { if (!(k in value)) errs.push(`${at}.${k}: required`); });
    Object.entries(schema.properties).forEach(([k, sub]) => { if (k in value) errs.push(...validate(value[k], sub, `${at}.${k}`)); });
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, `${at}[${i}]`)));
  if (Array.isArray(value) && schema.maxItems != null && value.length > schema.maxItems) errs.push(`${at}: at most ${schema.maxItems} items`);
  if (typeof value === "string" && schema.maxLength != null && value.length > schema.maxLength) errs.push(`${at}: too long`);
  return errs;
}
module.exports = { validate };
