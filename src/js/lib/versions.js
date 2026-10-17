// Versionierte Einstellungen: nichts wird überschrieben, jede Änderung ist eine neue Version mit "gültig ab".
// Für einen Tag gilt die Version mit dem spätesten valid_from <= Tag; bei gleichem Datum die zuletzt angelegte.

export function versionAt(versions, date) {
  let best = null;
  for (const v of versions || []) {
    if (v.valid_from > date) continue;
    if (!best || v.valid_from > best.valid_from || (v.valid_from === best.valid_from && (v.created_at || '') > (best.created_at || ''))) best = v;
  }
  return best;
}

/** Neueste zuerst – für die Verlaufsanzeige. */
export function sortVersions(versions) {
  return [...(versions || [])].sort((a, b) =>
    b.valid_from.localeCompare(a.valid_from) || (b.created_at || '').localeCompare(a.created_at || ''));
}

/** Zusammenführen mit Startwerten, damit neue Felder in alten Versionen nicht fehlen. */
export function withDefaults(v, defaults) {
  if (!v) return structuredClone(defaults);
  const out = structuredClone(defaults);
  for (const [k, val] of Object.entries(v)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...val };
    } else {
      out[k] = val;
    }
  }
  return out;
}
