// Sync mit Hevy und Strava. Kommt in Phase 2 über Netlify Functions (Keys nie im Browser).
// Bis dahin gibt der Button eine klare Rückmeldung statt still nichts zu tun.
import { toast } from '../ui/kit.js';

export function runSync() {
  toast('Hevy- & Strava-Sync kommt in Phase 2 (online)', { kind: 'error', ms: 3000 });
}
