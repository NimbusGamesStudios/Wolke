"""
cover_bauen.py  -  Erzeugt die Titelbilder fuer den Launcher

Aufrufen mit:

    python werkzeuge/cover_bauen.py

Grosse Launcher zeigen jedes Spiel mit zwei Bildern:

    Kapsel  (hochkant, 600x900)   in der Bibliothek und im Regal
    Banner  (breit, 1600x520)     gross oben auf der Startseite

Beide werden hier aus einem Screenshot des Spiels gebaut. Der
Screenshot ist absichtlich fast schwarz - im Spiel sieht man ihn ja
nur im Lichtkegel. Fuer ein Titelbild muss er aufgehellt werden,
sonst erkennt man nichts.

Ablauf pro Bild:
    1. passenden Ausschnitt waehlen und auf Format bringen
    2. aufhellen
    3. dunklen Verlauf darueberlegen, damit die Schrift lesbar wird
    4. Titel setzen

Ergebnis landet direkt im jeweiligen Spielordner, damit der Katalog
es mitnimmt und der Launcher es herunterladen kann.
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageFont

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BILDER = os.path.join(WURZEL, 'bilder')

SCHRIFT_NORMAL = r'C:\Windows\Fonts\segoeui.ttf'
SCHRIFT_FETT   = r'C:\Windows\Fonts\segoeuib.ttf'

# Welches Spiel bekommt welchen Screenshot und welchen Text
SPIELE = [
    {
        'id': 'schattenlabyrinth-3d',
        'quelle': 'monster.webp',
        'quelle_banner': 'gang.webp',
        'zeile1': 'SCHATTEN',
        'zeile2': 'LABYRINTH',
        'kennung': '3D',
        'spruch': 'Finde die Schluessel. Finde den Ausgang.',
        'helligkeit': 2.6,
    },
    {
        'id': 'schattenlabyrinth-2d',
        'quelle': 'zwei-d.png',
        'quelle_banner': 'zwei-d.png',
        'zeile1': 'SCHATTEN',
        'zeile2': 'LABYRINTH',
        'kennung': '2D',
        'spruch': 'Die Draufsicht. Echte Schatten um jede Ecke.',
        'helligkeit': 2.0,
    },
]


def schrift(pfad, groesse):
    try:
        return ImageFont.truetype(pfad, groesse)
    except OSError:
        return ImageFont.load_default()


def zuschneiden(bild, breite, hoehe, fokus=0.5):
    """
    Bringt ein Bild auf das gewuenschte Format, ohne es zu verzerren.

    Es wird so weit vergroessert, dass es das Ziel ganz ausfuellt, und
    der Ueberstand wird abgeschnitten. fokus sagt, welcher Teil der
    Hoehe stehen bleiben soll (0 = oben, 1 = unten).
    """
    ziel = breite / hoehe
    ist = bild.width / bild.height

    if ist > ziel:
        # Quelle ist breiter -> links und rechts abschneiden
        neu_breite = int(bild.height * ziel)
        links = (bild.width - neu_breite) // 2
        bild = bild.crop((links, 0, links + neu_breite, bild.height))
    else:
        # Quelle ist hoeher -> oben und unten abschneiden
        neu_hoehe = int(bild.width / ziel)
        oben = int((bild.height - neu_hoehe) * fokus)
        bild = bild.crop((0, oben, bild.width, oben + neu_hoehe))

    return bild.resize((breite, hoehe), Image.LANCZOS)


def verlauf(breite, hoehe, richtung, von=0.0, bis=1.0):
    """
    Baut eine Schwarz-Maske, die in eine Richtung durchsichtig wird.
    richtung: 'unten' oder 'links'
    """
    maske = Image.new('L', (breite, hoehe))
    d = ImageDraw.Draw(maske)

    if richtung == 'unten':
        for y in range(hoehe):
            t = y / max(1, hoehe - 1)
            wert = von + (bis - von) * (t ** 1.7)
            d.line([(0, y), (breite, y)], fill=int(wert * 255))
    else:
        for x in range(breite):
            t = 1 - x / max(1, breite - 1)
            wert = von + (bis - von) * (t ** 1.4)
            d.line([(x, 0), (x, hoehe)], fill=int(wert * 255))

    return maske


def grundbild(quelle, breite, hoehe, helligkeit, fokus=0.5):
    bild = Image.open(os.path.join(BILDER, quelle)).convert('RGB')
    bild = zuschneiden(bild, breite, hoehe, fokus)
    bild = ImageEnhance.Brightness(bild).enhance(helligkeit)
    bild = ImageEnhance.Color(bild).enhance(1.15)
    return bild


def kapsel_bauen(spiel):
    B, H = 600, 900
    bild = grundbild(spiel['quelle'], B, H, spiel['helligkeit'], fokus=0.45)

    # Dunkler Verlauf von unten - darauf steht spaeter der Titel
    schwarz = Image.new('RGB', (B, H), (3, 5, 10))
    bild = Image.composite(schwarz, bild, verlauf(B, H, 'unten', 0.15, 0.97))

    # Leichte Vignette
    rand = Image.new('L', (B, H), 0)
    ImageDraw.Draw(rand).ellipse([-B * 0.3, -H * 0.2, B * 1.3, H * 1.2], fill=255)
    rand = rand.filter(ImageFilter.GaussianBlur(120))
    bild = Image.composite(bild, Image.new('RGB', (B, H), (2, 3, 7)), rand)

    d = ImageDraw.Draw(bild)

    # Studiozeile ganz oben
    f_klein = schrift(SCHRIFT_FETT, 22)
    d.text((46, 44), 'N I M B U S   G A M E S', font=f_klein, fill=(120, 145, 200))

    # Titel unten, zweizeilig
    f_titel = schrift(SCHRIFT_NORMAL, 78)
    d.text((46, H - 300), spiel['zeile1'], font=f_titel, fill=(238, 243, 252))
    d.text((46, H - 218), spiel['zeile2'], font=f_titel, fill=(150, 175, 225))

    # Kennung (2D / 3D) als Plakette
    f_kenn = schrift(SCHRIFT_FETT, 30)
    kasten = d.textbbox((0, 0), spiel['kennung'], font=f_kenn)
    kb = kasten[2] - kasten[0]
    d.rounded_rectangle([46, H - 130, 46 + kb + 46, H - 130 + 58],
                        radius=10, fill=(60, 100, 180))
    d.text((46 + 23, H - 130 + 12), spiel['kennung'], font=f_kenn, fill=(255, 255, 255))

    return bild


def banner_bauen(spiel):
    B, H = 1600, 520
    bild = grundbild(spiel['quelle_banner'], B, H, spiel['helligkeit'] * 0.92, fokus=0.5)

    # Von links nach rechts abdunkeln - links steht der Text
    schwarz = Image.new('RGB', (B, H), (4, 6, 12))
    bild = Image.composite(schwarz, bild, verlauf(B, H, 'links', 0.05, 0.96))

    d = ImageDraw.Draw(bild)

    f_klein = schrift(SCHRIFT_FETT, 22)
    d.text((70, 96), 'N I M B U S   G A M E S', font=f_klein, fill=(120, 145, 200))

    # Titel zweifarbig auf einer Zeile: erst hell, dann blau direkt
    # dahinter. Dafuer muss die Breite des ersten Teils gemessen werden.
    f_titel = schrift(SCHRIFT_NORMAL, 82)
    d.text((70, 150), spiel['zeile1'], font=f_titel, fill=(238, 243, 252))
    breite_teil1 = d.textbbox((70, 150), spiel['zeile1'], font=f_titel)[2]
    d.text((breite_teil1, 150), spiel['zeile2'], font=f_titel, fill=(150, 175, 225))

    f_spruch = schrift(SCHRIFT_NORMAL, 30)
    d.text((74, 268), spiel['spruch'], font=f_spruch, fill=(150, 163, 190))

    f_kenn = schrift(SCHRIFT_FETT, 26)
    d.rounded_rectangle([74, 330, 74 + 78, 330 + 46], radius=9, fill=(60, 100, 180))
    d.text((74 + 22, 330 + 9), spiel['kennung'], font=f_kenn, fill=(255, 255, 255))

    return bild


def main():
    for spiel in SPIELE:
        ordner = os.path.join(WURZEL, 'spiele', spiel['id'])
        if not os.path.isdir(ordner):
            print('  uebersprungen (kein Ordner): ' + spiel['id'])
            continue

        quelle = os.path.join(BILDER, spiel['quelle'])
        if not os.path.exists(quelle):
            print('  uebersprungen (Screenshot fehlt): ' + spiel['quelle'])
            continue

        for name, bauer in (('kapsel', kapsel_bauen), ('banner', banner_bauen)):
            bild = bauer(spiel)
            ziel = os.path.join(ordner, name + '.webp')
            bild.save(ziel, 'WEBP', quality=86, method=6)
            print('  %-24s %-8s %5.0f KB  %dx%d'
                  % (spiel['id'], name, os.path.getsize(ziel) / 1024, bild.width, bild.height))

    print('')
    print('Danach  python werkzeuge/katalog_bauen.py  laufen lassen,')
    print('damit die neuen Bilder in den Katalog kommen.')


if __name__ == '__main__':
    main()
