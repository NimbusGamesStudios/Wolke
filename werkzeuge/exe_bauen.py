"""
exe_bauen.py  -  Macht aus wolken.py ein fertiges Programm

Aufrufen mit:

    python werkzeuge/exe_bauen.py

Ergebnis:
    dist/Wolken/               der Programmordner
    dist/Wolken-Launcher.zip   das Paket zum Weitergeben

Vorher muss PyInstaller einmal installiert werden:

    pip install pyinstaller


WARUM EIN ORDNER UND KEINE EINZELNE DATEI?
------------------------------------------
PyInstaller kann beides: --onefile packt alles in eine einzige .exe,
--onedir legt die .exe zusammen mit ihren Bausteinen in einen Ordner.

Eine einzelne Datei waere bequemer - aber sie entpackt sich beim Start
selbst in einen temporaeren Ordner. Genau dieses Verhalten zeigen auch
Trojaner, die ihre Schadsoftware nachladen. Virenscanner erkennen das
per Mustererkennung und melden einen Fund, obwohl nichts passiert ist.

Bei uns war es Windows Defender mit "Trojan:Win32/Wacatac.B!ml". Das
Kuerzel "!ml" steht fuer machine learning: eine Vermutung des Scanners,
kein echter Fund. Trotzdem wurde der Download blockiert.

Mit --onedir passiert das nicht, weil nichts entpackt werden muss.
Nachgemessen mit demselben Code:
    als eine Datei -> "found 1 threats"
    als Ordner     -> "found no threats"

Der Ordner wandert am Ende sowieso in ein ZIP - fuer den Nutzer bleibt
es also ein einziger Download.
"""

import os
import subprocess
import sys
import zipfile

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Diese Dateien und Ordner wandern mit ins Programm
MITGEBEN = [
    ('index.html', '.'),
    ('spiele.json', '.'),
    ('quelle.json', '.'),
    ('css', 'css'),
    ('js', 'js'),
    ('icons', 'icons'),
    ('spiele', 'spiele'),
]


def main():
    fehlend = [q for q, _ in MITGEBEN if not os.path.exists(os.path.join(WURZEL, q))]
    if fehlend:
        print('Diese Dateien fehlen: ' + ', '.join(fehlend))
        print('Vorher einmal  python werkzeuge/katalog_bauen.py  laufen lassen.')
        return 1

    trenner = ';' if os.name == 'nt' else ':'

    befehl = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm',
        '--clean',
        '--onedir',         # Ordner statt Einzeldatei, siehe oben
        '--noconsole',      # kein schwarzes Konsolenfenster
        '--name', 'Wolken',
        '--icon', os.path.join('icons', 'wolken.ico'),

        # pywebview laedt seine Windows-Anbindung erst zur Laufzeit nach.
        # PyInstaller sieht das nicht von allein - deshalb sagen wir es ihm.
        '--collect-all', 'webview',
        '--collect-all', 'clr_loader',
        '--collect-all', 'pythonnet',
        '--hidden-import', 'webview.platforms.winforms',
    ]

    for quelle, ziel in MITGEBEN:
        befehl += ['--add-data', quelle + trenner + ziel]

    befehl.append('wolken.py')

    print('Baue den Programmordner ...')
    print('')
    ergebnis = subprocess.run(befehl, cwd=WURZEL)

    if ergebnis.returncode != 0:
        print('')
        print('Der Bau ist fehlgeschlagen.')
        return ergebnis.returncode

    ordner = os.path.join(WURZEL, 'dist', 'Wolken')
    if not os.path.isdir(ordner):
        print('')
        print('Der Programmordner wurde nicht erzeugt.')
        return 1

    print('')
    print('Programm: %s  (%.1f MB)' % (ordner, ordnergroesse(ordner) / 1024 / 1024))

    paket = paket_bauen(ordner)
    print('Paket:    %s  (%.1f MB)' % (paket, os.path.getsize(paket) / 1024 / 1024))
    print('')
    print('Weitergegeben wird das ZIP.')
    return 0


def ordnergroesse(pfad):
    gesamt = 0
    for wurzel, _, dateien in os.walk(pfad):
        for d in dateien:
            gesamt += os.path.getsize(os.path.join(wurzel, d))
    return gesamt


def paket_bauen(ordner):
    """
    Packt den ganzen Programmordner in ein ZIP - mitsamt Kurzanleitung.

    Im ZIP liegt oben ein Ordner "Wolken". Wer ihn auspackt, hat alles
    beisammen und startet darin die Wolken.exe.
    """
    dist = os.path.dirname(ordner)
    ziel = os.path.join(dist, 'Wolken-Launcher.zip')
    liesmich = os.path.join(WURZEL, 'werkzeuge', 'LIESMICH.txt')

    if os.path.exists(ziel):
        os.remove(ziel)

    with zipfile.ZipFile(ziel, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for wurzel, _, dateien in os.walk(ordner):
            for d in dateien:
                voll = os.path.join(wurzel, d)
                # Pfad im ZIP: "Wolken/..." statt des ganzen Festplattenpfads
                drin = os.path.join('Wolken', os.path.relpath(voll, ordner))
                z.write(voll, drin)

        if os.path.exists(liesmich):
            z.write(liesmich, 'LIESMICH.txt')

    return ziel


if __name__ == '__main__':
    sys.exit(main())
