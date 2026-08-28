"""
wolken.py  -  Der Wolken Launcher als eigenstaendiges Programm
===============================================================

Das hier ist kein Webseiten-Projekt mehr, sondern ein richtiges Programm,
das man doppelklickt. Es besteht aus drei Teilen:

    1. EIN EIGENER SERVER
       Beim Start sucht das Programm einen freien Port und startet darauf
       einen kleinen Webserver - aber nur auf 127.0.0.1, also nur auf
       diesem Rechner. Von aussen ist da nichts erreichbar.

    2. EIN EIGENES FENSTER
       Danach oeffnet es ein echtes Windows-Fenster und blendet darin
       die Oberflaeche ein. Dafuer wird WebView2 benutzt - eine
       Anzeigekomponente, die bei Windows 10 und 11 fest dabei ist.
       Es wird also KEIN Browser gestartet: kein Chrome-Fenster, kein
       Chrome-Prozess, keine Adressleiste. Im Taskmanager steht nur
       "Wolken.exe".

       Warum ueberhaupt eine Anzeigekomponente? Weil die Spiele selbst
       in HTML und JavaScript geschrieben sind. Irgendetwas muss das
       darstellen. Genauso arbeiten Discord, Spotify und VS Code.

    3. EINE SCHNITTSTELLE (API)
       Die Oberflaeche im Fenster kann dem Programm Auftraege geben:
       "installiere Spiel X", "loesche Spiel Y". Das Programm kopiert
       bzw. laedt dann die Dateien und legt sie WIRKLICH auf die
       Festplatte - man kann sie im Explorer ansehen.

Warum ueberhaupt ein Server, wenn alles auf einem Rechner laeuft?
Weil die Oberflaeche in HTML geschrieben ist und ein Browser HTML nur
sinnvoll ueber http anzeigt. Der Server ist also nur die Bruecke zwischen
Programm und Fenster. Genau so arbeiten auch grosse Programme wie
Discord, Spotify oder Visual Studio Code.

Gebraucht wird nur Python selbst - keine zusaetzlichen Pakete.
"""

import json
import os
import shutil
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = '1.0.0'


def melde(text):
    """
    Gibt Text aus - aber nur, wenn es ueberhaupt eine Ausgabe gibt.

    Als fertige .exe laeuft das Programm ohne Konsolenfenster. Dann ist
    sys.stdout None, und ein normales print() wuerde einen Fehler
    ausloesen und das ganze Programm abschiessen.
    """
    try:
        if sys.stdout is not None:
            print(text)
    except Exception:
        pass


# ============================================================
#  ORDNER FINDEN
# ============================================================

def programm_ordner():
    """
    Wo liegen die mitgelieferten Dateien (Oberflaeche, Spiele)?

    Achtung: Wenn PyInstaller daraus eine .exe gemacht hat, packt es
    alle Dateien beim Start in einen temporaeren Ordner aus. Dessen
    Pfad steht dann in sys._MEIPASS.
    """
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def daten_ordner():
    """
    Wohin werden Spiele installiert?

    Unter Windows ist der richtige Ort dafuer LOCALAPPDATA - dort duerfen
    Programme Daten ablegen, ohne Administratorrechte zu brauchen.
    Typisch: C:\\Users\\<name>\\AppData\\Local\\Wolken
    """
    basis = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    ordner = os.path.join(basis, 'Wolken')
    os.makedirs(os.path.join(ordner, 'spiele'), exist_ok=True)
    return ordner


PROGRAMM = programm_ordner()
DATEN = daten_ordner()
SPIELE_ZIEL = os.path.join(DATEN, 'spiele')
INSTALLIERT_DATEI = os.path.join(DATEN, 'installiert.json')


# ============================================================
#  QUELLE:  Woher kommen die Spiele?
# ============================================================

