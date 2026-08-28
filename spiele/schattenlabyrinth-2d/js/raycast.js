/* ============================================================
   raycast.js  -  Sichtfeld und Schatten
   ------------------------------------------------------------
   Das hier macht aus einem Labyrinth ein Horrorspiel.

   IDEE:
   Vom Spieler aus schicken wir viele Strahlen ("rays") in alle
   Richtungen. Jeder Strahl fliegt so lange, bis er auf eine Wand
   trifft. Die Trefferpunkte verbindet man zu einem Vieleck (Polygon).
   Alles INNERHALB des Polygons ist sichtbar, alles ausserhalb
   liegt im Schatten.

   DER ALGORITHMUS: DDA (Digital Differential Analyzer)
   Der naive Weg waere, in winzigen Schritten am Strahl entlang
   zu laufen und jedes Mal zu pruefen "bin ich in einer Wand?".
   Das ist langsam UND ungenau (man kann duenne Waende ueberspringen).

   DDA springt stattdessen exakt von Kachelgrenze zu Kachelgrenze.
   Man merkt sich, wie weit es bis zur naechsten senkrechten und
   bis zur naechsten waagerechten Gitterlinie ist, und geht immer
   zu der, die naeher liegt. Dadurch wird garantiert keine Kachel
   uebersprungen, und man braucht nur so viele Schritte, wie man
   Kacheln durchquert.

   Denselben Algorithmus benutzt Wolfenstein 3D (1992).
   ============================================================ */

const Raycast = {

  /**
   * Schickt EINEN Strahl los und gibt zurueck, wie weit er kam.
   *
   * @param {number} ox,oy    Startpunkt in Pixeln
   * @param {number} dx,dy    Richtung (muss normalisiert sein, Laenge 1)
   * @param {number} maxDist  Wie weit der Strahl hoechstens fliegt
   * @returns {number} Entfernung bis zur Wand (oder maxDist)
   */
  strahl(labyrinth, ox, oy, dx, dy, maxDist, TILE) {

    // In welcher Kachel starten wir?
    let kachelX = Math.floor(ox / TILE);
    let kachelY = Math.floor(oy / TILE);

    // Wie weit muss man am Strahl entlang, um EINE ganze Kachel
    // in x- bzw. y-Richtung weiterzukommen?
    const schrittWeiteX = Math.abs(dx) < 1e-9 ? Infinity : TILE / Math.abs(dx);
    const schrittWeiteY = Math.abs(dy) < 1e-9 ? Infinity : TILE / Math.abs(dy);

    // Gehen wir nach links/rechts bzw. oben/unten?
    const richtungX = dx < 0 ? -1 : 1;
    const richtungY = dy < 0 ? -1 : 1;

    // Wie weit ist es vom Startpunkt bis zur ERSTEN Gitterlinie?
    let naechsteX, naechsteY;

    if (dx < 0) {
      naechsteX = (ox - kachelX * TILE) / Math.abs(dx);
    } else {
      naechsteX = ((kachelX + 1) * TILE - ox) / Math.abs(dx);
    }
    if (Math.abs(dx) < 1e-9) naechsteX = Infinity;

    if (dy < 0) {
      naechsteY = (oy - kachelY * TILE) / Math.abs(dy);
    } else {
      naechsteY = ((kachelY + 1) * TILE - oy) / Math.abs(dy);
    }
    if (Math.abs(dy) < 1e-9) naechsteY = Infinity;

    let entfernung = 0;

    // Der eigentliche DDA-Schritt: immer zur naeheren Gitterlinie springen
    for (let i = 0; i < 200; i++) {

      if (naechsteX < naechsteY) {
        entfernung = naechsteX;
        naechsteX += schrittWeiteX;
        kachelX += richtungX;
      } else {
        entfernung = naechsteY;
        naechsteY += schrittWeiteY;
        kachelY += richtungY;
      }

      if (entfernung >= maxDist) return maxDist;
      if (Maze.istWand(labyrinth, kachelX, kachelY)) return entfernung;
    }

    return maxDist;
  },

  /**
   * Baut ein Sicht-Polygon: viele Strahlen faecherfoermig ausgesendet,
   * die Trefferpunkte zu einem Vieleck verbunden.
   *
   * Der erste Punkt ist immer der Spieler selbst - dadurch wird das
   * Polygon ein geschlossener Faecher ("triangle fan").
   *
   * @param {number} mitteWinkel  Blickrichtung im Bogenmass
   * @param {number} oeffnung     Breite des Faechers im Bogenmass
   * @param {number} anzahl       Wie viele Strahlen (mehr = glatter)
   */
  sichtPolygon(labyrinth, ox, oy, mitteWinkel, oeffnung, anzahl, maxDist, TILE) {
    const punkte = [{ x: ox, y: oy }];

    const start = mitteWinkel - oeffnung / 2;
    const schritt = oeffnung / (anzahl - 1);

    for (let i = 0; i < anzahl; i++) {
      const winkel = start + i * schritt;
      const dx = Math.cos(winkel);
      const dy = Math.sin(winkel);

      // +0.6 Pixel, damit die Wandkante mitgezeichnet wird und
      // keine haarduennen schwarzen Fugen entstehen.
      const d = this.strahl(labyrinth, ox, oy, dx, dy, maxDist, TILE) + 0.6;

      punkte.push({ x: ox + dx * d, y: oy + dy * d });
    }

    return punkte;
  },

  /**
   * Freie Sichtlinie zwischen zwei Punkten?
   * Braucht das Monster, um zu entscheiden, ob es dich SIEHT.
   */
  sichtlinie(labyrinth, x1, y1, x2, y2, TILE) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const laenge = Math.hypot(dx, dy);
    if (laenge < 1) return true;

    const treffer = this.strahl(labyrinth, x1, y1, dx / laenge, dy / laenge, laenge, TILE);

    // Kam der Strahl (fast) bis zum Ziel? Dann war nichts im Weg.
    return treffer >= laenge - 1;
  }
};
