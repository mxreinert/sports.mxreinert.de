# mx sports – mxsports.mxreinert.de

Persönlicher Tracker für Gym, Laufen, Ernährung und Gewicht (nur Max). Wochenfortschritt als 4 Ringe,
Ziel-Check pro Tag/Woche, Sätze pro Muskelgruppe, versionierte Coach-Ziele und PDF-Berichte für den Coach.
Konzept: `docs/KONZEPT.md`.

## Starten (lokal)

```bash
npm start      # http://localhost:5600 (im WLAN auch vom Handy, Adresse steht in der Konsole)
npm test       # Logik-Tests (Ringe, Ziel-Check, Zeitzone, Versionen, Volumen)
```

Keine Abhängigkeiten, kein Build. Nur Node ≥ 20 für Server und Tests.

**Erster Start:** Ein Setup-Overlay fragt Phase (Bulk/Cut/Maintenance), Start/Ende, Ernährung und Wochenziele ab –
oder lädt Demo-Daten.

**Online:** Sind in `src/js/env.js` Supabase-URL und anon-Key eingetragen, braucht die App Login + 2FA und speichert in
Supabase (EU). Ohne Eintrag – oder lokal mit `http://localhost:5600/?lokal` – läuft sie im Testmodus mit Browser-Speicher
(Demo-Daten, Export/Import, Löschen unter *Einstellungen → Daten*). Einrichtung Schritt für Schritt: `docs/SETUP.md`.

## Aufbau

```
src/                      Web-Root (wird 1:1 ausgeliefert)
  index.html, sw.js, manifest.webmanifest, icons/
  css/  tokens.css (Design-Tokens) · app.css (UI) · report.css (PDF)
  js/
    main.js               Start, Hash-Router, Tab-Leiste
    config.js             Listen + Startwerte (Ringe, Muskeln, Hevy-Gruppen, Defaults)
    lib/                  reine Logik, ohne DOM – getestet
      engine.js           Ringe, Ziel-Check, Streak, Gewichtsverlauf
      training.js         Arbeitssätze, Sätze/Muskel, e1RM, Top-Sätze
      versions.js         "gültig ab"-Versionen
      phases.js           Phasen: aktiv / abgelaufen / geplant, neue Phase, Ende ändern
      imports.js          Hevy-/Strava-Rohdaten → App-Format
      dates.js, format.js Zeitzone Europe/Luxembourg, deutsche Formate
    store/                Datenschicht: db.js (API + Snapshot), schema.js (Tabellen), idb.js (lokal), cloud.js (Supabase + Login), demo.js
    ui/                   h() DOM-Helfer, Kit (Listen, Sheets, Felder …), Ringe, Charts, Icons
    views/                Heute, Woche, Verlauf, Berichte, Einstellungen, Sheets, setup.js (Overlay)
    env.js                öffentliche Supabase-URL + anon-Key (leer = Testmodus)
  vendor/                 supabase-js 2.117.2 (UMD, MIT)
supabase/migrations/      SQL fürs Supabase-Projekt (RLS + 2FA-Pflicht)
tests/                    node:test
tools/serve.mjs           lokaler Server ohne Abhängigkeiten
```

## Wichtige Regeln der Auswertung

- **Phasen:** Eine Phase hat Start und geplantes Ende und legt ab ihrem Start eine neue Coach-Version an (optional neue
  Trainingstage). Nach dem Ende erscheint das Setup erneut (verlängern oder neue Phase) – bis dahin gelten die alten Ziele
  weiter, es wird nie etwas gelöscht. Eine neue Phase kann auch geplant werden (z. B. Cut ab Januar); startet sie vor dem
  geplanten Ende der laufenden, endet diese am Vortag. Nur geplante Phasen lassen sich löschen.

- **Tagesziele** (kcal, Protein, Makros) gelten pro Tag → eine Änderung mitten in der Woche wirkt ab diesem Tag.
- **Wochenziele und Ring-Regeln** gelten so, wie sie am ersten Tag der Woche gültig waren.
- Alte Wochen ändern sich nie durch neue Versionen. Die Basis-Version (gültig ab 2000-01-01) kann nicht gelöscht werden.
- Ernährungstag: jede Bedingung ok / knapp / verfehlt → grün (1) · gelb (½) · rot (0).
- Gym: zählt ab Mindestdauer **und** Mindest-Arbeitssätzen, max. N pro Tag. Lauf: Mindestdauer **oder** -distanz.
- Volumen: Aufwärmsätze zählen nie; primär 1, sekundär ½ (umschaltbar). Eigene Zuordnung > Hevy.

## Online-Betrieb

- **Hosting:** Netlify, publish = `src`, kein Build (`netlify.toml`, inkl. strenger Content-Security-Policy).
  Domain `mxsports.mxreinert.de` per CNAME bei IONOS.
- **Datenbank:** Supabase, eine Tabelle pro Store (`k` = Schlüssel, `data` = Datensatz als JSON). RLS: nur eigene Zeilen
  und nur mit 2FA (aal2). Sign-ups aus, Konto wird im Supabase-Dashboard angelegt.
- **Sync:** Netlify Functions `integrations` (Hevy-Key, Strava-OAuth) und `sync` (in Etappen). Zugriff nur mit Login + 2FA;
  die Functions schreiben mit dem Login des Nutzers (RLS), kein Service-Key. Hevy-Key / Strava-Token AES-256-GCM-verschlüsselt
  in `integrations`. Netlify-Env: `SECRETS_ENCRYPTION_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
- **Push:** Functions `push` (Gerät/Plan, Login + 2FA) und `push-reminders` (alle 5 min). Web Push ohne Bibliothek
  (RFC 8291/8292, gegen RFC-Testvektor geprüft), Ablage in Netlify Blobs (`@netlify/blobs`). Netlify-Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- **Noch offen:** Offline-Schreiben, täglicher Hevy/Strava-Sync ohne geöffnete App.