def quelle_lesen():
    """
    Liest quelle.json. Dort steht, woher der Launcher Spiele bezieht:

      - eine Internetadresse  -> echte Downloads (z.B. GitHub Pages)
      - "mitgeliefert"        -> aus dem Ordner neben dem Programm

    So kann derselbe Launcher offline funktionieren und trotzdem spaeter
    Spiele aus dem Netz nachladen, ohne dass man ihn neu bauen muss.
    """
    # Zuerst NEBEN dem Programm nachsehen. Nur so kann man die Adresse
    # spaeter aendern, ohne die .exe neu bauen zu muessen. Erst danach
    # die mitgelieferte Fassung nehmen.
    orte = []
    if getattr(sys, 'frozen', False):
        orte.append(os.path.dirname(sys.executable))
    orte.append(PROGRAMM)

    for ort in orte:
        try:
            with open(os.path.join(ort, 'quelle.json'), encoding='utf-8') as f:
                quelle = json.load(f).get('quelle')
                if quelle:
                    return quelle
        except (OSError, ValueError):
            continue

    return 'mitgeliefert'


QUELLE = quelle_lesen()
IST_ONLINE_QUELLE = QUELLE.startswith('http://') or QUELLE.startswith('https://')


def katalog_holen():
    """Holt spiele.json - aus dem Netz oder von der Festplatte."""
    if IST_ONLINE_QUELLE:
        adresse = QUELLE.rstrip('/') + '/spiele.json'
        with urllib.request.urlopen(adresse, timeout=15) as antwort:
            return json.loads(antwort.read().decode('utf-8'))

    with open(os.path.join(PROGRAMM, 'spiele.json'), encoding='utf-8') as f:
        return json.load(f)


def datei_holen(relativer_pfad):
    """
    Holt EINE Spieldatei als Bytes - aus dem Netz oder von der Platte.
    Der Rest des Programms muss nicht wissen, woher sie kommt.
    """
    if IST_ONLINE_QUELLE:
        adresse = QUELLE.rstrip('/') + '/' + relativer_pfad.replace('\\', '/')
        with urllib.request.urlopen(adresse, timeout=30) as antwort:
            return antwort.read()

    with open(os.path.join(PROGRAMM, relativer_pfad), 'rb') as f:
        return f.read()


# ============================================================
#  INSTALLATIONSVERWALTUNG
# ============================================================

def installiert_lesen():
    try:
        with open(INSTALLIERT_DATEI, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def installiert_schreiben(daten):
    with open(INSTALLIERT_DATEI, 'w', encoding='utf-8') as f:
        json.dump(daten, f, indent=2, ensure_ascii=False)


# Fortschritt laufender Installationen.
# Die Oberflaeche fragt ihn regelmaessig ab, waehrend im Hintergrund
# heruntergeladen wird.
fortschritt = {}
fortschritt_sperre = threading.Lock()


def fortschritt_setzen(spiel_id, **werte):
    with fortschritt_sperre:
        eintrag = fortschritt.setdefault(spiel_id, {})
        eintrag.update(werte)


def spiel_installieren(spiel):
    """
    Laedt alle Dateien eines Spiels und legt sie auf die Festplatte.
    Laeuft in einem eigenen Thread, damit das Fenster nicht einfriert.
    """
    spiel_id = spiel['id']
    ziel = os.path.join(SPIELE_ZIEL, spiel_id)

    try:
        fortschritt_setzen(spiel_id, laeuft=True, fertig=0,
                           gesamt=len(spiel['dateien']), datei='', fehler=None)

        # In einen Nebenordner schreiben und erst am Ende umbenennen.
        # Bricht der Download ab, bleibt die alte Fassung heil.
        temp = ziel + '.neu'
        if os.path.isdir(temp):
            shutil.rmtree(temp)
        os.makedirs(temp, exist_ok=True)

        for nummer, datei in enumerate(spiel['dateien'], start=1):
            inhalt = datei_holen(spiel['ordner'] + '/' + datei)

            zieldatei = os.path.join(temp, datei.replace('/', os.sep))
            os.makedirs(os.path.dirname(zieldatei), exist_ok=True)
            with open(zieldatei, 'wb') as f:
                f.write(inhalt)

            fortschritt_setzen(spiel_id, fertig=nummer, datei=datei)

        # Altes durch neues ersetzen
        if os.path.isdir(ziel):
            shutil.rmtree(ziel)
        os.rename(temp, ziel)

        daten = installiert_lesen()
        daten[spiel_id] = {
            'version': spiel['version'],
            'pruefsumme': spiel.get('pruefsumme', ''),
            'groesse': spiel.get('groesse', 0),
            'start': spiel.get('start', 'spiel.html'),
            'datum': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'pfad': ziel,
        }
        installiert_schreiben(daten)

        fortschritt_setzen(spiel_id, laeuft=False, fertig=len(spiel['dateien']))

    except Exception as fehler:
        fortschritt_setzen(spiel_id, laeuft=False, fehler=str(fehler))


def spiel_entfernen(spiel_id):
    ziel = os.path.join(SPIELE_ZIEL, spiel_id)
    if os.path.isdir(ziel):
        shutil.rmtree(ziel)

    daten = installiert_lesen()
    daten.pop(spiel_id, None)
    installiert_schreiben(daten)


def belegter_platz():
    gesamt = 0
    for pfad, _, dateien in os.walk(SPIELE_ZIEL):
        for d in dateien:
            try:
                gesamt += os.path.getsize(os.path.join(pfad, d))
            except OSError:
                pass
    return gesamt


# ============================================================
#  DER SERVER
# ============================================================

TYPEN = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
}


