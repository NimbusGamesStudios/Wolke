"""
bilder_aufnehmen.py  -  Screenshots direkt aus dem laufenden Spiel holen

Fuer die Website braucht man Bilder aus dem Spiel. Man koennte sie mit
der Druck-Taste abfotografieren - dabei kommen aber Fensterrahmen,
Mauszeiger und falsche Groessen mit ins Bild.

Besser: Das Spiel zeichnet ohnehin auf ein <canvas>. Ein Canvas kann
sich selbst als Bild ausgeben (toDataURL). Dieses Skript startet einen
kleinen Server, der zwei Dinge kann:

    1. das Spiel ausliefern
    2. Bilder entgegennehmen und auf die Festplatte schreiben

Im Spiel ruft man dann im Browser auf:

    bildSpeichern('gang')

und schon liegt bilder/gang.png im Projekt - pixelgenau, ohne Rahmen.

Aufrufen mit:
    python werkzeuge/bilder_aufnehmen.py
Danach im Browser http://127.0.0.1:8160/spiele/schattenlabyrinth-3d/spiel.html
oeffnen.
"""

import base64
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BILDER = os.path.join(WURZEL, 'bilder')

PORT = 8160


class Bediener(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WURZEL, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        # Damit die Seite das Bild auch von woanders her schicken darf
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith('/speichern'):
            self.send_error(404)
            return

        laenge = int(self.headers.get('Content-Length') or 0)
        daten = json.loads(self.rfile.read(laenge).decode('utf-8'))

        name = ''.join(c for c in daten.get('name', 'bild')
                       if c.isalnum() or c in '-_')
        bild = daten.get('bild', '')

        # Aus "data:image/png;base64,AAAA..." nur den hinteren Teil nehmen
        if ',' in bild:
            bild = bild.split(',', 1)[1]

        os.makedirs(BILDER, exist_ok=True)
        ziel = os.path.join(BILDER, name + '.png')
        with open(ziel, 'wb') as f:
            f.write(base64.b64decode(bild))

        groesse = os.path.getsize(ziel)
        print('  gespeichert: bilder/%s.png  (%.0f KB)' % (name, groesse / 1024))

        antwort = json.dumps({'ok': True, 'datei': name + '.png', 'bytes': groesse})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(antwort.encode('utf-8'))


def main():
    os.makedirs(BILDER, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Bediener)
    print('Aufnahme-Server laeuft auf http://127.0.0.1:%d/' % PORT)
    print('Bilder landen in: %s' % BILDER)
    print('Beenden mit Strg+C')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    sys.exit(main())
