# CLAUDE.md – sports.mxreinert.de

Persönlicher Sport-Tracker für Max (ein Nutzer). Details: `README.md`, Konzept: `docs/KONZEPT.md`.

## Regeln
- **Konzept folgen.** Nichts „auf Vorrat“ bauen und keine Funktionen aus anderen Projekten (mxCoaching, Flow) übernehmen. Bei Lücken im Konzept nachfragen.
- **Stack:** Vanilla JS (ES-Module), kein Framework, kein Build, keine neuen Abhängigkeiten ohne Rückfrage.
- **Sprache:** UI und Kommentare Deutsch, Code-Bezeichner Englisch.
- **Logik gehört nach `src/js/lib/`** (rein, ohne DOM) und bekommt Tests in `tests/`. Vor jeder Änderung an Ringen/Ziel-Check: `npm test`.
- **Daten nur über `src/js/store/db.js`** schreiben. Neue Tabelle ⇒ in `store/schema.js` STORES **und** als Migration in `supabase/migrations/` (Test prüft das; Export/Import nimmt sie automatisch mit).
- **Versionierte Einstellungen nie überschreiben** – immer neue Version mit `valid_from`.
- **Zeitzone** immer Europe/Luxembourg über `lib/dates.js` (`dayOf`, `today`), nie `new Date().toISOString().slice(0,10)`.
- **Design:** Dark Mode, Tokens in `src/css/tokens.css`, Bausteine aus `ui/kit.js` wiederverwenden.

## Online (Netlify + Supabase) – siehe docs/SETUP.md
- Deploy = Push auf `main` (Netlify baut). Selten und gebündelt pushen, vorher mit Max abstimmen. Nie `netlify deploy`.
- Keine Secrets ins Repo; Hevy-/Strava-/Service-Keys nur als Netlify-Umgebungsvariablen. Im Frontend nur der öffentliche Supabase-anon-Key.
- Supabase: jede Tabelle mit RLS (eigene user_id + 2FA/aal2). Neue Migration = neue Datei in `supabase/migrations/`, nur nach OK von Max ausführen.
- Lokal testen ohne echte Daten: `http://localhost:5600/?lokal`.
