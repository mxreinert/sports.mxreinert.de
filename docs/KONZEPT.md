# Konzept: Self-Tracking App (Gym + Laufen + Ernährung + Gewicht)

> Ziel: Eine persönliche Web-App, die Training, Ernährung und Gewicht an einem Ort zusammenführt, den Wochenfortschritt als 4 einstellbare Ringe zeigt und wöchentliche bzw. zweiwöchentliche PDF-Berichte zum Herunterladen erzeugt, die ich meiner Coachin zeigen kann.
> Nutzer: 1 Person (ich). Kein Multi-User, keine Social-Features.

---

## 1. Rahmenbedingungen

- **Web-App**, gehostet auf **Netlify**, auf dem Handy als PWA zum Homescreen hinzufügbar
- **Hevy:** automatisch über die offizielle API (Hevy Pro, API-Key unter hevy.com/settings?developer)
- **Strava:** automatisch über die offizielle API (OAuth). Uhr → Strava → App
- **Yazio:** **manuell**. Abends die Endwerte (kcal, Protein, KH, Fett) eintragen
- **Gewicht:** manuell
- **PDF:** in der App per Button herunterladbar, kein automatischer Versand
- **Alle Zielwerte und Ring-Regeln** sind in der App einstellbar (Coach-Einstellungen)

---

## 2. Die 4 Wochenringe (Mo–So)

Jeder Ring hat ein **Ziel** und **Regeln**, beides in den Einstellungen änderbar. Die Werte unten sind nur Startwerte.

### Ring 1 – Gym
| Einstellung | Startwert |
|---|---|
| Ziel Sessions/Woche | 5 |
| Mindestdauer pro Session | 30 Min |
| Mindest-Arbeitssätze | 8 |
| Max. Sessions pro Tag | 1 |
| Über 100 % erlaubt | Nein |

Quelle: Hevy

### Ring 2 – Laufen
| Einstellung | Startwert |
|---|---|
| Ziel Läufe/Woche | 2 |
| Mindestdauer | 15 Min |
| oder Mindestdistanz | 2 km |
| Über 100 % erlaubt | Ja |

Quelle: Strava, Fallback: manueller Eintrag

### Ring 3 – Ernährung
Ein Tag ist **grün**, wenn er eingetragen ist und alle aktiven Bedingungen erfüllt:
| Einstellung | Startwert |
|---|---|
| Ziel grüne Tage/Woche | 6 |
| kcal-Ziel | (von Coachin) |
| kcal-Toleranz | ± 150 kcal |
| Proteinziel | (von Coachin) |
| Optional: KH-/Fett-Ziel prüfen | Aus |
| "Gelber Tag" (halber Punkt) | An, bei ± 300 kcal |

### Ring 4 – Wiegen (Konstanz)
Misst nur, **ob ich regelmäßig eintrage**, nicht was die Waage zeigt.
| Einstellung | Startwert |
|---|---|
| Ziel Wiegungen/Woche | 5 |

Der Gewichtsverlauf (Tageswerte + 7-Tage-Schnitt) erscheint trotzdem als Grafik in Dashboard und PDF – ohne Bewertung, als reine Info für die Coachin.

---

## 2b. Ziel-Check: Was wurde gehittet?

Zusätzlich zu den Ringen gibt es eine **Checkliste pro Tag und pro Woche**, die genau zeigt, welches Ziel erreicht wurde (✅), knapp verfehlt (🟡) oder verfehlt (❌) – jeweils mit Ist- und Zielwert.

**Pro Tag:**
- kcal im Korridor? (z. B. 3.050 / 3.100 ✅)
- Protein erreicht? (162 / 170 g 🟡)
- KH / Fett im Ziel? (optional, falls aktiviert)
- Gewogen?
- Training geplant/erledigt?
- Check-in eingetragen?

**Pro Woche:**
- Gym-Sessions (4 / 5 ❌)
- Läufe (2 / 2 ✅)
- Grüne Ernährungstage (6 / 6 ✅)
- Wiegungen (7 / 5 ✅)
- **Sätze pro Muskelgruppe** (siehe unten)
- Gesamt: "X von Y Wochenzielen erreicht"

Diese Checkliste steht im Dashboard und ist Kernteil beider PDF-Berichte.

### Sätze pro Muskelgruppe

