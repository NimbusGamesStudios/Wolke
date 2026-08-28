/* ============================================================
   texturen.js  -  Alle Bilder werden im Code gemalt
   ------------------------------------------------------------
   Das Spiel enthaelt keine einzige Bilddatei. Jede Textur und
   jede Spielfigur wird beim Start auf ein unsichtbares Canvas
   gemalt und dann als Pixelfeld ausgelesen.

   Warum als Pixelfeld und nicht als Bild?
   Der 3D-Renderer arbeitet Bildpunkt fuer Bildpunkt. Er muss
   also einzelne Pixel aus der Textur lesen koennen ("Welche
   Farbe hat die Wand an dieser Stelle?"). Dafuer braucht er
   die Rohdaten, nicht ein fertiges Bild.

   getImageData() liefert ein Uint8ClampedArray: pro Pixel vier
   Zahlen (Rot, Gruen, Blau, Alpha), alle direkt hintereinander.
   Der Pixel (x,y) liegt also an der Stelle (y * breite + x) * 4.
   ============================================================ */

const Texturen = {

  GROESSE: 64,

  wand: null,
  wandMoos: null,
  boden: null,
  sprites: {},

  /**
   * Malt etwas auf ein unsichtbares Canvas und gibt die Pixel zurueck.
   * @param {function} malFunktion  bekommt (ctx, groesse)
   */
  erzeuge(malFunktion, groesse = this.GROESSE) {
    const c = document.createElement('canvas');
    c.width = groesse;
    c.height = groesse;
    const ctx = c.getContext('2d');

    malFunktion(ctx, groesse);

    const bild = ctx.getImageData(0, 0, groesse, groesse);
    return {
      breite: groesse,
      hoehe: groesse,
      daten: bild.data      // Uint8ClampedArray, 4 Werte pro Pixel
    };
  },

  /** Wird einmal beim Spielstart aufgerufen. */
  alleErzeugen() {
    this.wand     = this.erzeuge((ctx, g) => this.malWand(ctx, g, false));
    this.wandMoos = this.erzeuge((ctx, g) => this.malWand(ctx, g, true));
    this.boden    = this.erzeuge((ctx, g) => this.malBoden(ctx, g));

    this.sprites.schluessel = this.erzeuge((ctx, g) => this.malSchluessel(ctx, g));
    this.sprites.tuer       = this.erzeuge((ctx, g) => this.malTuer(ctx, g));
    this.sprites.monster    = this.erzeuge((ctx, g) => this.malMonster(ctx, g));
  },

  /* ---------- Wand: gemauerte Steine ---------- */
  malWand(ctx, g, moosig) {
    const fugeFarbe = moosig ? '#141a16' : '#151722';

    ctx.fillStyle = fugeFarbe;
    ctx.fillRect(0, 0, g, g);

    const reihenHoehe = g / 8;      // 8 Steinreihen
    const steinBreite = g / 4;      // 4 Steine pro Reihe

    for (let reihe = 0; reihe < 8; reihe++) {
      // Jede zweite Reihe wird versetzt - wie bei echtem Mauerwerk
      const versatz = (reihe % 2) * (steinBreite / 2);

      for (let i = -1; i < 4; i++) {
        const x = i * steinBreite + versatz;
        const y = reihe * reihenHoehe;

        // Helligkeit jedes Steins leicht variieren
        const v = Math.random() * 26 - 13;
        const r = Math.round((moosig ?  74 : 96) + v);
        const gr = Math.round((moosig ?  88 : 102) + v);
        const b = Math.round((moosig ?  76 : 132) + v);

        ctx.fillStyle = 'rgb(' + r + ',' + gr + ',' + b + ')';
        ctx.fillRect(x + 1, y + 1, steinBreite - 2, reihenHoehe - 2);

        // Lichtkante oben, Schattenkante unten -> die Steine wirken plastisch
        ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
        ctx.fillRect(x + 1, y + 1, steinBreite - 2, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(x + 1, y + reihenHoehe - 2, steinBreite - 2, 1);
      }
    }

    // Koernung: viele einzelne dunkle Punkte
    for (let i = 0; i < g * 5; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.16) + ')';
      ctx.fillRect(Math.random() * g, Math.random() * g, 1, 1);
    }

    // Risse
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = Math.random() * g, y = Math.random() * g;
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (Math.random() - 0.5) * 14;
        y += (Math.random() - 0.5) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },

  /* ---------- Boden: alte Steinplatten ---------- */
  malBoden(ctx, g) {
    ctx.fillStyle = '#12141c';
    ctx.fillRect(0, 0, g, g);

    const platte = g / 2;
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const v = Math.random() * 20 - 10;
        ctx.fillStyle = 'rgb(' + Math.round(58 + v) + ',' +
                                 Math.round(63 + v) + ',' +
                                 Math.round(82 + v) + ')';
        ctx.fillRect(px * platte + 1.5, py * platte + 1.5, platte - 3, platte - 3);
      }
    }

    for (let i = 0; i < g * 6; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.2) + ')';
      ctx.fillRect(Math.random() * g, Math.random() * g, 1, 1);
    }
  },

  /* ---------- Schluessel ---------- */
  malSchluessel(ctx, g) {
    const m = g / 2;

    // Schein drumherum
    const schein = ctx.createRadialGradient(m, m, 0, m, m, g * 0.5);
    schein.addColorStop(0,   'rgba(255, 205, 110, 0.55)');
    schein.addColorStop(0.5, 'rgba(255, 190, 90, 0.18)');
    schein.addColorStop(1,   'rgba(255, 180, 70, 0)');
    ctx.fillStyle = schein;
    ctx.fillRect(0, 0, g, g);

    ctx.strokeStyle = '#ffdc96';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    // Griff
    ctx.beginPath();
    ctx.arc(m, m - g * 0.16, g * 0.13, 0, Math.PI * 2);
    ctx.stroke();

    // Schaft
    ctx.beginPath();
    ctx.moveTo(m, m - g * 0.03);
    ctx.lineTo(m, m + g * 0.26);
    ctx.stroke();

    // Bart
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m, m + g * 0.12);
    ctx.lineTo(m + g * 0.13, m + g * 0.12);
    ctx.moveTo(m, m + g * 0.22);
    ctx.lineTo(m + g * 0.1, m + g * 0.22);
    ctx.stroke();
  },

  /* ---------- Ausgang: eine Tuer ---------- */
  malTuer(ctx, g) {
    // Rahmen
    ctx.fillStyle = '#2c3346';
    ctx.fillRect(g * 0.1, g * 0.06, g * 0.8, g * 0.94);

    // Tuerblatt
    ctx.fillStyle = '#463726';
    ctx.fillRect(g * 0.16, g * 0.12, g * 0.68, g * 0.88);

    // Bretter
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(g * 0.16 + (g * 0.68 / 4) * i, g * 0.12);
      ctx.lineTo(g * 0.16 + (g * 0.68 / 4) * i, g);
      ctx.stroke();
    }

    // Beschlaege
    ctx.fillStyle = '#6b7590';
    ctx.fillRect(g * 0.16, g * 0.26, g * 0.68, g * 0.05);
    ctx.fillRect(g * 0.16, g * 0.72, g * 0.68, g * 0.05);

    // Griff
    ctx.fillStyle = '#c9b072';
    ctx.beginPath();
    ctx.arc(g * 0.74, g * 0.55, g * 0.045, 0, Math.PI * 2);
    ctx.fill();
  },

  /* ---------- Monster ---------- */
  malMonster(ctx, g) {
    const m = g / 2;

    // Tentakel
    ctx.strokeStyle = 'rgba(10, 6, 12, 0.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const winkel = (i / 9) * Math.PI * 2;
      const laenge = g * (0.3 + Math.random() * 0.16);
      ctx.beginPath();
      ctx.moveTo(m, m + g * 0.05);
      ctx.quadraticCurveTo(
        m + Math.cos(winkel) * laenge * 0.6,
        m + Math.sin(winkel) * laenge * 0.6 + g * 0.05,
        m + Math.cos(winkel) * laenge,
        m + Math.sin(winkel) * laenge + g * 0.05);
      ctx.stroke();
    }

    // Koerper
    ctx.fillStyle = '#0b0710';
    ctx.beginPath();
    ctx.ellipse(m, m, g * 0.27, g * 0.33, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(80, 24, 34, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Augen - der wichtigste Teil
    for (const seite of [-1, 1]) {
      const ax = m + seite * g * 0.1;
      const ay = m - g * 0.08;

      const glut = ctx.createRadialGradient(ax, ay, 0, ax, ay, g * 0.16);
      glut.addColorStop(0,   'rgba(255, 70, 55, 0.95)');
      glut.addColorStop(0.35,'rgba(220, 40, 30, 0.4)');
      glut.addColorStop(1,   'rgba(200, 30, 20, 0)');
      ctx.fillStyle = glut;
      ctx.beginPath();
      ctx.arc(ax, ay, g * 0.16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffd8c8';
      ctx.beginPath();
      ctx.arc(ax, ay, g * 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
