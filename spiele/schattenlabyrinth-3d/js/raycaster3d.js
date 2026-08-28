/* ============================================================
   raycaster3d.js  -  Die 3D-Engine
   ------------------------------------------------------------
   Das Labyrinth ist in Wirklichkeit immer noch flach - ein 2D-Gitter
   aus Nullen und Einsen. Die 3D-Ansicht ist ein Trick, den 1992
   Wolfenstein 3D beruehmt gemacht hat:

   GRUNDIDEE:
   Der Bildschirm ist z.B. 480 Pixel breit. Fuer JEDE dieser 480
   Bildspalten schicken wir einen Strahl in die Blickrichtung los
   und messen, wie weit es bis zur naechsten Wand ist.

       nah    -> Wand wird HOCH gezeichnet
       weit   -> Wand wird NIEDRIG gezeichnet

   Man malt also nur senkrechte Streifen unterschiedlicher Hoehe
   nebeneinander. Das Gehirn setzt daraus einen Raum zusammen.

   Es ist derselbe DDA-Algorithmus wie in der 2D-Version. Dort hat
   die Entfernung bestimmt, wie weit das Licht reicht - hier
   bestimmt sie die Hoehe der Wand.

   ------------------------------------------------------------
   KAMERA
   Die Blickrichtung ist ein Vektor (dirX, dirY).
   Zusaetzlich gibt es die "Kameraebene" (planeX, planeY) - ein
   Vektor, der senkrecht dazu steht. Er spannt das Sichtfeld auf:

            \    |    /
             \   |   /       dir  = Blickrichtung (Mitte)
              \  |  /        plane= Ebene (nach links/rechts)
               \ | /
                 P

   Fuer Spalte x rechnen wir kameraX von -1 (ganz links) bis
   +1 (ganz rechts) und bilden:  strahl = dir + plane * kameraX
   ============================================================ */