class Bediener(BaseHTTPRequestHandler):

    # Die Standardausgabe des Servers wuerde nur stoeren
    def log_message(self, *args):
        pass

    # ---------- Hilfsfunktionen ----------
    def antworte_json(self, daten, status=200):
        koerper = json.dumps(daten, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(koerper)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(koerper)

    def antworte_datei(self, pfad):
        if not os.path.isfile(pfad):
            self.send_error(404, 'Nicht gefunden')
            return

        endung = os.path.splitext(pfad)[1].lower()
        with open(pfad, 'rb') as f:
            inhalt = f.read()

        self.send_response(200)
        self.send_header('Content-Type', TYPEN.get(endung, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(inhalt)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(inhalt)

    def sicherer_pfad(self, basis, angefragt):
        """
        Verhindert, dass jemand ueber ../.. aus dem Ordner ausbricht.
        Auch wenn hier nur der eigene Rechner zugreift: so etwas baut
        man sich gar nicht erst ein.
        """
        ziel = os.path.normpath(os.path.join(basis, angefragt.lstrip('/')))
        if not ziel.startswith(os.path.normpath(basis)):
            return None
        return ziel

    # ---------- GET ----------
    def do_GET(self):
        pfad = self.path.split('?')[0]

        # ---- Schnittstelle ----
        if pfad.startswith('/api/'):
            self.api(pfad)
            return

        # ---- Installierte Spiele von der Festplatte ----
        if pfad.startswith('/spiele/'):
            ziel = self.sicherer_pfad(SPIELE_ZIEL, pfad[len('/spiele/'):])
            if ziel:
                self.antworte_datei(ziel)
            else:
                self.send_error(403, 'Nicht erlaubt')
            return

        # ---- Oberflaeche des Launchers ----
        if pfad == '/':
            pfad = '/index.html'
        ziel = self.sicherer_pfad(PROGRAMM, pfad)
        if ziel:
            self.antworte_datei(ziel)
        else:
            self.send_error(403, 'Nicht erlaubt')

    # ---------- POST ----------
    def do_POST(self):
        pfad = self.path.split('?')[0]
        laenge = int(self.headers.get('Content-Length') or 0)
        roh = self.rfile.read(laenge) if laenge else b'{}'

        try:
            daten = json.loads(roh.decode('utf-8'))
        except ValueError:
            daten = {}

        if pfad == '/api/installieren':
            spiel = daten.get('spiel')
            if not spiel:
                self.antworte_json({'fehler': 'kein Spiel angegeben'}, 400)
                return
            # Im Hintergrund laufen lassen, damit die Antwort sofort kommt
            threading.Thread(target=spiel_installieren, args=(spiel,), daemon=True).start()
            self.antworte_json({'gestartet': True})
            return

        if pfad == '/api/entfernen':
            spiel_entfernen(daten.get('id', ''))
            self.antworte_json({'ok': True})
            return

        if pfad == '/api/beenden':
            self.antworte_json({'ok': True})
            threading.Thread(target=beenden, daemon=True).start()
            return

        self.send_error(404, 'Unbekannter Befehl')

    # ---------- Die einzelnen API-Punkte ----------
    def api(self, pfad):
        if pfad == '/api/status':
            self.antworte_json({
                'launcher': 'Wolken Launcher',
                'version': VERSION,
                'modus': 'programm',
                'quelle': QUELLE,
                'online_quelle': IST_ONLINE_QUELLE,
                'datenordner': DATEN,
                'installiert': installiert_lesen(),
                'belegt': belegter_platz(),
            })
            return

        if pfad == '/api/katalog':
            try:
                self.antworte_json(katalog_holen())
            except (OSError, urllib.error.URLError, ValueError) as fehler:
                self.antworte_json({'fehler': str(fehler)}, 503)
            return

        if pfad == '/api/fortschritt':
            with fortschritt_sperre:
                self.antworte_json(dict(fortschritt))
            return

        if pfad == '/api/ordner-oeffnen':
            # Zeigt dem Nutzer, dass die Spiele wirklich als Dateien da sind
            try:
                os.startfile(SPIELE_ZIEL)
                self.antworte_json({'ok': True})
            except Exception as fehler:
                self.antworte_json({'fehler': str(fehler)}, 500)
            return

        self.send_error(404, 'Unbekannter Endpunkt')


# ============================================================
#  FENSTER OEFFNEN
# ============================================================

def fenster_zeigen(adresse):
    """
    Oeffnet das Programmfenster. Diese Funktion kehrt erst zurueck,
    wenn der Nutzer das Fenster schliesst.

    Erste Wahl ist WebView2 ueber pywebview: ein normales Windows-
    Fenster mit eigenem Symbol und eigenem Eintrag in der Taskleiste.

    Klappt das nicht (fehlende Komponente, sehr altes Windows), gibt es
    zwei Rueckfallebenen, damit das Programm nie einfach nichts tut.
    """
    try:
        import webview
    except ImportError:
        melde('  WebView2 nicht verfuegbar - weiche auf den Browser aus')
        return notfall_fenster(adresse)

    try:
        webview.create_window(
            'Wolken Launcher',
            adresse,
            width=1280,
            height=860,
            min_size=(900, 600),
            background_color='#0d1221',
        )
        # start() blockiert, bis das Fenster geschlossen wird.
        # Es MUSS im Haupt-Thread laufen - deshalb laeuft der Server
        # nebenher in einem eigenen Thread und nicht umgekehrt.
        webview.start(gui='edgechromium')
        return True

    except Exception as fehler:
        melde('  Fenster konnte nicht geoeffnet werden: %s' % fehler)
        return notfall_fenster(adresse)


def notfall_fenster(adresse):
    """
    Rueckfallebene: Wenn kein eigenes Fenster moeglich ist, oeffnen wir
    die Oberflaeche eben im Standardbrowser. Besser als gar nichts.
    """
    import webbrowser
    webbrowser.open(adresse)

    # Ohne eigenes Fenster wissen wir nicht, wann der Nutzer fertig ist.
    # Also laufen lassen, bis das Programm beendet wird.
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    return False


# ============================================================
#  START UND ENDE
# ============================================================

server = None


def freier_port():
    """Fragt das Betriebssystem nach einem gerade freien Port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def beenden():
    if server:
        server.shutdown()


def main():
    global server

    # Fuer Tests kann ein fester Port vorgegeben werden: --port 8130
    if '--port' in sys.argv:
        port = int(sys.argv[sys.argv.index('--port') + 1])
    else:
        port = freier_port()
    adresse = 'http://127.0.0.1:%d/' % port

    # ThreadingHTTPServer: bedient mehrere Anfragen gleichzeitig.
    # Ohne das wuerde die Oberflaeche haengen, waehrend im Hintergrund
    # ein Spiel heruntergeladen wird.
    server = ThreadingHTTPServer(('127.0.0.1', port), Bediener)

    threading.Thread(target=server.serve_forever, daemon=True).start()

    melde('Wolken Launcher %s' % VERSION)
    melde('  Fenster:      %s' % adresse)
    melde('  Spiele unter: %s' % SPIELE_ZIEL)
    melde('  Quelle:       %s' % QUELLE)

    # Mit --kein-fenster laeuft nur der Server. Praktisch zum Testen
    # und um die Schnittstelle von aussen anzusehen.
    if '--kein-fenster' in sys.argv:
        melde('  (nur Server, kein Fenster - mit Strg+C beenden)')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            beenden()
        return

    # Fenster oeffnen. Das blockiert, bis der Nutzer es schliesst.
    try:
        fenster_zeigen(adresse)
    finally:
        beenden()


if __name__ == '__main__':
    main()
