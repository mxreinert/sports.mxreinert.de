# Online-Setup: GitHub → Supabase → Netlify → Domain

Reihenfolge einhalten. Alles läuft im Browser, keine CLI nötig. Dauer ca. 30 Minuten (+ Wartezeit DNS).

## 1. GitHub

1. github.com → **New repository**
   - Name: `sports.mxreinert.de` · **Private** · *ohne* README/.gitignore/Lizenz (gibt es schon)
2. Im Projektordner (Terminal):
   ```bash
   git remote add origin https://github.com/DEIN-NAME/sports.mxreinert.de.git
   git push -u origin main
   ```
   Beim ersten Push öffnet sich der GitHub-Login im Browser (Git Credential Manager).

## 2. Supabase

1. supabase.com → deine Organisation → **New project**
   - Name `mx-sports` · Region **Central EU (Frankfurt)** · starkes DB-Passwort (in den Passwort-Manager, wird von der App nicht gebraucht)
   - Kommt die Meldung, dass das Limit von 2 Free-Projekten erreicht ist → Bescheid geben (Alternative: Flow-Projekt).
2. **SQL Editor** → New query → Inhalt von `supabase/migrations/001_init.sql` einfügen → **Run**
   - Erwartung: „Success. No rows returned“. Unter *Table Editor* stehen 11 Tabellen, jede mit „RLS enabled“.
3. **Authentication → Sign In / Providers → Email**
   - Email: an · **„Allow new users to sign up“: AUS** (niemand außer dir kann ein Konto anlegen)
4. **Authentication → Users → Add user → Create new user**
   - deine E-Mail + starkes Passwort · **Auto Confirm User: an**
5. **Authentication → Multi-Factor** → TOTP (App Authenticator): **an** (ist Standard)
6. **Authentication → URL Configuration**
   - Site URL: `https://mxsports.mxreinert.de`
   - Redirect URLs: `http://localhost:5600`
7. **Project Settings → API Keys** bzw. **Data API**
   - **Project URL** und **anon / publishable key** an Claude geben → kommen in `src/js/env.js`
   - ⚠️ Den **service_role / secret key** NIE weitergeben oder ins Repo legen.

## 3. Netlify

1. app.netlify.com → **Add new project → Import an existing project → GitHub** → Repo `sports.mxreinert.de` wählen
   - Branch `main` · Build command **leer** · Publish directory `src` (steht schon in `netlify.toml`)
2. **Deploy** → läuft auf `https://<name>.netlify.app`
   - Projektnamen unter *Project configuration → Change project name* z. B. auf `mx-sports` setzen.
3. **Domain management → Add a domain** → `mxsports.mxreinert.de` → *Verify* → „Add domain“
   - Netlify zeigt jetzt, worauf der DNS-Eintrag zeigen soll: `<name>.netlify.app`

## 4. IONOS (DNS)

1. IONOS → **Domains & SSL** → `mxreinert.de` → **DNS** → **Datensatz hinzufügen** → **CNAME**
   - Hostname: `mxsports`
   - Zeigt auf: `<name>.netlify.app`
   - TTL: 1 Stunde
2. Warten (meist 5–60 Minuten). Dann in Netlify: **Domain management → HTTPS → Verify DNS configuration**
   - Das Let's-Encrypt-Zertifikat kommt automatisch.

## 5. Erster Login

1. `https://mxsports.mxreinert.de` öffnen → E-Mail + Passwort
2. Beim ersten Mal: QR-Code mit der Authenticator-App scannen → Code eingeben (2FA)
3. Setup-Overlay: Phase und Startwerte festlegen
4. Optional: lokale Testdaten mitnehmen → lokal *Einstellungen → Daten → Exportieren*, online *Importieren*
5. Am Handy: im Browser öffnen → *Zum Home-Bildschirm* (PWA)

## Deploy-Regeln

- Jeder Push auf `main` = ein Netlify-Deploy (verbraucht Kontingent) → **selten und gebündelt pushen**, vorher abstimmen.
- Lokal weiter entwickeln mit `npm start`. Mit `http://localhost:5600/?lokal` läuft die App im Testmodus ohne Login
  (Browser-Speicher), sonst gegen die echte Datenbank.

## 6. Hevy & Strava (Sync)

Reihenfolge: erst Datenbank + Netlify-Variablen, **dann** deployen (Netlify liest Variablen beim Deploy).

1. **Supabase → SQL Editor:** `supabase/migrations/002_integrations.sql` ausführen (Tabelle für die verschlüsselten Zugänge).
2. **Strava-App anlegen:** strava.com/settings/api
   - Application Name `mx sports` · Category `Data Importer` · Website `https://mxsports.mxreinert.de`
   - **Authorization Callback Domain:** `mxsports.mxreinert.de` (ohne https://)
   - Danach **Client ID** und **Client Secret** notieren.
3. **Netlify → Project configuration → Environment variables → Add a variable** (je eine):
   - `SECRETS_ENCRYPTION_KEY` → Wert aus der Datei `.env.local` im Projektordner (nur lokal, nie im Repo)
   - `STRAVA_CLIENT_ID` → Client ID
   - `STRAVA_CLIENT_SECRET` → Client Secret (als „secret“ markieren)
4. Deploy (Push auf `main` oder in Netlify *Deploys → Trigger deploy*).
5. In der App: **Einstellungen → Hevy & Strava**
   - Hevy: API-Key aus hevy.com/settings?developer einfügen → *Speichern & prüfen*
   - Strava: *Mit Strava verbinden* → bei Strava bestätigen (Haken bei Aktivitäten lassen)
   - *Jetzt synchronisieren* – der erste Hevy-Import kann je nach Menge ein paar Durchläufe dauern.

Strava-Verbindung funktioniert nur unter `mxsports.mxreinert.de` (Callback-Domain), nicht unter `*.netlify.app`.
Danach synchronisiert die App beim Öffnen automatisch (höchstens alle 30 Minuten).
