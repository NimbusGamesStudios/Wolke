/* ============================================================
   gegner.js  -  Das Monster
   ------------------------------------------------------------
   Das ist fast unveraendert der Gegner aus der 2D-Version.

   Das ist der eigentliche Vorteil einer sauberen Trennung von
   LOGIK und DARSTELLUNG: Die kuenstliche Intelligenz weiss gar
   nicht, ob das Spiel in 2D oder 3D angezeigt wird. Sie arbeitet
   auf demselben flachen Kachelgitter wie vorher. Nur das
   Zeichnen ist ausgetauscht - hier wird das Monster als Figur
   ("Sprite") in die 3D-Ansicht gestellt.

   ZUSTANDSAUTOMAT:

       +-----------+  sieht/hoert dich   +---------+
       | STREIFEN  | ------------------> |  JAGD   |
       +-----------+                     +---------+
             ^                                |
             | nichts gefunden                | verliert dich
             |          +---------+           |
             +--------- | SUCHEN  | <---------+
                        +---------+
   ============================================================ */

const Gegner = {

  x: 0,
  y: 0,
  radius: 15,

  zustand: 'streifen',         // 'streifen' | 'jagd' | 'suchen'

  pfad: [],
  pfadIndex: 0,
  neuberechnung: 0,

  letzteSichtungX: 0,
  letzteSichtungY: 0,
  suchTimer: 0,

  tempoStreifen: 60,
  tempoJagd: 112,
  sichtWeite: 300,
  hoerWeite: 210,

  animation: 0,
  wachTimer: 0,

  /** Setzt das Monster weit weg vom Startpunkt des Spielers. */
  reset(labyrinth, TILE, startX, startY, stufe) {
    const entfernung = Pathfinding.entfernungsKarte(labyrinth, startX, startY);

    let maxEntfernung = 0;
    for (const k of Maze.wegKacheln(labyrinth)) {
      const d = entfernung[k.y * labyrinth.breite + k.x];
      if (d > maxEntfernung) maxEntfernung = d;
    }

    const weitWeg = Maze.wegKacheln(labyrinth).filter(k =>
      entfernung[k.y * labyrinth.breite + k.x] > maxEntfernung * 0.6);

    const start = weitWeg.length > 0
      ? weitWeg[Math.floor(Math.random() * weitWeg.length)]
      : { x: labyrinth.breite - 2, y: labyrinth.hoehe - 2 };

    this.x = (start.x + 0.5) * TILE;
    this.y = (start.y + 0.5) * TILE;

    this.zustand = 'streifen';
    this.pfad = [];
    this.pfadIndex = 0;
    this.neuberechnung = 0;
    this.suchTimer = 0;
    this.animation = 0;

    this.tempoJagd     = stufe.monsterTempo;
    this.tempoStreifen = stufe.monsterTempo * 0.55;
    this.sichtWeite    = stufe.sichtWeite;
    this.wachTimer     = stufe.schonfrist;
  },

  update(dt, labyrinth, TILE) {
    this.animation += dt;

    // Schonfrist am Spielanfang
    if (this.wachTimer > 0) {
      this.wachTimer -= dt;
      return;
    }

    const vorher = this.zustand;

    // ---- 1) Wahrnehmung ----
    const abstand = Math.hypot(Spieler.x - this.x, Spieler.y - this.y);
    let bemerkt = false;

    if (abstand < this.sichtWeite &&
        this.freieSicht(labyrinth, TILE)) {
      bemerkt = true;                       // es SIEHT dich
    } else if (Spieler.rennt && abstand < this.hoerWeite) {
      bemerkt = true;                       // es HOERT dich rennen
    }

    // ---- 2) Zustandswechsel ----
    if (bemerkt) {
      this.zustand = 'jagd';
      this.letzteSichtungX = Spieler.x;
      this.letzteSichtungY = Spieler.y;
      this.suchTimer = 6;
    } else if (this.zustand === 'jagd') {
      this.zustand = 'suchen';
    }

    if (this.zustand === 'suchen') {
      this.suchTimer -= dt;
      if (this.suchTimer <= 0) this.zustand = 'streifen';
    }

    if (vorher !== 'jagd' && this.zustand === 'jagd') Sound.knurren();

    // ---- 3) Weg berechnen (nicht in jedem Bild) ----
    this.neuberechnung -= dt;
    if (this.neuberechnung <= 0 || this.pfadIndex >= this.pfad.length) {
      this.wegSuchen(labyrinth, TILE);
      this.neuberechnung = this.zustand === 'jagd' ? 0.3 : 0.9;
    }

    this.folgeWeg(dt, TILE);
  },

  /**
   * Freie Sichtlinie zum Spieler?
   * Wir laufen in kleinen Schritten die Verbindungslinie ab und
   * pruefen, ob unterwegs eine Wand liegt.
   */
  freieSicht(labyrinth, TILE) {
    const dx = Spieler.x - this.x;
    const dy = Spieler.y - this.y;
    const laenge = Math.hypot(dx, dy);
    if (laenge < 1) return true;

    const schritte = Math.ceil(laenge / (TILE * 0.4));
    for (let i = 1; i < schritte; i++) {
      const t = i / schritte;
      const px = this.x + dx * t;
      const py = this.y + dy * t;
      if (Maze.istWand(labyrinth, Math.floor(px / TILE), Math.floor(py / TILE))) {
        return false;
      }
    }
    return true;
  },

  wegSuchen(labyrinth, TILE) {
    const meinX = Math.floor(this.x / TILE);
    const meinY = Math.floor(this.y / TILE);

    let zielX, zielY;

    if (this.zustand === 'jagd') {
      zielX = Math.floor(Spieler.x / TILE);
      zielY = Math.floor(Spieler.y / TILE);
    } else if (this.zustand === 'suchen') {
      zielX = Math.floor(this.letzteSichtungX / TILE);
      zielY = Math.floor(this.letzteSichtungY / TILE);
    } else {
      const ziel = Maze.zufaelligeWegKachel(labyrinth);
      zielX = ziel.x;
      zielY = ziel.y;
    }

    const pfad = Pathfinding.suchePfad(labyrinth, meinX, meinY, zielX, zielY);
    if (pfad && pfad.length > 1) {
      this.pfad = pfad;
      this.pfadIndex = 1;
    }
  },

  folgeWeg(dt, TILE) {
    if (this.pfadIndex >= this.pfad.length) return;

    const ziel = this.pfad[this.pfadIndex];
    const zielX = (ziel.x + 0.5) * TILE;
    const zielY = (ziel.y + 0.5) * TILE;

    const dx = zielX - this.x;
    const dy = zielY - this.y;
    const abstand = Math.hypot(dx, dy);

    if (abstand < 3) { this.pfadIndex++; return; }

    const tempo = this.zustand === 'jagd' ? this.tempoJagd : this.tempoStreifen;
    const schritt = Math.min(tempo * dt, abstand);

    this.x += (dx / abstand) * schritt;
    this.y += (dy / abstand) * schritt;
  },

  hatSpielerErwischt() {
    return Math.hypot(Spieler.x - this.x, Spieler.y - this.y)
           < this.radius + Spieler.radius - 4;
  }
};
