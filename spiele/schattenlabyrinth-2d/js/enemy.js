/* ============================================================
   enemy.js  -  Das Monster
   ------------------------------------------------------------
   Das Monster ist ein ZUSTANDSAUTOMAT (englisch: state machine).
   Es ist immer in genau einem von drei Zustaenden, und es gibt
   feste Regeln, wann es von einem in den anderen wechselt:

       +-----------+  sieht/hoert dich   +---------+
       | STREIFEN  | ------------------> |  JAGD   |
       +-----------+                     +---------+
             ^                                |
             | nichts gefunden                | verliert dich
             |                                v
             |          +---------+           |
             +--------- | SUCHEN  | <---------+
                        +---------+

   - STREIFEN: laeuft zu zufaelligen Punkten im Labyrinth
   - JAGD:     kennt deine Position und nimmt den kuerzesten Weg
   - SUCHEN:   geht zu der Stelle, wo es dich zuletzt bemerkt hat,
               und schaut sich dort um

   Zustandsautomaten sind DIE Standardloesung fuer Gegner-KI in
   Spielen - von Pac-Man bis heute.

   Fuer den Weg benutzt es die Breitensuche aus pathfinding.js.
   Der Weg wird nicht in jedem Bild neu berechnet (das waere
   Verschwendung), sondern nur alle paar Zehntelsekunden.
   ============================================================ */

