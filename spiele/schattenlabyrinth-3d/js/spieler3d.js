/* ============================================================
   spieler3d.js  -  Spieler und Kamera
   ------------------------------------------------------------
   In der 3D-Version ist der Spieler gleichzeitig die Kamera.
   Neu gegenueber der 2D-Version ist der BLICKWINKEL: vorher
   lief man einfach nach oben/unten/links/rechts, jetzt haengt
   die Laufrichtung davon ab, wohin man schaut.

   Bewegung:
     W/S  -> vorwaerts/rueckwaerts ENTLANG der Blickrichtung
     A/D  -> seitwaerts (im Spielejargon: "strafen")
     Maus -> drehen

   Vorwaerts ist der Vektor (cos(winkel), sin(winkel)).
   Seitwaerts ist derselbe Vektor um 90 Grad gedreht,
   also (-sin(winkel), cos(winkel)).
   ============================================================ */

const Spieler = {

  x: 0,
  y: 0,
  winkel: 0,           // Blickrichtung im Bogenmass
  radius: 11,

  neigung: 0,          // Hoch-/Runterschauen in Pixeln
  wackeln: 0,          // Kopfwackeln beim Laufen
  wackelPhase: 0,

  tempo: 125,          // Pixel pro Sekunde
  tempoRennen: 200,
  drehTempo: 2.4,      // Bogenmass pro Sekunde (Tastatur)

  ausdauer: 1,
  erschoepft: false,
  rennt: false,
  bewegtSich: false,

  schrittTimer: 0,
  lebt: true,

  setzeAufKachel(kachelX, kachelY, TILE) {
    this.x = (kachelX + 0.5) * TILE;
    this.y = (kachelY + 0.5) * TILE;
    this.ausdauer = 1;
    this.erschoepft = false;
    this.rennt = false;
    this.lebt = true;
    this.neigung = 0;
    this.wackeln = 0;
    this.wackelPhase = 0;
    this.schrittTimer = 0;
  },

  /** Wird vom Mauszeiger aufgerufen (Pointer Lock). */
  drehen(betrag) {
    this.winkel += betrag;
    // Winkel im Bereich 0..2*PI halten
    const zweiPi = Math.PI * 2;
    this.winkel = ((this.winkel % zweiPi) + zweiPi) % zweiPi;
  },

  update(dt, labyrinth, tasten, TILE) {
    if (!this.lebt) return;

    // ---- Drehen mit der Tastatur (Alternative zur Maus) ----
    if (tasten['arrowleft'])  this.drehen(-this.drehTempo * dt);
    if (tasten['arrowright']) this.drehen( this.drehTempo * dt);

    // ---- Bewegungsrichtung bestimmen ----
    let vor = 0, seit = 0;
    if (tasten['w']) vor  += 1;
    if (tasten['s']) vor  -= 1;
    if (tasten['d']) seit += 1;
    if (tasten['a']) seit -= 1;

    this.bewegtSich = (vor !== 0 || seit !== 0);

    // Diagonale normalisieren, sonst waere man schraeg schneller
    if (vor !== 0 && seit !== 0) {
      const f = Math.SQRT1_2;          // 1 / Wurzel(2)
      vor *= f;
      seit *= f;
    }

    // ---- Ausdauer ----
    const willRennen = !!tasten['shift'] && this.bewegtSich && !this.erschoepft;
    this.rennt = willRennen && this.ausdauer > 0;

    if (this.rennt) {
      this.ausdauer -= dt * 0.33;
      if (this.ausdauer <= 0) { this.ausdauer = 0; this.erschoepft = true; }
    } else {
      this.ausdauer = Math.min(1, this.ausdauer + dt * 0.20);
      if (this.erschoepft && this.ausdauer > 0.33) this.erschoepft = false;
    }

    const tempo = (this.rennt ? this.tempoRennen : this.tempo) * dt;

    // ---- Blickrichtung und Seitwaertsrichtung ----
    const vorX = Math.cos(this.winkel);
    const vorY = Math.sin(this.winkel);
    const seitX = -vorY;                 // um 90 Grad gedreht
    const seitY =  vorX;

    const schrittX = (vorX * vor + seitX * seit) * tempo;
    const schrittY = (vorY * vor + seitY * seit) * tempo;

    // ---- Achsen-getrennte Kollision (wie in der 2D-Version) ----
    this.x += schrittX;
    if (this.kollidiert(labyrinth, TILE)) this.x -= schrittX;

    this.y += schrittY;
    if (this.kollidiert(labyrinth, TILE)) this.y -= schrittY;

    // ---- Kopfwackeln und Schritte ----
    if (this.bewegtSich) {
      this.wackelPhase += dt * (this.rennt ? 13 : 8.5);
      this.schrittTimer -= dt;
      if (this.schrittTimer <= 0) {
        Sound.schritt(this.rennt);
        this.schrittTimer = this.rennt ? 0.30 : 0.46;
      }
    } else {
      this.wackelPhase += dt * 1.4;      // ruhiges Atmen im Stehen
      this.schrittTimer = 0.12;
    }

    const staerke = this.bewegtSich ? (this.rennt ? 4.5 : 2.8) : 0.8;
    this.wackeln = Math.sin(this.wackelPhase) * staerke;
  },

  /** Steckt der Spieler in einer Wand? */
  kollidiert(labyrinth, TILE) {
    const r = this.radius;
    const links  = Math.floor((this.x - r) / TILE);
    const rechts = Math.floor((this.x + r) / TILE);
    const oben   = Math.floor((this.y - r) / TILE);
    const unten  = Math.floor((this.y + r) / TILE);

    for (let ky = oben; ky <= unten; ky++) {
      for (let kx = links; kx <= rechts; kx++) {
        if (Maze.istWand(labyrinth, kx, ky)) return true;
      }
    }
    return false;
  }
};
