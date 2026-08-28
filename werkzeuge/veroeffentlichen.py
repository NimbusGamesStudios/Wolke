"""
veroeffentlichen.py  -  Legt einen sauberen Ordner zum Hochladen an

Aufrufen mit:

    python werkzeuge/veroeffentlichen.py

Danach liegt neben dem Projekt ein Ordner  veroeffentlichen/  mit genau
den Dateien, die auf GitHub gehoeren. Den Inhalt zieht man im Browser in
das Repository - fertig.

Warum nicht einfach alles hochladen?
Beim Bauen der .exe entstehen Ordner wie build/ und Dateien wie
Wolken.spec. Die braucht niemand ausser dem eigenen Rechner, sie machen
das Repository nur unuebersichtlich und gross.
"""

import os
import shutil
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, 'veroeffentlichen')

# Diese Dateien und Ordner kommen mit - Ziel relativ zur Wurzel der Website
MITNEHMEN = [
    # Die Website selbst kommt an die WURZEL
    ('seite/index.html',  'index.html'),
    ('seite/css',         'css'),
    ('seite/bilder',      'bilder'),
    ('seite/js',          'js'),

    # Der Katalog und die Spieldateien - die laedt der Launcher herunter
    ('spiele.json',       'spiele.json'),
    ('spiele',            'spiele'),

    # Quelltext, damit man das Projekt auf GitHub auch lesen kann
    ('README.md',         'README.md'),
    ('wolken.py',         'wolken.py'),
    ('werkzeuge',         'werkzeuge'),
]

# Absichtlich NICHT dabei:
#   index.html, js/launcher.js, css/launcher.css, sw.js, manifest.webmanifest
# Das ist die Browser-Fassung des Launchers. Das Spiel soll ueber das
# Programm laufen, nicht im Browser - also gibt es dafuer auch keinen
# Einstieg auf der Website.

# Beim Bauen entstehender Muell, der nie mitkommt
AUSLASSEN = {'build', 'dist', 'veroeffentlichen', '__pycache__', '.git', 'download'}


def ordner_kopieren(quelle, ziel):
    """Kopiert einen Ordner und laesst dabei Muell aus."""
    os.makedirs(ziel, exist_ok=True)
    for eintrag in os.listdir(quelle):
        if eintrag in AUSLASSEN or eintrag.endswith('.spec'):
            continue

        von = os.path.join(quelle, eintrag)
        nach = os.path.join(ziel, eintrag)

        if os.path.isdir(von):
            ordner_kopieren(von, nach)
        else:
            shutil.copy2(von, nach)


def zaehle(pfad):
    anzahl = groesse = 0
    for ordner, _, dateien in os.walk(pfad):
        for d in dateien:
            anzahl += 1
            groesse += os.path.getsize(os.path.join(ordner, d))
    return anzahl, groesse


def main():
    if os.path.isdir(ZIEL):
        shutil.rmtree(ZIEL)
    os.makedirs(ZIEL)

    for quelle, ziel in MITNEHMEN:
        von = os.path.join(WURZEL, quelle.replace('/', os.sep))
        nach = os.path.join(ZIEL, ziel.replace('/', os.sep))

        if not os.path.exists(von):
            print('  fehlt (uebersprungen): ' + quelle)
            continue

        if os.path.isdir(von):
            ordner_kopieren(von, nach)
        else:
            os.makedirs(os.path.dirname(nach) or ZIEL, exist_ok=True)
            shutil.copy2(von, nach)

        if quelle == ziel:
            print('  mitgenommen: ' + quelle)
        else:
            print('  mitgenommen: %s  ->  %s' % (quelle, ziel))

    # Der Installer ist der Hauptdownload - eine Datei, kein Entpacken.
    # Das ZIP daneben ist nur die Rueckfallebene, falls ein Browser den
    # .exe-Download blockiert.
    os.makedirs(os.path.join(ZIEL, 'download'), exist_ok=True)
    fehlt = []

    for name in ('WolkenSetup.exe', 'WolkenSetup.zip'):
        quelle = os.path.join(WURZEL, 'dist', name)
        if os.path.exists(quelle):
            shutil.copy2(quelle, os.path.join(ZIEL, 'download', name))
            print('  mitgenommen: dist/%s  ->  download/%s' % (name, name))
        else:
            fehlt.append(name)

    if fehlt:
        print('  Hinweis: %s fehlt - vorher werkzeuge/installer_bauen.py laufen lassen'
              % ', '.join(fehlt))

    # GitHub Pages laesst sonst Ordner aus, die mit _ anfangen.
    # Bei uns gibt es keine, aber die Datei schadet nie und erspart
    # spaeter stundenlange Fehlersuche.
    with open(os.path.join(ZIEL, '.nojekyll'), 'w', encoding='utf-8') as f:
        f.write('')

    anzahl, groesse = zaehle(ZIEL)
    print('\nFertig: %s' % ZIEL)
    print('%d Dateien, %.1f MB' % (anzahl, groesse / 1024 / 1024))
    print('\nDen INHALT dieses Ordners auf GitHub hochladen.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