Aus den Hevy-Workouts werden die **Arbeitssätze pro Muskelgruppe und Woche** gezählt und mit einem Ziel verglichen.

**Einstellungen (Coach-Einstellungen → Volumen):**
| Muskelgruppe | Ziel Sätze/Woche (Startwert) |
|---|---|
| Brust | 10–16 |
| Rücken (Lat/oberer Rücken) | 12–18 |
| Schultern (seitlich/hinten) | 10–16 |
| Bizeps | 8–14 |
| Trizeps | 8–14 |
| Quadrizeps | 10–16 |
| Beinbeuger | 8–12 |
| Gesäß | 8–14 |
| Waden | 6–12 |
| Bauch | 6–10 |

Ziel als **Spanne** (Min–Max): unter Min = ❌, in der Spanne = ✅, über Max = 🟡 (Hinweis "viel Volumen").

**Zählregeln (einstellbar):**
- Nur Arbeitssätze zählen, Aufwärmsätze nicht (Hevy markiert Satztypen: warmup / normal / failure / dropset)
- Primärmuskel = 1 Satz, Sekundärmuskel = 0,5 Satz (z. B. Bankdrücken: Brust 1, Trizeps 0,5). Umschaltbar auf "nur Primärmuskel"
- Hevy liefert bei seinen Standard-Übungen eine primäre und sekundäre Muskelgruppe. **Eigene Übungen** in Hevy haben das oft nicht sauber → in der App gibt es eine **Übungs-Zuordnung**, wo ich fehlende oder falsche Muskelgruppen manuell festlege. Diese Zuordnung hat Vorrang vor Hevy
- Hevys Muskelgruppen sind teils gröber oder anders benannt als meine Liste → Mapping-Tabelle Hevy-Gruppe → App-Gruppe

**Anzeige:**
- Balkendiagramm Ist vs. Zielspanne pro Muskel
- Verlauf über mehrere Wochen (für den Zweiwochenbericht)

### Allgemeine Ring-Einstellungen
- Ring ein-/ausblenden
- Wochenstart (Montag als Standard)
- **Pausen-Woche markieren** (Deload, Krankheit, Urlaub): Ringziele werden für diese Woche reduziert oder ausgesetzt

---

## 3. Coach-Einstellungen

Eine eigene Seite, auf der ich eintrage, was die Coachin vorgibt.

**Felder:**
- Phase: Bulk / Cut / Maintenance
- kcal-Ziel, Protein, KH, Fett
- Toleranzen
- Trainingsziele (Gym-Sessions, Läufe)
- Wiegeziel
- **Gültig ab** (Datum)
- Notiz (z. B. "Von Coachin am 15.10. besprochen: +150 kcal")

**Wichtig – Versionierung:** Jede Änderung wird als neue Version mit "gültig ab" gespeichert, nicht überschrieben. So werden alte Wochen mit den Zielen bewertet, die damals galten, und die Ringe der Vergangenheit ändern sich nicht nachträglich. Ein Verlauf zeigt alle bisherigen Zielversionen.

---

## 4. Tägliche Eingabe

**Abend-Check-in (ein Screen, < 1 Minute):**
- kcal, Protein, KH, Fett
- Gewicht (falls morgens nicht eingetragen)
- Optional: Schlaf, Energie, Hunger (je 1–5), kurze Notiz

**Morgens:** Schnell-Eingabe Gewicht

**Erinnerung:** Hinweis im Dashboard bzw. Push (PWA) gegen ~21:00, wenn der Tag noch nicht eingetragen ist. Ein "Tage nicht vergessen"-Streak als Motivation.

---

## 5. Berichte (PDF zum Herunterladen)

Auf einer Seite "Berichte" Zeitraum wählen → Vorschau → "PDF herunterladen".

### Wochenbericht
1. Die 4 Ringe + **Ziel-Check der Woche** (alle Ziele mit Ist/Soll und ✅🟡❌)
2. Gewicht: Tageswerte + 7-Tage-Schnitt + Veränderung zur Vorwoche
3. Ernährung: Ø kcal, Ø Protein/KH/Fett vs. Ziel, grüne/gelbe/rote Tage
4. Gym: Sessions, Gesamtvolumen, **Sätze pro Muskelgruppe vs. Zielspanne**, Top-Sätze der Hauptübungen
5. Laufen: Anzahl, Distanz, Dauer, Ø Pace, Ø HF
6. Optional: Schlaf/Energie/Hunger als Mini-Verlauf
7. Notizen der Woche

