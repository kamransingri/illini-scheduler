type JsonSchemaObject = { properties: Record<string, { type?: unknown }> };

/**
 * Query-string parameters as the values `schema` expects: numbers, true or false (also 1/0, yes/no), and lists given
 * either comma-separated (`gened=HUM,ACP`) or repeated (`gened=HUM&gened=ACP`). Names not in the schema are kept, so
 * the check that follows refuses them by name. `aliases` maps short names to the schema's (`q` to `query`).
 */
export function fromQuery(params: URLSearchParams, schema: JsonSchemaObject, aliases: Record<string, string> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const name = aliases[key] ?? key;
    const all = params.getAll(key);
    const last = all[all.length - 1].trim();
    const type = schema.properties[name]?.type;
    if (type === "array") out[name] = all.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    else if (type === "number" || type === "integer") out[name] = last === "" ? Number.NaN : Number(last);
    else if (type === "boolean") out[name] = /^(true|1|yes)$/i.test(last) ? true : /^(false|0|no)$/i.test(last) ? false : last;
    else out[name] = last;
  }
  return out;
}
