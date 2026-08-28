"""
exe_bauen.py  -  Macht aus wolken.py eine fertige Wolken.exe

Aufrufen mit:

    python werkzeuge/exe_bauen.py

Danach liegt die fertige Datei unter  dist/Wolken.exe.
Sie enthaelt alles: Python selbst, die Oberflaeche und die Spiele.
Auf einem fremden Rechner muss nichts installiert sein.

Wie funktioniert das?
PyInstaller packt den Python-Interpreter, alle benoetigten Bibliotheken
und die mitgegebenen Dateien in eine einzige .exe. Beim Start entpackt
sie sich in einen temporaeren Ordner - dessen Pfad steht dann in
sys._MEIPASS, siehe programm_ordner() in wolken.py.

Vorher muss PyInstaller einmal installiert werden:

    pip install pyinstaller
"""

import os
import subprocess
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Diese Dateien und Ordner wandern mit in die .exe.
# Format unter Windows:  "Quelle;Ziel-innerhalb-der-exe"
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
        '--onefile',        # alles in EINE Datei
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

    print('Baue Wolken.exe ...\n')
    ergebnis = subprocess.run(befehl, cwd=WURZEL)

    if ergebnis.returncode != 0:
        print('\nDer Bau ist fehlgeschlagen.')
        return ergebnis.returncode

    exe = os.path.join(WURZEL, 'dist', 'Wolken.exe')
    if os.path.exists(exe):
        print('\nFertig: %s  (%.1f MB)' % (exe, os.path.getsize(exe) / 1024 / 1024))
        print('\nZum Weitergeben reicht diese eine Datei.')
        print('Wer Updates aus dem Netz will, legt zusaetzlich eine quelle.json daneben.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
