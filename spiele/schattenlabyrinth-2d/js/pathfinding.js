/* ============================================================
   pathfinding.js  -  Wegfindung mit Breitensuche (BFS)
   ------------------------------------------------------------
   BFS = Breadth-First-Search = Breitensuche.

   IDEE:
   Man legt die Startkachel in eine Warteschlange (Queue).
   Dann nimmt man immer die vorderste Kachel heraus, schaut sich
   ihre vier Nachbarn an, und haengt jeden noch unbesuchten Nachbarn
   hinten an die Queue an.

   Weil man Kachel fuer Kachel in Wellen nach aussen laeuft,
   findet man das Ziel garantiert auf dem KUERZESTEN Weg.
   Das ist der entscheidende Unterschied zur Tiefensuche (DFS),
   die den Weg zwar auch findet, aber irgendeinen.

   WARUM BFS und nicht A*?
   A* ist schneller, aber nur bei sehr grossen Karten spuerbar.
   Bei unserem Labyrinth (max. ca. 5000 Kacheln) ist BFS in unter
   einer Millisekunde fertig - und dabei viel einfacher zu verstehen
   und fehlerfrei zu implementieren.

   Laufzeit: O(V + E)  -  jede Kachel und jede Verbindung genau einmal.
   ============================================================ */

const Pathfinding = {

  // Die vier Nachbarrichtungen: rechts, links, unten, oben
  RICHTUNGEN: [
    { dx:  1, dy:  0 },
    { dx: -1, dy:  0 },
    { dx:  0, dy:  1 },
    { dx:  0, dy: -1 }
  ],

  /**
   * Sucht den kuerzesten Weg von (startX,startY) nach (zielX,zielY).
   *
   * @returns {Array|null} Liste von {x,y} vom Start bis zum Ziel,
   *                       oder null wenn es keinen Weg gibt.
   */
  suchePfad(labyrinth, startX, startY, zielX, zielY) {
    const breite = labyrinth.breite;
    const hoehe  = labyrinth.hoehe;

    // Ungueltige Start- oder Zielkachel? Dann gar nicht erst anfangen.
    if (Maze.istWand(labyrinth, startX, startY)) return null;
    if (Maze.istWand(labyrinth, zielX,  zielY))  return null;

    const anzahl = breite * hoehe;

    // Wir rechnen 2D-Koordinaten in EINE Zahl um: index = y * breite + x
    // Das ist deutlich schneller als verschachtelte Arrays.
    const start = startY * breite + startX;
    const ziel  = zielY  * breite + zielX;

    if (start === ziel) return [{ x: startX, y: startY }];

    const besucht = new Uint8Array(anzahl);      // 0 = nein, 1 = ja
    const vorgaenger = new Int32Array(anzahl).fill(-1);

    // Die Warteschlange. Ein Array mit zwei Zeigern ist schneller
    // als shift(), weil shift() das ganze Array verschieben muesste.
    const queue = new Int32Array(anzahl);
    let kopf = 0;    // wo wir lesen
    let ende = 0;    // wo wir schreiben

    queue[ende++] = start;
    besucht[start] = 1;

    let gefunden = false;

    while (kopf < ende) {
      const aktuell = queue[kopf++];

      if (aktuell === ziel) { gefunden = true; break; }

      // Index zurueck in x/y umrechnen
      const ax = aktuell % breite;
      const ay = (aktuell / breite) | 0;        // |0 = schnelles Abrunden

      for (const r of this.RICHTUNGEN) {
        const nx = ax + r.dx;
        const ny = ay + r.dy;

        if (Maze.istWand(labyrinth, nx, ny)) continue;

        const index = ny * breite + nx;
        if (besucht[index]) continue;

        besucht[index] = 1;
        vorgaenger[index] = aktuell;            // merken, woher wir kamen
        queue[ende++] = index;
      }
    }

    if (!gefunden) return null;

    // ---- Weg rueckwaerts rekonstruieren ----
    // Wir laufen vom Ziel ueber die vorgaenger-Kette zurueck zum Start
    // und drehen die Liste am Ende um.
    const pfad = [];
    let aktuell = ziel;
    while (aktuell !== -1) {
      pfad.push({ x: aktuell % breite, y: (aktuell / breite) | 0 });
      if (aktuell === start) break;
      aktuell = vorgaenger[aktuell];
    }
    pfad.reverse();
    return pfad;
  },

  /**
   * Berechnet fuer JEDE Kachel, wie weit sie vom Start entfernt ist.
   * Das ist dieselbe Breitensuche, nur ohne Abbruch beim Ziel.
   *
   * Brauchen wir, um Schluessel und Ausgang moeglichst WEIT weg
   * vom Startpunkt zu platzieren - sonst waere das Spiel langweilig.
   *
   * @returns {Int32Array} Entfernung pro Kachel, -1 = nicht erreichbar
   */
  entfernungsKarte(labyrinth, startX, startY) {
    const breite = labyrinth.breite;
    const anzahl = breite * labyrinth.hoehe;

    const entfernung = new Int32Array(anzahl).fill(-1);
    const queue = new Int32Array(anzahl);
    let kopf = 0, ende = 0;

    const start = startY * breite + startX;
    entfernung[start] = 0;
    queue[ende++] = start;

    while (kopf < ende) {
      const aktuell = queue[kopf++];
      const ax = aktuell % breite;
      const ay = (aktuell / breite) | 0;

      for (const r of this.RICHTUNGEN) {
        const nx = ax + r.dx;
        const ny = ay + r.dy;
        if (Maze.istWand(labyrinth, nx, ny)) continue;

        const index = ny * breite + nx;
        if (entfernung[index] !== -1) continue;   // schon besucht

        entfernung[index] = entfernung[aktuell] + 1;
        queue[ende++] = index;
      }
    }

    return entfernung;
  }
};
