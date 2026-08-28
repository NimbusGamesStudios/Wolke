; ============================================================
;  wolken.iss  -  Bauplan fuer WolkenSetup.exe
; ------------------------------------------------------------
;  Das hier ist die Anleitung fuer Inno Setup. Daraus entsteht
;  eine einzige Datei WolkenSetup.exe, die sich genauso verhaelt
;  wie SteamSetup.exe oder der Installer von Epic Games:
;
;    - Doppelklick, ein paar Mal Weiter, fertig
;    - legt das Programm in einen festen Ordner
;    - erstellt Startmenue-Eintrag und (optional) Desktopsymbol
;    - traegt sich in "Apps & Features" ein, samt Deinstallation
;
;  Gebaut wird es mit:
;      python werkzeuge/installer_bauen.py
;
;  Vorher muss  python werkzeuge/exe_bauen.py  gelaufen sein,
;  denn der Installer packt den Ordner dist\Wolken ein.
; ============================================================

#define Name       "Wolken Launcher"
#define Version    "1.0.0"
#define Studio     "Nimbus Games"
#define Adresse    "https://nimbusgamesstudios.github.io/Wolke/"
#define Programm   "Wolken.exe"

[Setup]
AppId={{9E2F4C31-77A5-4B18-9C6E-2A1D3F8B5470}
AppName={#Name}
AppVersion={#Version}
AppVerName={#Name} {#Version}
AppPublisher={#Studio}
AppPublisherURL={#Adresse}
AppSupportURL={#Adresse}

; ---- Ohne Administratorrechte installieren ----
; So kommt kein blaues UAC-Fenster, und es funktioniert auch auf
; Schulrechnern, auf denen man keine Adminrechte hat.
PrivilegesRequired=lowest
DefaultDirName={autopf}\Wolken
DefaultGroupName={#Studio}
DisableProgramGroupPage=yes

; ---- Aussehen ----
WizardStyle=modern
SetupIconFile=..\icons\wolken.ico
UninstallDisplayIcon={app}\{#Programm}
UninstallDisplayName={#Name}

; ---- Ausgabe ----
OutputDir=..\dist
OutputBaseFilename=WolkenSetup
Compression=lzma2/max
SolidCompression=yes

; ---- Sprache der Meldungen ----
ShowLanguageDialog=no

[Languages]
Name: "deutsch"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopsymbol"; Description: "Verknuepfung auf dem Desktop anlegen"; \
    GroupDescription: "Zusaetzliche Symbole:"

[Files]
; Der ganze Programmordner wandert mit hinein.
; recursesubdirs sorgt dafuer, dass auch _internal mitkommt -
; ohne diesen Unterordner startet das Programm nicht.
Source: "..\dist\Wolken\*"; DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#Name}"; Filename: "{app}\{#Programm}"
Name: "{group}\{#Name} deinstallieren"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#Name}"; Filename: "{app}\{#Programm}"; Tasks: desktopsymbol

[Run]
; Nach der Installation gleich starten - wie bei Steam
Filename: "{app}\{#Programm}"; Description: "{#Name} jetzt starten"; \
    Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Beim Deinstallieren auch die heruntergeladenen Spiele wegraeumen.
; Sie liegen nicht im Programmordner, sondern unter LOCALAPPDATA.
Type: filesandordirs; Name: "{localappdata}\Wolken"