const Enemy = {

  x: 0,
  y: 0,
  radius: 13,

  zustand: 'streifen',        // 'streifen' | 'jagd' | 'suchen'

  pfad: [],                   // Liste von Kacheln, die es abgehen will
  pfadIndex: 0,
  neuberechnung: 0,           // Countdown bis zur naechsten Wegsuche

  letzteSichtungX: 0,         // wo es dich zuletzt wahrgenommen hat
  letzteSichtungY: 0,
  suchTimer: 0,

  tempoStreifen: 62,
  tempoJagd: 118,

  sichtWeite: 300,            // Pixel - wie weit es sehen kann
  hoerWeite: 210,             // Pixel - wie weit es dich rennen hoert

  animation: 0,
  wachTimer: 0,               // am Anfang bleibt es kurz stehen (Schonfrist)

  /** Setzt das Monster moeglichst weit weg vom Spieler. */
  reset(labyrinth, TILE, startKachelX, startKachelY, schwierigkeit) {
    const entfernung = Pathfinding.entfernungsKarte(labyrinth, startKachelX, startKachelY);

    // Wie weit ist die entlegenste Kachel ueberhaupt weg?
    let maxEntfernung = 0;
    for (const k of Maze.wegKacheln(labyrinth)) {
      const d = entfernung[k.y * labyrinth.breite + k.x];
      if (d > maxEntfernung) maxEntfernung = d;
    }

    // Aus allen weit entfernten Kacheln eine zufaellige waehlen.
    // (Nicht die allerweiteste - dort steht der Ausgang.)
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

    // Schwierigkeitsgrad anwenden
    this.tempoJagd     = schwierigkeit.monsterTempo;
    this.tempoStreifen = schwierigkeit.monsterTempo * 0.55;
    this.sichtWeite    = schwierigkeit.sichtWeite;
    this.wachTimer     = schwierigkeit.schonfrist;
  },

  update(dt, labyrinth, TILE) {
    this.animation += dt;

    // Schonfrist am Spielanfang: das Monster steht noch still
    if (this.wachTimer > 0) {
      this.wachTimer -= dt;
      return;
    }

    const vorherigerZustand = this.zustand;

    // ---- 1) Wahrnehmung ----
    const dx = Player.x - this.x;
    const dy = Player.y - this.y;
    const abstand = Math.hypot(dx, dy);

    let bemerkt = false;

    if (abstand < this.sichtWeite &&
        Raycast.sichtlinie(labyrinth, this.x, this.y, Player.x, Player.y, TILE)) {
      bemerkt = true;                          // es SIEHT dich
    } else if (Player.rennt && abstand < this.hoerWeite) {
      bemerkt = true;                          // es HOERT dich rennen
    }

    // ---- 2) Zustandswechsel ----
    if (bemerkt) {
      this.zustand = 'jagd';
      this.letzteSichtungX = Player.x;
      this.letzteSichtungY = Player.y;
      this.suchTimer = 6;                      // so lange sucht es danach
    } else if (this.zustand === 'jagd') {
      this.zustand = 'suchen';                 // verloren -> letzte Stelle absuchen
    }

    if (this.zustand === 'suchen') {
      this.suchTimer -= dt;
      if (this.suchTimer <= 0) this.zustand = 'streifen';
    }

    // Neu entdeckt? Dann knurrt es.
    if (vorherigerZustand !== 'jagd' && this.zustand === 'jagd') {
      Sound.knurren();
    }

    // ---- 3) Weg berechnen (nicht jedes Bild!) ----
    this.neuberechnung -= dt;
    if (this.neuberechnung <= 0 || this.pfadIndex >= this.pfad.length) {
      this.wegSuchen(labyrinth, TILE);
      this.neuberechnung = this.zustand === 'jagd' ? 0.3 : 0.9;
    }

    // ---- 4) Am Weg entlang laufen ----
    this.folgeWeg(dt, TILE);
  },

  /** Bestimmt je nach Zustand ein Ziel und laesst BFS den Weg suchen. */
  wegSuchen(labyrinth, TILE) {
    const meinX = Math.floor(this.x / TILE);
    const meinY = Math.floor(this.y / TILE);

    let zielX, zielY;

    if (this.zustand === 'jagd') {
      zielX = Math.floor(Player.x / TILE);
      zielY = Math.floor(Player.y / TILE);

    } else if (this.zustand === 'suchen') {
      zielX = Math.floor(this.letzteSichtungX / TILE);
      zielY = Math.floor(this.letzteSichtungY / TILE);

    } else {
      // Streifen: zufaelliges freies Ziel im Labyrinth
      const ziel = Maze.zufaelligeWegKachel(labyrinth);
      zielX = ziel.x;
      zielY = ziel.y;
    }

    const pfad = Pathfinding.suchePfad(labyrinth, meinX, meinY, zielX, zielY);
    if (pfad && pfad.length > 1) {
      this.pfad = pfad;
      this.pfadIndex = 1;              // 0 ist die eigene Kachel
    }
  },

  /** Bewegt das Monster Kachel fuer Kachel am berechneten Weg entlang. */
  folgeWeg(dt, TILE) {
    if (this.pfadIndex >= this.pfad.length) return;

    const ziel = this.pfad[this.pfadIndex];
    const zielX = (ziel.x + 0.5) * TILE;
    const zielY = (ziel.y + 0.5) * TILE;

    const dx = zielX - this.x;
    const dy = zielY - this.y;
    const abstand = Math.hypot(dx, dy);

    // Kachel erreicht? Dann die naechste nehmen.
    if (abstand < 3) {
      this.pfadIndex++;
      return;
    }

    const tempo = this.zustand === 'jagd' ? this.tempoJagd : this.tempoStreifen;
    const schritt = Math.min(tempo * dt, abstand);

    this.x += (dx / abstand) * schritt;
    this.y += (dy / abstand) * schritt;
  },

  /** Beruehrt das Monster den Spieler? */
  hatSpielerErwischt() {
    const abstand = Math.hypot(Player.x - this.x, Player.y - this.y);
    return abstand < this.radius + Player.radius - 3;
  },

  zeichne(ctx) {
    const r = this.radius;

    // ---- Tentakel: zappelnde Linien um den Koerper ----
    ctx.strokeStyle = 'rgba(8, 4, 10, 0.92)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const winkel = (i / 7) * Math.PI * 2 + this.animation * 0.55;
      const laenge = r * (1.5 + Math.sin(this.animation * 5 + i * 2) * 0.5);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(winkel) * laenge,
                 this.y + Math.sin(winkel) * laenge);
      ctx.stroke();
    }

    // ---- Koerper ----
    const puls = 1 + Math.sin(this.animation * 3.5) * 0.06;
    ctx.fillStyle = '#0a060e';
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * puls, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(70, 20, 30, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },

  /**
   * Die Augen werden SEPARAT gezeichnet - naemlich NACH der Dunkelheit.
   * Dadurch leuchten sie auch dann, wenn das Monster selbst noch
   * komplett im Schatten liegt. Genau das macht es unheimlich.
   */
  zeichneAugen(ctx, kamera, TILE) {
    const sx = this.x - kamera.x;
    const sy = this.y - kamera.y;

    // In welche Richtung schaut es? Zum naechsten Wegpunkt.
    let blickX = 0, blickY = 1;
    if (this.pfadIndex < this.pfad.length) {
      const ziel = this.pfad[this.pfadIndex];
      blickX = (ziel.x + 0.5) * TILE - this.x;
      blickY = (ziel.y + 0.5) * TILE - this.y;
      const l = Math.hypot(blickX, blickY) || 1;
      blickX /= l; blickY /= l;
    }

    // senkrecht zur Blickrichtung = Verbindungslinie der beiden Augen
    const querX = -blickY;
    const querY = blickX;

    const jagt = this.zustand === 'jagd';
    const farbe = jagt ? '255, 60, 50' : '190, 70, 60';
    const glut = jagt ? 1 : 0.62;

    // Blinzeln: alle paar Sekunden gehen die Augen kurz aus
    const blinzeln = Math.sin(this.animation * 0.9) > 0.985 ? 0.1 : 1;

    for (const seite of [-1, 1]) {
      const ax = sx + querX * seite * 4.5 + blickX * 4;
      const ay = sy + querY * seite * 4.5 + blickY * 4;

      const schein = ctx.createRadialGradient(ax, ay, 0, ax, ay, 22);
      schein.addColorStop(0,   'rgba(' + farbe + ', ' + (0.75 * glut * blinzeln) + ')');
      schein.addColorStop(0.3, 'rgba(' + farbe + ', ' + (0.2 * glut * blinzeln) + ')');
      schein.addColorStop(1,   'rgba(' + farbe + ', 0)');
      ctx.fillStyle = schein;
      ctx.beginPath();
      ctx.arc(ax, ay, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 190, 170, ' + (0.95 * blinzeln) + ')';
      ctx.beginPath();
      ctx.arc(ax, ay, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
