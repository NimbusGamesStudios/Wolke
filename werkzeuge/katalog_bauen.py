"""
katalog_bauen.py  -  Baut die Datei spiele.json fuer den Wolken Launcher

Warum ein Skript?
Der Launcher muss wissen, welche Spiele es gibt, welche Version sie haben
und aus welchen Dateien sie bestehen. Diese Liste von Hand zu pflegen waere
fehleranfaellig: vergisst man eine Datei, laedt der Launcher ein kaputtes
Spiel herunter.

Das Skript durchsucht deshalb den Ordner spiele/ und schreibt die Liste
automatisch. Aufrufen mit:

    python werkzeuge/katalog_bauen.py

Wenn du ein Spiel geaendert hast, erhoehe vorher die "version" in der
info.json des Spiels. Nur dann merkt der Launcher, dass es ein Update gibt.
"""

import json
import os
import re
import hashlib
from datetime import datetime, timezone

# Ordner, in dem dieses Skript liegt -> eine Ebene hoeher ist die Wurzel
WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPIELE_ORDNER = os.path.join(WURZEL, 'spiele')

# Diese Endungen gehoeren zum Spiel und werden mit heruntergeladen
ERLAUBTE_ENDUNGEN = {'.html', '.css', '.js', '.json', '.png', '.jpg', '.svg', '.webp'}

# Diese Dateien sind nur fuer die Entwicklung und kommen NICHT mit
IGNORIEREN = {'info.json'}


def dateien_sammeln(spiel_ordner):
    """Alle Spieldateien einsammeln, als Pfade relativ zum Spielordner."""
    gefunden = []
    for pfad, ordner, dateien in os.walk(spiel_ordner):
        # versteckte Ordner ueberspringen
        ordner[:] = [o for o in ordner if not o.startswith('.')]

        for datei in dateien:
            if datei in IGNORIEREN:
                continue
            if os.path.splitext(datei)[1].lower() not in ERLAUBTE_ENDUNGEN:
                continue

            ganz = os.path.join(pfad, datei)
            relativ = os.path.relpath(ganz, spiel_ordner).replace('\\', '/')
            gefunden.append(relativ)

    return sorted(gefunden)


def groesse_von(spiel_ordner, dateien):
    """Gesamtgroesse in Bytes."""
    return sum(os.path.getsize(os.path.join(spiel_ordner, d)) for d in dateien)


def pruefsumme(spiel_ordner, dateien):
    """
    Kurze Pruefsumme ueber alle Dateiinhalte.

    Damit kann der Launcher erkennen, ob sich wirklich etwas geaendert hat -
    auch dann, wenn jemand vergessen hat, die Versionsnummer zu erhoehen.
    """
    h = hashlib.sha256()
    for d in dateien:
        with open(os.path.join(spiel_ordner, d), 'rb') as f:
            h.update(d.encode('utf-8'))
            h.update(f.read())
    return h.hexdigest()[:16]


def version_pruefen(spiel_ordner, dateien, version, spiel_id):
    """
    Sucht im Spielcode nach einer Zeile wie

        const SPIEL_VERSION = '1.0.0';

    und warnt, wenn sie nicht zur Version in der info.json passt.

    Warum? Die Versionsnummer steht an zwei Stellen: in der info.json
    (die sieht der Launcher) und im Spiel selbst (die sieht der Spieler).
    Laufen die auseinander, zeigt das Spiel eine andere Version an als
    der Launcher - und niemand versteht mehr, was eigentlich installiert
    ist. Der Rechner kann das pruefen, also soll er es auch tun.
    """
    muster = re.compile(r"""SPIEL_VERSION\s*=\s*['"]([^'"]+)['"]""")

    for d in dateien:
        if not d.endswith('.js'):
            continue
        with open(os.path.join(spiel_ordner, d), encoding='utf-8') as f:
            treffer = muster.search(f.read())
        if treffer:
            if treffer.group(1) != version:
                print('  WARNUNG %s: info.json sagt %s, %s sagt %s'
                      % (spiel_id, version, d, treffer.group(1)))
            return


def main():
    spiele = []

    for eintrag in sorted(os.listdir(SPIELE_ORDNER)):
        spiel_ordner = os.path.join(SPIELE_ORDNER, eintrag)
        info_pfad = os.path.join(spiel_ordner, 'info.json')

        if not os.path.isdir(spiel_ordner):
            continue
        if not os.path.exists(info_pfad):
            print('  uebersprungen (keine info.json): ' + eintrag)
            continue

        with open(info_pfad, encoding='utf-8') as f:
            info = json.load(f)

        dateien = dateien_sammeln(spiel_ordner)
        if not dateien:
            print('  uebersprungen (keine Dateien): ' + eintrag)
            continue

        version_pruefen(spiel_ordner, dateien, info['version'], eintrag)

        spiel = {
            'id': eintrag,
            'name': info['name'],
            'kurz': info.get('kurz', ''),
            'beschreibung': info.get('beschreibung', ''),
            'version': info['version'],
            'genre': info.get('genre', ''),
            'farbe': info.get('farbe', '#4d7fd6'),
            'neuerungen': info.get('neuerungen', ''),
            'ordner': 'spiele/' + eintrag,
            'start': info.get('start', 'spiel.html'),
            'dateien': dateien,
            'groesse': groesse_von(spiel_ordner, dateien),
            'pruefsumme': pruefsumme(spiel_ordner, dateien),
            # Welche Titelbilder liegen bereit? Der Launcher zeigt sie
            # schon im Regal an - also bevor das Spiel installiert ist.
            'kapsel': 'kapsel.webp' in dateien,
            'banner': 'banner.webp' in dateien,
        }
        spiele.append(spiel)

        print('  %-26s v%-8s %3d Dateien  %6.1f KB'
              % (spiel['name'], spiel['version'], len(dateien), spiel['groesse'] / 1024))

    katalog = {
        'launcher': 'Wolken Launcher',
        'erstellt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'spiele': spiele,
    }

    ziel = os.path.join(WURZEL, 'spiele.json')
    with open(ziel, 'w', encoding='utf-8') as f:
        json.dump(katalog, f, indent=2, ensure_ascii=False)

    print('\nspiele.json geschrieben: %d Spiele' % len(spiele))


if __name__ == '__main__':
    main()
