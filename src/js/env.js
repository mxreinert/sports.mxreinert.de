// Öffentliche Supabase-Zugangsdaten (Project URL + anon/publishable Key).
// Diese Werte dürfen im Frontend stehen – geschützt wird alles über Login, 2FA und Row Level Security.
// NIEMALS den service_role/secret Key hier eintragen.
// Leer = lokaler Testmodus ohne Login (Daten nur im Browser).
export const SUPABASE = {
  url: '',
  anonKey: '',
};
