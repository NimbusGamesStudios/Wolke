/* ============================================================
   maze.js  -  Der Labyrinth-Generator
   ------------------------------------------------------------
   Algorithmus: "Recursive Backtracking" (auch: Depth-First-Search)

   IDEE:
   Man stellt sich das Labyrinth als Gitter aus Zellen vor.
   Man startet in einer Zelle, geht zu einem zufaelligen, noch nicht
   besuchten Nachbarn und reisst die Wand dazwischen ein.
   Das wiederholt man immer weiter.
   Kommt man in eine Sackgasse (alle Nachbarn schon besucht),
   geht man den Weg zurueck ("backtracking"), bis wieder ein
   unbesuchter Nachbar in Reichweite ist.

   Ergebnis: ein "perfektes" Labyrinth - zwischen je zwei Punkten
   gibt es genau EINEN Weg, und es gibt keine abgeschlossenen Bereiche.

   HINWEIS: Wir benutzen hier keine echte Rekursion, sondern einen
   Stack (Stapel). Das ist genau dasselbe, stuerzt aber bei grossen
   Labyrinthen nicht ab (kein "Stack Overflow").
   ============================================================ */

const Maze = {

  WAND: 1,
  WEG:  0,

  /**
   * Erzeugt ein neues Labyrinth.
   * @param {number} zellenX  Anzahl Zellen waagerecht
   * @param {number} zellenY  Anzahl Zellen senkrecht
   * @returns {object} { grid, breite, hoehe }
   *
   * Das zurueckgegebene grid ist ein 2D-Array aus 0 und 1.
   * Es ist doppelt so gross wie die Zellenzahl, weil zwischen
   * je zwei Zellen noch Platz fuer eine Wand sein muss:
   *
   *   Zellen: 3x3        ->        Grid: 7x7
   *   . . .                        #######
   *   . . .                        #.#...#
   *   . . .                        #.#.#.#   (# = Wand, . = Weg)
   *                                #...#.#
   *                                #######
   */
  generate(zellenX, zellenY) {
    const breite = zellenX * 2 + 1;
    const hoehe  = zellenY * 2 + 1;

    // 1) Alles mit Wand fuellen
    const grid = [];
    for (let y = 0; y < hoehe; y++) {
      grid[y] = [];
      for (let x = 0; x < breite; x++) {
        grid[y][x] = this.WAND;
      }
    }

    // 2) Merken, welche Zellen wir schon besucht haben
    const besucht = [];
    for (let y = 0; y < zellenY; y++) {
      besucht[y] = new Array(zellenX).fill(false);
    }

    // 3) Startzelle: oben links
    const stack = [{ x: 0, y: 0 }];
    besucht[0][0] = true;
    grid[1][1] = this.WEG;

    // Die vier Richtungen: rechts, links, unten, oben
    const richtungen = [
      { dx:  1, dy:  0 },
      { dx: -1, dy:  0 },
      { dx:  0, dy:  1 },
      { dx:  0, dy: -1 }
    ];

    // 4) Hauptschleife - laeuft, solange noch etwas auf dem Stack liegt
    while (stack.length > 0) {

      // aktuelle Zelle = oberstes Element des Stacks (noch nicht entfernen!)
      const aktuell = stack[stack.length - 1];

      // Alle Nachbarn sammeln, die im Gitter liegen und noch NICHT besucht sind
      const nachbarn = [];
      for (const r of richtungen) {
        const nx = aktuell.x + r.dx;
        const ny = aktuell.y + r.dy;

        const imGitter = nx >= 0 && nx < zellenX && ny >= 0 && ny < zellenY;
        if (imGitter && !besucht[ny][nx]) {
          nachbarn.push({ x: nx, y: ny });
        }
      }

      if (nachbarn.length === 0) {
        // Sackgasse -> einen Schritt zurueckgehen (BACKTRACKING)
        stack.pop();
        continue;
      }

      // Zufaelligen Nachbarn auswaehlen
      const zufall  = Math.floor(Math.random() * nachbarn.length);
      const naechst = nachbarn[zufall];

      // Wand zwischen aktueller Zelle und Nachbar einreissen.
      // Zelle (x,y) liegt im Grid auf (x*2+1, y*2+1).
      // Die Wand dazwischen liegt genau in der Mitte.
      const wandX = aktuell.x * 2 + 1 + (naechst.x - aktuell.x);
      const wandY = aktuell.y * 2 + 1 + (naechst.y - aktuell.y);
      grid[wandY][wandX] = this.WEG;

      // Nachbarzelle selbst auch freiraeumen
      grid[naechst.y * 2 + 1][naechst.x * 2 + 1] = this.WEG;

      // Nachbar als besucht markieren und weitergehen
      besucht[naechst.y][naechst.x] = true;
      stack.push(naechst);
    }

    return { grid, breite, hoehe, zellenX, zellenY };
  },

  /**
   * Reisst zufaellig ein paar zusaetzliche Waende ein.
   * Dadurch entstehen Schleifen im Labyrinth - man kann im Kreis
   * laufen. Das macht das Spiel spannender (und den Gegner
   * gefaehrlicher, weil er dich umrunden kann).
   *
   * @param {object} labyrinth  Ergebnis von generate()
   * @param {number} menge      0 = keine, 0.1 = 10% der Waende weg
   */
  schleifenEinbauen(labyrinth, menge = 0.08) {
    const { grid, breite, hoehe } = labyrinth;

    for (let y = 1; y < hoehe - 1; y++) {
      for (let x = 1; x < breite - 1; x++) {

        // nur echte Innenwaende betrachten
        if (grid[y][x] !== this.WAND) continue;

        // Eine Wand darf nur weg, wenn links+rechts ODER oben+unten
        // ein Weg ist. Sonst reissen wir Ecken kaputt.
        const waagerecht = grid[y][x - 1] === this.WEG && grid[y][x + 1] === this.WEG;
        const senkrecht  = grid[y - 1][x] === this.WEG && grid[y + 1][x] === this.WEG;

        if ((waagerecht || senkrecht) && Math.random() < menge) {
          grid[y][x] = this.WEG;
        }
      }
    }
  },

  /**
   * Praktische Hilfsfunktion: Ist an dieser Grid-Position eine Wand?
   * Alles ausserhalb des Labyrinths gilt ebenfalls als Wand.
   */
  istWand(labyrinth, x, y) {
    if (x < 0 || y < 0 || x >= labyrinth.breite || y >= labyrinth.hoehe) {
      return true;
    }
    return labyrinth.grid[y][x] === this.WAND;
  },

  /**
   * Sammelt einmalig alle begehbaren Kacheln in einer Liste.
   * Wird gebraucht, um zufaellige Ziele fuer das Monster zu waehlen.
   * Wir speichern das Ergebnis am Labyrinth, damit die Liste nur
   * EINMAL pro Labyrinth aufgebaut wird (Zwischenspeicherung).
   */
  wegKacheln(labyrinth) {
    if (labyrinth._wege) return labyrinth._wege;

    const wege = [];
    for (let y = 0; y < labyrinth.hoehe; y++) {
      for (let x = 0; x < labyrinth.breite; x++) {
        if (labyrinth.grid[y][x] === this.WEG) wege.push({ x, y });
      }
    }
    labyrinth._wege = wege;
    return wege;
  },

  /** Eine zufaellige begehbare Kachel. */
  zufaelligeWegKachel(labyrinth) {
    const wege = this.wegKacheln(labyrinth);
    return wege[Math.floor(Math.random() * wege.length)];
  },

  /**
   * Liefert fuer eine Kachel immer denselben "Zufallswert" zwischen 0 und 1.
   *
   * Warum nicht einfach Math.random()? Weil der Wert bei jedem Bild
   * neu waere und die Waende dann flackern wuerden. Diese Funktion
   * rechnet den Wert aus den Koordinaten aus - gleiche Kachel,
   * gleicher Wert. Man nennt so etwas eine Hashfunktion.
   */
  kachelZufall(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
};