### Zweiwochenbericht
1. Woche A vs. Woche B nebeneinander
2. Gewichtsveränderung über 14 Tage (kg und %)
3. Kraftentwicklung: geschätztes 1RM der Hauptübungen
4. Volumen pro Muskelgruppe im Vergleich
5. Ernährungs-Adhärenz über 14 Tage
6. Aktuell gültige Coach-Ziele
7. Freitextfeld: Fragen an die Coachin

---

## 6. Technik

### Stack
- **Next.js (TypeScript)** auf Netlify
- **Datenbank: Supabase oder Neon (Postgres)**. Netlify hat keine dauerhafte Festplatte, SQLite-Dateien gehen hier nicht
- **Auth:** Supabase Auth oder einfacher Passwort-Login. Die App ist öffentlich erreichbar und enthält Gesundheitsdaten, also Pflicht
- **Ringe:** eigene SVG-Komponente
- **Charts:** Recharts o. Ä.
- **PDF:** `@react-pdf/renderer`, im Browser erzeugt. Kein Server-Chrome nötig, passt zu Netlify

### Syncs auf Netlify
- **Netlify Functions** für Hevy- und Strava-Abrufe sowie den Strava-OAuth-Callback
- **Netlify Scheduled Functions** für einen täglichen Sync
- Zusätzlich: **Sync beim Öffnen der App** + Button "Jetzt synchronisieren"
- Strava-Webhooks sind mit Netlify grundsätzlich möglich (öffentliches HTTPS), aber erst später – Polling reicht für eine Person

### Sicherheit
- Hevy-Key und Strava-Secrets nur als Netlify-Umgebungsvariablen, nie im Repo
- Strava-Refresh-Token verschlüsselt in der DB

### Datenmodell (grob)
- `daily_log` – datum, kcal, protein, kh, fett, gewicht, schlaf, energie, hunger, notiz
- `workout` – hevy_id, datum, dauer, sätze, volumen, rohdaten (JSON)
- `workout_set` – workout_id, übung, muskelgruppe, gewicht, wdh, rpe
- `run` – strava_id, datum, distanz, dauer, pace, hf, quelle (strava/manuell)
- `coach_targets` – gültig_ab, phase, kcal, toleranz, protein, kh, fett, notiz
- `ring_settings` – ring, aktiv, ziel, regeln (JSON), gültig_ab
- `week_exception` – woche, grund, angepasste Ziele
- `muscle_targets` – muskelgruppe, min_sätze, max_sätze, gültig_ab
- `exercise_mapping` – hevy_template_id, übungsname, primärmuskel, sekundärmuskeln, quelle (hevy/manuell)

---

## 7. Roadmap für Claude Code

1. **Grundgerüst:** Next.js + Netlify + DB + Login
2. **MVP:** Abend-Check-in, Gewicht, Coach-Einstellungen, Ernährungs- und Wiegering
3. **Hevy-Sync** + Gym-Ring + Sätze pro Muskelgruppe + Übungs-Zuordnung
3b. **Ziel-Check** (Tages- und Wochen-Checkliste)
4. **Strava-OAuth + Sync** + Lauf-Ring (+ manueller Lauf)
5. **Ring-Einstellungen** und Pausen-Wochen
6. **Wochenbericht-PDF**
7. **Zweiwochenbericht-PDF**
8. Extras

Für die Ring-Berechnung zuerst Tests schreiben lassen (Grenzfälle: Wochenwechsel, Zeitzone Europe/Luxembourg, zwei Workouts am selben Tag, fehlende Tage, Zieländerung mitten in der Woche).

---

## 8. Spätere Ideen

- Taillenumfang 1×/Woche (Hevy hat einen Body-Measurements-Endpoint)
- Fortschrittsfotos
- Streaks: Wochen in Folge mit allen Ringen voll
- Jahresansicht mit 52 Mini-Ringen
- Hinweis, wenn ein langer Lauf viele kcal verbraucht hat

---

## 9. Offene Punkte

- [ ] Konkrete Startwerte von der Coachin
- [ ] Was will die Coachin im PDF sehen?
- [ ] Supabase oder Neon?
