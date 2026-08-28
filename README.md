# Wolken Launcher

Ein selbstgebauter Launcher für meine Spiele. Man installiert ihn wie eine
richtige App, lädt Spiele darin herunter, spielt sie danach auch ohne
Internet — und wenn ich eine neue Version veröffentliche, meldet er das Update.

Reines HTML, CSS und JavaScript. Kein Framework, keine Bibliothek.

---

## Starten

**Als Programm (so ist es gedacht):**

Doppelklick auf `dist\Wolken.exe`. Das Programm

1. sucht sich einen freien Port und startet darauf seinen eigenen Server,
   erreichbar nur ueber `127.0.0.1` — also nur auf diesem Rechner,
2. oeffnet ein echtes Windows-Fenster (ueber die Systemkomponente
   WebView2 - es wird KEIN Browser gestartet),
3. legt heruntergeladene Spiele unter `%LOCALAPPDATA%\Wolken\spiele` ab.

Es braucht **kein** installiertes Python und keinen fremden Server.

**Ohne .exe** (zum Entwickeln): Doppelklick auf `Wolken starten.bat`,
oder `python wolken.py`.

**Die .exe neu bauen**, wenn sich etwas geaendert hat:

```bash
python werkzeuge/exe_bauen.py
```

---

## Die zwei Betriebsarten

Der Launcher laeuft in zwei Umgebungen und merkt selbst, in welcher:

| | Programm-Modus | Browser-Modus |
|---|---|---|
| gestartet ueber | `Wolken.exe` | eine Webseite |
| Spiele liegen | als echte Dateien in `%LOCALAPPDATA%` | im Cache Storage des Browsers |
| erkennbar an | `/api/status` antwortet | tut es nicht |
| Fenster | eigenes, ohne Browser-Bedienelemente | normaler Browser-Tab |

Damit der Rest des Codes davon nichts wissen muss, gibt es in
`js/launcher.js` fuer beide Faelle ein Objekt mit denselben vier
Funktionen (`status`, `katalog`, `installieren`, `entfernen`). Beim Start
wird das passende eingesetzt. So etwas nennt man eine
**Abstraktionsschicht**.

## Aufbau

```
Wolken/
├── wolken.py               das Programm: Server, Fenster, Downloads
├── Wolken starten.bat      zum Doppelklicken ohne .exe
├── quelle.json             woher die Spiele kommen
├── index.html              Oberflaeche des Launchers
├── css/launcher.css
├── js/launcher.js
├── icons/
├── sw.js                   nur fuer den Browser-Modus
├── manifest.webmanifest    nur fuer den Browser-Modus
├── spiele.json             Katalog (erzeugt, nicht von Hand pflegen)
├── werkzeuge/
│   ├── katalog_bauen.py    baut spiele.json aus dem Ordner spiele/
│   └── exe_bauen.py        baut dist/Wolken.exe
├── spiele/                 die Originale ("Serverseite")
│   ├── schattenlabyrinth-3d/
│   └── schattenlabyrinth-2d/
└── dist/Wolken.exe         das fertige Programm
```

Installierte Spiele liegen **nicht** hier, sondern unter
`%LOCALAPPDATA%\Wolken\spiele` — dort darf ein Programm unter Windows
Daten ablegen, ohne Administratorrechte zu brauchen.

---

## Wie das Herunterladen funktioniert

Im **Programm-Modus** schreibt der Launcher richtige Dateien:

```
Klick auf "Herunterladen"
        │
        ▼
Oberflaeche  ──POST /api/installieren──▶  wolken.py
                                              │
                          fuer jede Datei:    │  aus dem Netz holen
                                              │  oder aus dem Ordner lesen
                                              ▼
                              %LOCALAPPDATA%\Wolken\spiele\<spiel>\n                                              │
                                              ▼
                              Version + Pruefsumme in installiert.json
```

Zwei Details, die wichtig sind:

- Der Download laeuft in einem **eigenen Thread**. Sonst wuerde das
  Fenster einfrieren, bis alles fertig ist. Die Oberflaeche fragt
  waehrenddessen regelmaessig `/api/fortschritt` ab.
- Geschrieben wird zuerst in einen Ordner `<spiel>.neu`, der erst am
  Ende umbenannt wird. Bricht der Download ab, bleibt die alte
  Fassung heil — man steht nie mit einem halben Spiel da.

Im **Browser-Modus** gibt es keine Festplatte, auf die man schreiben
darf. Dort uebernimmt die **Cache Storage API** die Rolle des Ordners,
und der **Service Worker** liefert die Dateien spaeter daraus aus.

---

## Wie Updates erkannt werden

Jedes Spiel hat eine Versionsnummer in seiner `info.json`. Beim Installieren
merkt sich der Launcher diese Nummer. Beim nächsten Start lädt er den
Katalog neu und vergleicht:

