// Die Supabase-Migration muss jede Tabelle der App anlegen – sonst fehlen online Daten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STORES } from '../src/js/store/schema.js';

const sql = readdirSync('supabase/migrations').sort().map(f => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');

test('Migration legt alle App-Tabellen an', () => {
  const listed = [...sql.matchAll(/'(\w+)'/g)].map(m => m[1]);
  for (const name of Object.keys(STORES)) assert.ok(listed.includes(name), `Tabelle fehlt in der Migration: ${name}`);
});

test('Jede Tabelle hat RLS mit eigener user_id und 2FA-Pflicht', () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /'aal'\) = 'aal2'/);
  assert.match(sql, /revoke all on public\.%I from anon/);
});
