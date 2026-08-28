/* ============================================================
   player.js  -  Der Spieler
   ------------------------------------------------------------
   Bewegung, Kollision, Ausdauer und Schrittgeraeusche.

   KOLLISION - "achsen-getrennte Bewegung":
   Statt X und Y gleichzeitig zu bewegen und dann zu pruefen,
   bewegen wir ERST X, pruefen, machen ggf. rueckgaengig, und
   bewegen DANN Y, pruefen, machen ggf. rueckgaengig.

   Der Vorteil: Man bleibt an Waenden nicht kleben, sondern
   rutscht daran entlang. Genau wie in echten Spielen.
   ============================================================ */

const Player = {

  x: 0,
  y: 0,
  radius: 8,

  tempo: 128,          // Pixel pro Sekunde beim Gehen
  tempoRennen: 205,

  blickX: 1,           // Blickrichtung (zeigt zum Mauszeiger)
  blickY: 0,

  ausdauer: 1,         // 1 = voll, 0 = leer
  erschoepft: false,   // nach dem Leerlaufen kurze Sperre
  rennt: false,

  schrittTimer: 0,
  laufWackeln: 0,      // laesst die Taschenlampe beim Laufen leicht wippen

  lebt: true,

  setzeAufKachel(kachelX, kachelY, TILE) {
    this.x = (kachelX + 0.5) * TILE;
    this.y = (kachelY + 0.5) * TILE;
    this.ausdauer = 1;
    this.erschoepft = false;
    this.rennt = false;
    this.lebt = true;
    this.schrittTimer = 0;
    this.laufWackeln = 0;
  },

  /**
   * @param {number} dt      Sekunden seit dem letzten Bild
   * @param {object} tasten  z.B. { w: true, shift: false }
   */
  update(dt, labyrinth, tasten, TILE) {
    if (!this.lebt) return;

    // ---- 1) Richtung aus den Tasten ----
    let dx = 0, dy = 0;
    if (tasten['w'] || tasten['arrowup'])    dy -= 1;
    if (tasten['s'] || tasten['arrowdown'])  dy += 1;
    if (tasten['a'] || tasten['arrowleft'])  dx -= 1;
    if (tasten['d'] || tasten['arrowright']) dx += 1;

    const bewegtSich = (dx !== 0 || dy !== 0);

    // ---- 2) Diagonale normalisieren ----
    // Ohne das waere man diagonal um Faktor 1.41 schneller
    // (Pythagoras: sqrt(1^2 + 1^2) = 1.41).
    if (bewegtSich) {
      const laenge = Math.sqrt(dx * dx + dy * dy);
      dx /= laenge;
      dy /= laenge;
    }

    // ---- 3) Ausdauer verwalten ----
    const willRennen = !!tasten['shift'] && bewegtSich && !this.erschoepft;
    this.rennt = willRennen && this.ausdauer > 0;

    if (this.rennt) {
      this.ausdauer -= dt * 0.34;                 // ca. 3 Sekunden Sprint
      if (this.ausdauer <= 0) {
        this.ausdauer = 0;
        this.erschoepft = true;                   // erst wieder auffuellen
      }
    } else {
      this.ausdauer += dt * 0.20;                 // langsamer als Verbrauch
      if (this.ausdauer >= 1) {
        this.ausdauer = 1;
      }
      // Erst ab einem Drittel darf man wieder sprinten.
      if (this.erschoepft && this.ausdauer > 0.33) this.erschoepft = false;
    }

    const tempo = this.rennt ? this.tempoRennen : this.tempo;

    // dt einrechnen: dadurch laeuft das Spiel auf jedem PC gleich
    // schnell, egal ob er 30 oder 144 Bilder pro Sekunde schafft.
    const schrittX = dx * tempo * dt;
    const schrittY = dy * tempo * dt;

    // ---- 4) Achsen-getrennte Bewegung ----
    this.x += schrittX;
    if (this.kollidiert(labyrinth, TILE)) this.x -= schrittX;

    this.y += schrittY;
    if (this.kollidiert(labyrinth, TILE)) this.y -= schrittY;

    // ---- 5) Schrittgeraeusche im Takt ----
    if (bewegtSich) {
      this.schrittTimer -= dt;
      this.laufWackeln += dt * (this.rennt ? 14 : 9);
      if (this.schrittTimer <= 0) {
        Sound.schritt(this.rennt);
        this.schrittTimer = this.rennt ? 0.29 : 0.44;
      }
    } else {
      this.schrittTimer = 0.12;
      this.laufWackeln += dt * 1.5;               // ruhiges Atmen
    }
  },

  /**
   * Steckt der Spieler in einer Wand?
   * Wir rechnen die vier Ecken seiner Hitbox in Kachel-Koordinaten
   * um (Pixel / TILE, abgerundet) und schauen dort nach.
   */
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
  },

  /** Winkel der Taschenlampe, inklusive leichtem Wackeln beim Laufen. */
  blickWinkel() {
    const wackeln = Math.sin(this.laufWackeln) * 0.035;
    return Math.atan2(this.blickY, this.blickX) + wackeln;
  },

  zeichne(ctx) {
    const wippe = Math.sin(this.laufWackeln * 2) * 0.7;

    // Schatten unter dem Spieler
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 6, this.radius * 1.1, this.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Koerper
    ctx.fillStyle = '#c9d8ee';
    ctx.beginPath();
    ctx.arc(this.x, this.y + wippe, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Kopf / Blickrichtung
    ctx.fillStyle = '#8fb4e8';
    ctx.beginPath();
    ctx.arc(this.x + this.blickX * 3.5,
            this.y + this.blickY * 3.5 + wippe,
            this.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
};