| Katalog | Installiert | Ergebnis |
|---|---|---|
| 1.0.0 | – | Herunterladen |
| 1.0.0 | 1.0.0 | Installiert |
| 1.1.0 | 1.0.0 | **Update verfügbar** |

Verglichen wird **nicht als Text**, sondern Zahl für Zahl. Als Text wäre
`"1.9.0"` größer als `"1.10.0"`, weil `9 > 1` ist — das wäre falsch.

Zusätzlich steht im Katalog eine **Prüfsumme** über alle Dateien. Ändert
man etwas am Spiel und vergisst, die Version hochzusetzen, fällt das
trotzdem auf.

---

## Eine neue Version veröffentlichen

1. Am Spiel etwas ändern
2. In `spiele/<spiel>/info.json` die `version` erhöhen
   (und `SPIEL_VERSION` im Code gleich mit — das Skript warnt sonst)
3. `neuerungen` eintragen
4. Katalog neu bauen:

```bash
python werkzeuge/katalog_bauen.py
```

Fertig. Der Launcher zeigt beim nächsten „Nach Updates suchen" das Update an.

---

## Ein neues Spiel hinzufügen

1. Ordner unter `spiele/` anlegen
2. `info.json` hineinlegen:

```json
{
  "name": "Mein Spiel",
  "kurz": "Ein Satz dazu",
  "beschreibung": "Längerer Text.",
  "version": "1.0.0",
  "start": "spiel.html",
  "farbe": "#4d7fd6",
  "genre": "Arcade"
}
```

3. `python werkzeuge/katalog_bauen.py`

Das Skript sammelt alle Dateien selbst ein. Man kann keine vergessen.

---

## Ins Internet stellen (GitHub Pages)

Damit andere den Launcher installieren können, muss er über **https**
erreichbar sein. GitHub Pages ist dafür kostenlos:

1. Auf github.com ein neues Repository anlegen
2. Den Inhalt des Ordners `Wolken/` hochladen
3. Unter *Settings → Pages* als Quelle den Branch `main` wählen
4. Nach ein paar Minuten liegt der Launcher unter
   `https://<name>.github.io/<repo>/`

Ein Update veröffentlichen heißt dann: Dateien ändern, `katalog_bauen.py`
laufen lassen, hochladen. Alle Nutzer sehen das Update beim nächsten Start.

---

## Getestet

**Als fertige Wolken.exe, ohne dass Python installiert sein muss:**

| Test | Ergebnis |
|---|---|
| Programm startet allein | eigener Server auf zufaelligem Port (z.B. 53126), nur auf 127.0.0.1 |
| Eigenes Fenster | echtes Fenster "Wolken Launcher", 0 Chrome-Prozesse, WebView2 |
| Beide Spiele installieren | 9 + 10 Dateien, 174 KB, wirklich auf der Festplatte |
| Spiel starten | wird aus `%LOCALAPPDATA%\Wolken\spiele` ausgeliefert |
| Quelle auf eine Adresse umstellen | ohne Neubau der .exe, nur `quelle.json` daneben legen |
| Katalog aus dem Netz | geladen, `online_quelle: true` |
| Update aus dem Netz | v1.1.1 installiert, v1.2.0 angeboten → erkannt |
| Update anwenden | 10 Dateien geladen, Datei auf der Platte enthaelt danach v1.2.0 |

**Im Browser-Modus (Service Worker):**

| Test | Ergebnis |
|---|---|
| Spiel herunterladen | 10/10 Dateien im Cache Storage |
| Update erkennen und anwenden | Cache und localStorage danach auf der neuen Version |
| Offline, Server gestoppt | installiertes Spiel startet vollstaendig |
| Offline, nicht installiert | 503 — nicht spielbar, wie gewollt |

### Zwei Fehler, die dabei aufgefallen sind

**1. Das Update aktualisierte sich mit sich selbst.**
Der erste Versuch meldete „Update erfolgreich", speicherte aber die
*alte* Datei. Der Service Worker fing auch die Download-Anfragen des
Launchers ab und beantwortete sie aus seinem eigenen Cache.
Loesung in `sw.js`: Anfragen mit `cache: 'reload'` laesst er durch.

**2. Die .exe waere beim Start abgestuerzt.**
Ohne Konsolenfenster ist `sys.stdout` gleich `None`. Ein normales
`print()` haette dann einen Fehler ausgeloest und das ganze Programm
mitgerissen — und zwar unsichtbar, weil es ja keine Konsole gibt.
Loesung in `wolken.py`: die Funktion `melde()` prueft erst, ob es
ueberhaupt eine Ausgabe gibt.

---

*Nimbus Games · Schulprojekt Informatik, 2026*
