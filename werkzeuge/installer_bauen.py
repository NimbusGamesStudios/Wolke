"""
installer_bauen.py  -  Baut WolkenSetup.exe

Aufrufen mit:

    python werkzeuge/installer_bauen.py

Ergebnis:
    dist/WolkenSetup.exe

Das ist eine einzige Datei zum Weitergeben - genau wie SteamSetup.exe.
Wer sie doppelklickt, bekommt einen Installationsassistenten, danach ein
Startmenue-Symbol, auf Wunsch ein Desktopsymbol und einen Eintrag in
"Apps & Features" zum sauberen Deinstallieren.


VORAUSSETZUNG
-------------
Inno Setup muss installiert sein - kostenlos von

    https://jrsoftware.org/isdl.php

Das ist das Werkzeug, mit dem ein grosser Teil aller Windows-Installer
gebaut wird. Es bringt seinen eigenen Startcode mit, der millionenfach
im Umlauf ist. Deshalb schlagen Virenscanner darauf viel seltener an
als auf eine selbstgebaute Einzeldatei - genau das Problem, das wir
vorher mit PyInstaller hatten.


REIHENFOLGE
-----------
    python werkzeuge/katalog_bauen.py      Katalog auffrischen
    python werkzeuge/exe_bauen.py          Programmordner bauen
    python werkzeuge/installer_bauen.py    Installer daraus bauen
"""

import os
import subprocess
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Uebliche Orte, an denen der Inno-Setup-Uebersetzer liegt
MOEGLICHE_ORTE = [
    r'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    r'C:\Program Files\Inno Setup 6\ISCC.exe',
    r'C:\Program Files (x86)\Inno Setup 7\ISCC.exe',
    r'C:\Program Files\Inno Setup 7\ISCC.exe',
    r'C:\Program Files (x86)\Inno Setup 5\ISCC.exe',
    r'C:\Program Files\Inno Setup 5\ISCC.exe',
]


def uebersetzer_finden():
    """Sucht ISCC.exe - erst an den ueblichen Orten, dann im PATH."""
    for ort in MOEGLICHE_ORTE:
        if os.path.isfile(ort):
            return ort

    from shutil import which
    gefunden = which('iscc') or which('ISCC')
    if gefunden:
        return gefunden

    # Letzter Versuch: in den Programmordnern nachsehen. Vielleicht
    # wurde eine Version installiert, die oben nicht aufgelistet ist.
    for basis in (r'C:\Program Files', r'C:\Program Files (x86)'):
        if not os.path.isdir(basis):
            continue
        for eintrag in os.listdir(basis):
            if 'inno' in eintrag.lower():
                pfad = os.path.join(basis, eintrag, 'ISCC.exe')
                if os.path.isfile(pfad):
                    return pfad
    return None


def main():
    ordner = os.path.join(WURZEL, 'dist', 'Wolken')
    if not os.path.isdir(ordner):
        print('Der Programmordner dist/Wolken fehlt.')
        print('Vorher einmal  python werkzeuge/exe_bauen.py  laufen lassen.')
        return 1

    iscc = uebersetzer_finden()
    if not iscc:
        print('Inno Setup wurde nicht gefunden.')
        print('')
        print('Hol es dir kostenlos hier:')
        print('    https://jrsoftware.org/isdl.php')
        print('')
        print('Nimm die Datei "innosetup-6.x.x.exe", installiere sie mit')
        print('den Voreinstellungen und starte dieses Skript danach erneut.')
        return 1

    print('Inno Setup gefunden: %s' % iscc)
    print('Baue den Installer ...')
    print('')

    skript = os.path.join(WURZEL, 'werkzeuge', 'wolken.iss')
    ergebnis = subprocess.run([iscc, skript], cwd=os.path.join(WURZEL, 'werkzeuge'))

    if ergebnis.returncode != 0:
        print('')
        print('Der Bau ist fehlgeschlagen.')
        return ergebnis.returncode

    setup = os.path.join(WURZEL, 'dist', 'WolkenSetup.exe')
    if not os.path.exists(setup):
        print('')
        print('Der Installer wurde nicht erzeugt.')
        return 1

    print('')
    print('Installer: %s  (%.1f MB)' % (setup, os.path.getsize(setup) / 1024 / 1024))

    paket = ausweichpaket(setup)
    print('Ausweich:  %s  (%.1f MB)' % (paket, os.path.getsize(paket) / 1024 / 1024))
    print('')
    print('Weitergeben: WolkenSetup.exe. Kein Entpacken noetig.')
    return 0


def ausweichpaket(setup):
    """
    Packt den Installer zusaetzlich in ein ZIP.

    Manche Browser blockieren den Download einer .exe von einer
    Adresse, die sie noch nicht kennen ("Verdaechtiger Download
    blockiert"). Bei einem ZIP passiert das so gut wie nie. Wer also
    beim Herunterladen haengenbleibt, nimmt diese Fassung, entpackt
    sie einmal und startet den Installer daraus.
    """
    import zipfile
    ziel = os.path.join(os.path.dirname(setup), 'WolkenSetup.zip')
    if os.path.exists(ziel):
        os.remove(ziel)
    with zipfile.ZipFile(ziel, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(setup, 'WolkenSetup.exe')
    return ziel


if __name__ == '__main__':
    sys.exit(main())