const Raycaster3D = {

  breite: 0,          // interne Aufloesung (bewusst niedrig)
  hoehe: 0,

  puffer: null,       // ImageData, in das wir Pixel fuer Pixel malen
  pixel: null,        // die Rohdaten davon (Uint8ClampedArray)
  zBuffer: null,      // pro Spalte: Entfernung der Wand (fuer Figuren)

  /**
   * @param {number} breite  interne Renderbreite
   *
   * Wir rendern absichtlich in niedriger Aufloesung (z.B. 480 Pixel
   * breit) und skalieren das Bild dann hoch. Das ist deutlich
   * schneller - und der leicht grobe Look passt gut zum Horrorspiel.
   */
  init(breite, hoehe) {
    this.breite = breite;
    this.hoehe = hoehe;

    const c = document.createElement('canvas');
    c.width = breite;
    c.height = hoehe;
    this.hilfsCtx = c.getContext('2d');

    this.puffer = this.hilfsCtx.createImageData(breite, hoehe);
    this.pixel = this.puffer.data;
    this.zBuffer = new Float32Array(breite);
    this.hilfsCanvas = c;
  },

  /** Setzt einen Pixel im Puffer. Erwartet Werte 0-255. */
  setzePixel(x, y, r, g, b) {
    const i = (y * this.breite + x) * 4;
    this.pixel[i]     = r;
    this.pixel[i + 1] = g;
    this.pixel[i + 2] = b;
    this.pixel[i + 3] = 255;
  },

  /* ============================================================
     HAUPTFUNKTION
     ============================================================ */
  zeichne(labyrinth, kamera, TILE, einstellungen) {
    // Position in KACHELN (nicht Pixeln) - die Rechnungen unten
    // werden dadurch viel einfacher.
    const posX = kamera.x / TILE;
    const posY = kamera.y / TILE;

    const dirX = Math.cos(kamera.winkel);
    const dirY = Math.sin(kamera.winkel);

    // Kameraebene steht senkrecht auf der Blickrichtung.
    // Ihre Laenge bestimmt das Sichtfeld (0.66 entspricht ca. 66 Grad).
    const fov = einstellungen.sichtfeld;
    const planeX = -dirY * fov;
    const planeY =  dirX * fov;

    // Kopfhoehe / Wackeln beim Laufen
    const versatz = Math.round(kamera.neigung + kamera.wackeln);

    this.decke(versatz);
    this.bodenZeichnen(posX, posY, dirX, dirY, planeX, planeY, versatz, einstellungen);
    this.waende(labyrinth, posX, posY, dirX, dirY, planeX, planeY, versatz, einstellungen);
  },

  /* ---------- Decke: einfach dunkel mit leichtem Verlauf ---------- */
  decke(versatz) {
    const mitte = this.hoehe / 2 + versatz;

    for (let y = 0; y < this.hoehe; y++) {
      if (y >= mitte) break;

      // Je weiter oben, desto dunkler
      const t = y / Math.max(1, mitte);
      const hell = Math.round(4 + t * 14);

      for (let x = 0; x < this.breite; x++) {
        this.setzePixel(x, y, hell, hell, Math.round(hell * 1.35));
      }
    }
  },

  /* ============================================================
     BODEN  ("floor casting")
     ------------------------------------------------------------
     Fuer jede Bildzeile UNTERHALB des Horizonts gilt: alle Punkte
     dieser Zeile sind gleich weit vom Betrachter entfernt.
     Man kann also pro Zeile EINMAL die Entfernung ausrechnen und
     sich dann in gleichmaessigen Schritten ueber den Boden
     bewegen. Das ist der Grund, warum das schnell genug ist.
     ============================================================ */
  bodenZeichnen(posX, posY, dirX, dirY, planeX, planeY, versatz, einstellungen) {
    const textur = Texturen.boden;
    const tb = textur.breite;
    const th = textur.hoehe;
    const daten = textur.daten;

    const mitte = this.hoehe / 2 + versatz;

    // Strahl ganz links und ganz rechts im Bild
    const strahlLinksX  = dirX - planeX;
    const strahlLinksY  = dirY - planeY;
    const strahlRechtsX = dirX + planeX;
    const strahlRechtsY = dirY + planeY;

    for (let y = Math.max(0, Math.ceil(mitte)); y < this.hoehe; y++) {

      // Abstand der Bildzeile zum Horizont
      const p = y - mitte;
      if (p <= 0) continue;

      // Entfernung dieser Bodenzeile zur Kamera
      const zeilenAbstand = (0.5 * this.hoehe) / p;

      // Schrittweite pro Bildspalte auf dem Boden
      const schrittX = zeilenAbstand * (strahlRechtsX - strahlLinksX) / this.breite;
      const schrittY = zeilenAbstand * (strahlRechtsY - strahlLinksY) / this.breite;

      // Startpunkt: Boden am linken Bildrand
      let bodenX = posX + zeilenAbstand * strahlLinksX;
      let bodenY = posY + zeilenAbstand * strahlLinksY;

      const grundHelligkeit = this.helligkeit(zeilenAbstand, einstellungen);

      for (let x = 0; x < this.breite; x++) {

        // Nachkommastelle = Position INNERHALB der Bodenkachel
        const tx = (((bodenX - Math.floor(bodenX)) * tb) | 0) & (tb - 1);
        const ty = (((bodenY - Math.floor(bodenY)) * th) | 0) & (th - 1);

        bodenX += schrittX;
        bodenY += schrittY;

        const i = (ty * tb + tx) * 4;

        // Taschenlampe: zum Bildrand hin dunkler
        const kegel = this.kegelFaktor(x, einstellungen);
        const h = grundHelligkeit * kegel;

        this.setzePixel(x, y,
          daten[i]     * h,
          daten[i + 1] * h,
          daten[i + 2] * h * 0.96);
      }
    }
  },

  /* ============================================================
     WAENDE  (der eigentliche Raycaster)
     ============================================================ */
  waende(labyrinth, posX, posY, dirX, dirY, planeX, planeY, versatz, einstellungen) {

    for (let x = 0; x < this.breite; x++) {

      // -1 (links) bis +1 (rechts)
      const kameraX = 2 * x / this.breite - 1;

      const strahlX = dirX + planeX * kameraX;
      const strahlY = dirY + planeY * kameraX;

      // ---- DDA vorbereiten ----
      let kachelX = Math.floor(posX);
      let kachelY = Math.floor(posY);

      // Wie weit muss man am Strahl entlang fuer eine ganze Kachel?
      const deltaX = Math.abs(strahlX) < 1e-9 ? 1e30 : Math.abs(1 / strahlX);
      const deltaY = Math.abs(strahlY) < 1e-9 ? 1e30 : Math.abs(1 / strahlY);

      let schrittX, schrittY, seitenX, seitenY;

      if (strahlX < 0) {
        schrittX = -1;
        seitenX = (posX - kachelX) * deltaX;
      } else {
        schrittX = 1;
        seitenX = (kachelX + 1 - posX) * deltaX;
      }
      if (strahlY < 0) {
        schrittY = -1;
        seitenY = (posY - kachelY) * deltaY;
      } else {
        schrittY = 1;
        seitenY = (kachelY + 1 - posY) * deltaY;
      }

      // ---- DDA laufen lassen ----
      let seite = 0;          // 0 = senkrechte Wand, 1 = waagerechte Wand
      let getroffen = false;

      for (let schritte = 0; schritte < 120 && !getroffen; schritte++) {
        if (seitenX < seitenY) {
          seitenX += deltaX;
          kachelX += schrittX;
          seite = 0;
        } else {
          seitenY += deltaY;
          kachelY += schrittY;
          seite = 1;
        }
        if (Maze.istWand(labyrinth, kachelX, kachelY)) getroffen = true;
      }

      // ---- Entfernung SENKRECHT zur Bildebene ----
      // Wuerde man die echte Strahllaenge nehmen, waere das Bild
      // an den Raendern nach aussen gewoelbt ("Fischauge").
      let abstand;
      if (seite === 0) {
        abstand = (kachelX - posX + (1 - schrittX) / 2) / strahlX;
      } else {
        abstand = (kachelY - posY + (1 - schrittY) / 2) / strahlY;
      }
      if (abstand < 0.0001) abstand = 0.0001;

      this.zBuffer[x] = abstand;

      // ---- Hoehe des Wandstreifens ----
      const streifenHoehe = Math.floor(this.hoehe / abstand);

      let start = Math.floor(-streifenHoehe / 2 + this.hoehe / 2 + versatz);
      let ende  = Math.floor( streifenHoehe / 2 + this.hoehe / 2 + versatz);

      const sichtbarStart = Math.max(0, start);
      const sichtbarEnde  = Math.min(this.hoehe - 1, ende);

      // ---- Welche Stelle der Textur wurde getroffen? ----
      let wandX;
      if (seite === 0) wandX = posY + abstand * strahlY;
      else             wandX = posX + abstand * strahlX;
      wandX -= Math.floor(wandX);          // nur die Nachkommastelle

      // Moosige Wand-Variante fuer etwas Abwechslung
      const textur = ((kachelX * 7 + kachelY * 13) % 5 === 0)
        ? Texturen.wandMoos : Texturen.wand;
      const tb = textur.breite;
      const th = textur.hoehe;
      const daten = textur.daten;

      let texX = Math.floor(wandX * tb);
      // Textur spiegeln, damit benachbarte Waende nicht gespiegelt wirken
      if (seite === 0 && strahlX > 0) texX = tb - texX - 1;
      if (seite === 1 && strahlY < 0) texX = tb - texX - 1;
      texX = Math.max(0, Math.min(tb - 1, texX));

      // ---- Helligkeit ----
      let h = this.helligkeit(abstand, einstellungen) * this.kegelFaktor(x, einstellungen);
      // Waende quer zur Blickrichtung etwas dunkler -> Kanten werden sichtbar
      if (seite === 1) h *= 0.72;

      // ---- Streifen zeichnen ----
      // Pro Bildschirmzeile eine Texturzeile. schrittTex sagt, wie weit
      // man in der Textur weitergeht, wenn man im Bild eine Zeile tiefer geht.
      const schrittTex = th / streifenHoehe;
      let texPos = (sichtbarStart - versatz - this.hoehe / 2 + streifenHoehe / 2) * schrittTex;

      for (let y = sichtbarStart; y <= sichtbarEnde; y++) {
        const texY = (texPos | 0) & (th - 1);
        texPos += schrittTex;

        const i = (texY * tb + texX) * 4;
        this.setzePixel(x, y,
          daten[i]     * h,
          daten[i + 1] * h,
          daten[i + 2] * h);
      }
    }
  },

  /* ============================================================
     FIGUREN  ("Sprites")
     ------------------------------------------------------------
     Schluessel, Tuer und Monster sind flache Bilder, die immer
     zum Spieler zeigen (sogenannte Billboards).

     Das Problem: eine Figur kann HINTER einer Wand stehen.
     Deshalb haben wir beim Wandzeichnen fuer jede Bildspalte die
     Entfernung im zBuffer gespeichert. Eine Spalte der Figur wird
     nur gemalt, wenn die Figur NAEHER ist als die Wand dort.
     ============================================================ */
  zeichneFiguren(figuren, kamera, TILE, einstellungen) {
    const posX = kamera.x / TILE;
    const posY = kamera.y / TILE;

    const dirX = Math.cos(kamera.winkel);
    const dirY = Math.sin(kamera.winkel);
    const fov = einstellungen.sichtfeld;
    const planeX = -dirY * fov;
    const planeY =  dirX * fov;

    const versatz = Math.round(kamera.neigung + kamera.wackeln);

    // Entfernte Figuren zuerst zeichnen, nahe zuletzt
    const sortiert = figuren
      .map(f => ({
        f,
        abstand: (posX - f.x / TILE) ** 2 + (posY - f.y / TILE) ** 2
      }))
      .sort((a, b) => b.abstand - a.abstand);

    // Kehrmatrix der Kamera - rechnet Weltkoordinaten in
    // "Kamerakoordinaten" um (links/rechts und Tiefe).
    const invDet = 1 / (planeX * dirY - dirX * planeY);

    for (const eintrag of sortiert) {
      const figur = eintrag.f;

      const relX = figur.x / TILE - posX;
      const relY = figur.y / TILE - posY;

      const kameraRaumX = invDet * (dirY * relX - dirX * relY);
      const tiefe       = invDet * (-planeY * relX + planeX * relY);

      if (tiefe <= 0.15) continue;         // hinter der Kamera

      const bildX = Math.floor((this.breite / 2) * (1 + kameraRaumX / tiefe));

      // So hoch waere an dieser Stelle eine volle Wand. Daran richten
      // wir die Figur aus, damit sie auf dem BODEN steht und nicht
      // in der Luft schwebt.
      const wandHoehe = Math.abs(this.hoehe / tiefe);
      const groesse = Math.max(1, Math.floor(wandHoehe * (figur.groesse || 1)));

      // zusaetzliche Verschiebung nach oben (z.B. schwebende Schluessel)
      const hoehenVersatz = (figur.hoehe || 0) * wandHoehe;

      // Unterkante der Figur = Unterkante der Wand = Boden
      const startY = Math.floor(this.hoehe / 2 + versatz + wandHoehe / 2
                                - groesse - hoehenVersatz);
      const startX = Math.floor(-groesse / 2 + bildX);

      const textur = Texturen.sprites[figur.textur];
      const tb = textur.breite;
      const th = textur.hoehe;
      const daten = textur.daten;

      const h = this.helligkeit(tiefe, einstellungen) * (figur.leuchtet ? 1.6 : 1);

      for (let x = startX; x < startX + groesse; x++) {
        if (x < 0 || x >= this.breite) continue;
        if (tiefe >= this.zBuffer[x]) continue;      // von einer Wand verdeckt

        const texX = Math.floor((x - startX) * tb / groesse);
        const kegel = figur.leuchtet ? 1 : this.kegelFaktor(x, einstellungen);
        const hh = Math.min(1.9, h * kegel);

        for (let y = Math.max(0, startY); y < Math.min(this.hoehe, startY + groesse); y++) {
          const texY = Math.floor((y - startY) * th / groesse);
          const i = (texY * tb + texX) * 4;

          const alpha = daten[i + 3];
          if (alpha < 12) continue;                  // durchsichtig -> ueberspringen

          const ziel = (y * this.breite + x) * 4;

          if (alpha > 245) {
            this.pixel[ziel]     = daten[i]     * hh;
            this.pixel[ziel + 1] = daten[i + 1] * hh;
            this.pixel[ziel + 2] = daten[i + 2] * hh;
          } else {
            // halbdurchsichtig: mit dem Hintergrund mischen
            const a = alpha / 255;
            this.pixel[ziel]     = this.pixel[ziel]     * (1 - a) + daten[i]     * hh * a;
            this.pixel[ziel + 1] = this.pixel[ziel + 1] * (1 - a) + daten[i + 1] * hh * a;
            this.pixel[ziel + 2] = this.pixel[ziel + 2] * (1 - a) + daten[i + 2] * hh * a;
          }
        }
      }
    }
  },

  /* ---------- Helligkeit nach Entfernung ---------- */
  helligkeit(abstand, einstellungen) {
    // Die Taschenlampe reicht nur begrenzt weit. Quadratischer
    // Abfall wirkt natuerlicher als linearer.
    const reichweite = einstellungen.lampenWeite;
    const wert = 1 / (1 + (abstand / reichweite) ** 2 * 3.2);
    return Math.max(einstellungen.grundlicht, wert);
  },

  /* ---------- Taschenlampen-Kegel ---------- */
  kegelFaktor(x, einstellungen) {
    // 0 in der Bildmitte, 1 am Rand
    const abweichung = Math.abs(x / this.breite - 0.5) * 2;
    const k = 1 - abweichung ** 2 * einstellungen.kegelStaerke;
    return Math.max(0.12, k);
  },

  /** Schreibt den fertigen Puffer auf das sichtbare Canvas. */
  ausgeben(zielCtx, zielBreite, zielHoehe) {
    this.hilfsCtx.putImageData(this.puffer, 0, 0);

    // Hochskalieren ohne Weichzeichnen -> klare Pixelkanten
    zielCtx.imageSmoothingEnabled = false;
    zielCtx.drawImage(this.hilfsCanvas, 0, 0, zielBreite, zielHoehe);
  }
};
