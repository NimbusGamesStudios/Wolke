/* ============================================================
   game.js  -  Das Herz des Spiels
   ------------------------------------------------------------
   Hier laeuft der "Game Loop": eine Schleife, die ca. 60 Mal pro
   Sekunde ausgefuehrt wird und immer dasselbe tut:

        1. update()   -> Zustand berechnen (Bewegung, KI, Logik)
        2. zeichne()  -> Bild malen

   Ausserdem verwaltet diese Datei den SPIELZUSTAND:
   Menue, Spiel, Pause, Tod, Sieg. Auch das ist ein Zustandsautomat.
   ============================================================ */

// ---------- Grundeinstellungen ----------
const TILE = 40;                       // Kachelgroesse in Pixeln
const KEGEL_OEFFNUNG = 1.18;           // Oeffnungswinkel der Taschenlampe (Bogenmass)
const KEGEL_STRAHLEN = 140;            // Strahlen fuer den Kegel (mehr = glatter)

// ---------- Schwierigkeitsgrade ----------
const STUFEN = {
  leicht: {
    name: 'Leicht',
    zellenX: 12, zellenY: 9,
    schluessel: 2,
    monsterTempo: 86,
    sichtWeite: 240,
    schonfrist: 9,
    lampenWeite: 360
  },
  normal: {
    name: 'Normal',
    zellenX: 16, zellenY: 12,
    schluessel: 3,
    monsterTempo: 112,
    sichtWeite: 300,
    schonfrist: 6,
    lampenWeite: 330
  },
  albtraum: {
    name: 'Albtraum',
    zellenX: 22, zellenY: 16,
    schluessel: 4,
    monsterTempo: 140,
    sichtWeite: 380,
    schonfrist: 3,
    lampenWeite: 290
  }
};

let stufe = 'normal';

// ---------- Canvas ----------
const canvas = document.getElementById('spielfeld');
const ctx = canvas.getContext('2d');

// Zweites, unsichtbares Canvas nur fuer die Dunkelheit.
// Darauf malen wir eine schwarze Flaeche und "stanzen" das
// Sichtfeld als Loch heraus. Das Ergebnis legen wir dann
// ueber das Spielbild.
const lichtCanvas = document.createElement('canvas');
const lichtCtx = lichtCanvas.getContext('2d');

let dpr = 1;

function canvasAnpassen() {
  dpr = window.devicePixelRatio || 1;

  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  lichtCanvas.width  = canvas.width;
  lichtCanvas.height = canvas.height;

  koernungBauen();
}
window.addEventListener('resize', canvasAnpassen);

// ---------- Spielzustand ----------
let zustand = 'menue';                 // 'menue' | 'spiel' | 'pause' | 'tot' | 'sieg'
let labyrinth = null;
let kamera = { x: 0, y: 0 };
let spielZeit = 0;

let schluessel = [];                   // { x, y, eingesammelt }
let gesammelt = 0;
let ausgang = { x: 0, y: 0 };

let staub = [];                        // Staubkoerner in der Luft
let ruettelStaerke = 0;                // Bildschirmwackeln
let herzTimer = 0;
let verschlossenTimer = 0;

// ---------- Tastatur ----------
const tasten = {};

window.addEventListener('keydown', (e) => {
  const taste = e.key.toLowerCase();
  tasten[taste] = true;

  if (e.key === 'Escape') {
    if (zustand === 'spiel') pausieren();
    else if (zustand === 'pause') fortsetzen();
  }
  if (e.key.startsWith('Arrow')) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  tasten[e.key.toLowerCase()] = false;
});

// ---------- Maus: Taschenlampe zielen ----------
window.addEventListener('mousemove', (e) => {
  if (zustand !== 'spiel') return;
  const dx = (e.clientX + kamera.x) - Player.x;
  const dy = (e.clientY + kamera.y) - Player.y;
  const laenge = Math.hypot(dx, dy);
  if (laenge > 0.001) {
    Player.blickX = dx / laenge;
    Player.blickY = dy / laenge;
  }
});

/* ============================================================
   SPIEL AUFBAUEN
   ============================================================ */
function neuesSpiel() {
  const s = STUFEN[stufe];

  labyrinth = Maze.generate(s.zellenX, s.zellenY);
  Maze.schleifenEinbauen(labyrinth, 0.07);

  // Zufaelliger Startpunkt - dadurch spielt sich jede Runde anders
  // an, und man startet nicht immer in derselben engen Ecke.
  const start = Maze.zufaelligeWegKachel(labyrinth);
  Player.setzeAufKachel(start.x, start.y, TILE);

  // Blickrichtung dorthin, wo Platz ist
  const frei = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}]
    .find(r => !Maze.istWand(labyrinth, start.x + r.dx, start.y + r.dy)) || {dx:1,dy:0};
  Player.blickX = frei.dx;
  Player.blickY = frei.dy;

  // Entfernung jeder Kachel zum Startpunkt - damit koennen wir
  // Ziele gezielt WEIT weg platzieren.
  const entfernung = Pathfinding.entfernungsKarte(labyrinth, start.x, start.y);
  const maxEntfernung = Math.max(...entfernung);

  ausgangPlatzieren(entfernung, maxEntfernung);
  schluesselPlatzieren(entfernung, maxEntfernung, s.schluessel);

  Enemy.reset(labyrinth, TILE, start.x, start.y, s);

  gesammelt = 0;
  spielZeit = 0;
  ruettelStaerke = 0;
  herzTimer = 0;
  verschlossenTimer = 0;

  gesehen = new Uint8Array(labyrinth.breite * labyrinth.hoehe);
  staubErzeugen();

  kamera.x = Player.x - window.innerWidth / 2;
  kamera.y = Player.y - window.innerHeight / 2;


  hudSchluesselMax.textContent = '/' + s.schluessel;
}

/** Der Ausgang kommt an die Kachel, die am weitesten vom Start weg ist. */
function ausgangPlatzieren(entfernung, maxEntfernung) {
  for (let y = 0; y < labyrinth.hoehe; y++) {
    for (let x = 0; x < labyrinth.breite; x++) {
      if (entfernung[y * labyrinth.breite + x] === maxEntfernung) {
        ausgang = { x, y };
        return;
      }
    }
  }
}

/**
 * Verteilt die Schluessel. Bedingungen:
 *  - mindestens 35% der maximalen Entfernung vom Start weg
 *  - nicht zu dicht beieinander (sonst laeuft man nur in eine Ecke)
 */
function schluesselPlatzieren(entfernung, maxEntfernung, anzahl) {
  schluessel = [];

  const kandidaten = Maze.wegKacheln(labyrinth).filter(k => {
    const d = entfernung[k.y * labyrinth.breite + k.x];
    return d > maxEntfernung * 0.35;
  });

  // Liste mischen (Fisher-Yates-Verfahren)
  for (let i = kandidaten.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]];
  }

  let mindestAbstand = 7;

  while (schluessel.length < anzahl && mindestAbstand > 0) {
    for (const k of kandidaten) {
      if (schluessel.length >= anzahl) break;

      // nicht direkt auf den Ausgang legen
      if (Math.hypot(k.x - ausgang.x, k.y - ausgang.y) < 3) continue;

      const zuNah = schluessel.some(s =>
        Math.hypot(s.x - k.x, s.y - k.y) < mindestAbstand);
      if (zuNah) continue;

      schluessel.push({ x: k.x, y: k.y, eingesammelt: false, phase: Math.random() * 6.28 });
    }
    mindestAbstand -= 2;      // notfalls Bedingung lockern
  }
}

/** Staubkoerner, die traege durch das Licht schweben. */
function staubErzeugen() {
  staub = [];
  for (let i = 0; i < 90; i++) {
    staub.push({
      x: Math.random() * labyrinth.breite * TILE,
      y: Math.random() * labyrinth.hoehe * TILE,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      groesse: Math.random() * 1.5 + 0.4,
      alpha: Math.random() * 0.5 + 0.15
    });
  }
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt) {
  if (zustand === 'menue') { menueHintergrundUpdate(dt); return; }
  if (zustand !== 'spiel') return;

  spielZeit += dt;

  Player.update(dt, labyrinth, tasten, TILE);
  Enemy.update(dt, labyrinth, TILE);

  sichtMerken();
  schluesselPruefen();
  ausgangPruefen();
  spannungUpdate(dt);
  staubUpdate(dt);
  kameraUpdate(dt);

  // Erwischt?
  if (Enemy.hatSpielerErwischt()) sterben();

  if (verschlossenTimer > 0) verschlossenTimer -= dt;
  if (ruettelStaerke > 0) ruettelStaerke = Math.max(0, ruettelStaerke - dt * 14);
}

function schluesselPruefen() {
  for (const s of schluessel) {
    if (s.eingesammelt) continue;

    const sx = (s.x + 0.5) * TILE;
    const sy = (s.y + 0.5) * TILE;
    if (Math.hypot(Player.x - sx, Player.y - sy) < TILE * 0.6) {
      s.eingesammelt = true;
      gesammelt++;
      Sound.aufsammeln();

      const fehlt = schluessel.length - gesammelt;
      zeigeMeldung(fehlt === 0
        ? 'Alle Schluessel - finde den Ausgang'
        : 'Schluessel gefunden - noch ' + fehlt);
    }
  }
}

function ausgangPruefen() {
  const ax = (ausgang.x + 0.5) * TILE;
  const ay = (ausgang.y + 0.5) * TILE;
  if (Math.hypot(Player.x - ax, Player.y - ay) > TILE * 0.7) return;

  if (gesammelt >= schluessel.length) {
    gewinnen();
  } else if (verschlossenTimer <= 0) {
    Sound.verschlossen();
    zeigeMeldung('Verschlossen - dir fehlen ' + (schluessel.length - gesammelt) + ' Schluessel');
    verschlossenTimer = 1.6;
  }
}

/** Herzschlag und Klangfarbe richten sich nach der Naehe des Monsters. */
function spannungUpdate(dt) {
  const abstand = Math.hypot(Player.x - Enemy.x, Player.y - Enemy.y);
  const jagt = Enemy.zustand === 'jagd';

  // 0 = sicher, 1 = direkt hinter dir
  let naehe = Math.max(0, 1 - abstand / 420);
  if (jagt) naehe = Math.max(naehe, 0.55);

  Sound.spannung(naehe);

  if (naehe > 0.18) {
    herzTimer -= dt;
    if (herzTimer <= 0) {
      Sound.herzschlag(Math.min(1, naehe * 1.3));
      herzTimer = 1.15 - naehe * 0.75;      // je naeher, desto schneller
    }
  }

  // Bildschirm wackelt, wenn es dich jagt und nah ist
  if (jagt && abstand < 220) {
    ruettelStaerke = Math.max(ruettelStaerke, (1 - abstand / 220) * 4.5);
  }

  gefahrAnzeige.classList.toggle('versteckt', !jagt);
}

function staubUpdate(dt) {
  for (const k of staub) {
    k.x += k.vx * dt;
    k.y += k.vy * dt;

    // Zu weit weg? Dann in der Naehe des Spielers neu setzen.
    if (Math.abs(k.x - Player.x) > 700 || Math.abs(k.y - Player.y) > 700) {
      k.x = Player.x + (Math.random() - 0.5) * 900;
      k.y = Player.y + (Math.random() - 0.5) * 900;
    }
  }
}

function kameraUpdate(dt) {
  // Die Kamera schaut ein Stueck in Blickrichtung voraus.
  const vorschau = 55;
  const zielX = Player.x + Player.blickX * vorschau - window.innerWidth / 2;
  const zielY = Player.y + Player.blickY * vorschau - window.innerHeight / 2;

  // Lerp (lineare Interpolation): pro Bild nur ein Teil der Strecke.
  // Das ergibt eine sanft nachziehende Kamera statt harter Spruenge.
  kamera.x += (zielX - kamera.x) * Math.min(1, dt * 5);
  kamera.y += (zielY - kamera.y) * Math.min(1, dt * 5);
}

/*
  HINWEIS: Die Kamera wird absichtlich NICHT am Labyrinthrand
  gestoppt. Der Spieler bleibt dadurch immer in der Bildmitte -
  also im hellsten Bereich der Vignette. Dass man am Rand
  theoretisch "aus der Karte" schauen kann, faellt nicht auf,
  weil dort ohnehin alles im Dunkeln liegt.
*/

/* ============================================================
   ZEICHNEN
   ============================================================ */
function zeichne() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Hintergrund in Wandfarbe statt Schwarz: dadurch sieht der Bereich
  // AUSSERHALB des Labyrinths wie massives Gestein aus. Mit reinem
  // Schwarz waere am Kartenrand eine harte Kante zu sehen.
  ctx.fillStyle = 'rgb(70, 78, 106)';
  ctx.fillRect(0, 0, w, h);

  if (!labyrinth) return;

  // Wackeln wird in die Kameraposition eingerechnet, damit ALLES
  // (auch das Licht) gemeinsam wackelt.
  const kamEff = {
    x: kamera.x + (Math.random() - 0.5) * ruettelStaerke,
    y: kamera.y + (Math.random() - 0.5) * ruettelStaerke
  };

  // ---- 1) Die Welt ----
  ctx.save();
  ctx.translate(-kamEff.x, -kamEff.y);

  zeichneLabyrinth(kamEff);

  if (zustand !== 'menue') {
    zeichneAusgang();
    zeichneSchluessel();
    Enemy.zeichne(ctx);
    Player.zeichne(ctx);
    zeichneStaub();
  }

  ctx.restore();

  // ---- 2) Dunkelheit darueberlegen ----
  const kegel = baueLicht(kamEff, w, h);
  ctx.drawImage(lichtCanvas, 0, 0, w, h);

  // ---- 3) Warmer Schein der Taschenlampe (additiv) ----
  if (zustand !== 'menue' && kegel) {
    zeichneLichtFarbe(kegel, kamEff);
  }

  // ---- 4) Augen des Monsters - NACH der Dunkelheit! ----
  if (zustand !== 'menue') zeichneMonsterAugen(kamEff);

  // ---- 5) Bildlook ----
  zeichneVignette(w, h);
  zeichneKoernung(w, h);
  zeichneMinikarte(w, h);
}

/* ---------- Boden und Waende ---------- */
function zeichneLabyrinth(kamEff) {
  // CULLING: nur zeichnen, was gerade im Bild ist.
  const vonX = Math.max(0, Math.floor(kamEff.x / TILE) - 1);
  const vonY = Math.max(0, Math.floor(kamEff.y / TILE) - 1);
  const bisX = Math.min(labyrinth.breite - 1, Math.ceil((kamEff.x + window.innerWidth)  / TILE));
  const bisY = Math.min(labyrinth.hoehe  - 1, Math.ceil((kamEff.y + window.innerHeight) / TILE));

  for (let y = vonY; y <= bisY; y++) {
    for (let x = vonX; x <= bisX; x++) {

      const px = x * TILE;
      const py = y * TILE;
      const zufall = Maze.kachelZufall(x, y);

      // WICHTIG: Die Farben hier sind absichtlich recht HELL.
      // Die Dunkelheit entsteht spaeter durch die Nebelschicht.
      // Waeren die Grundfarben schon fast schwarz, wuerde man auch
      // im Lichtkegel nichts erkennen.
      if (labyrinth.grid[y][x] === Maze.WAND) {
        // Wand - jeder Stein leicht anders hell
        ctx.fillStyle = 'rgb(' + Math.round(70 + zufall * 18) + ',' +
                                 Math.round(78 + zufall * 18) + ',' +
                                 Math.round(106 + zufall * 22) + ')';
        ctx.fillRect(px, py, TILE, TILE);

        // Fuge in der Mitte -> sieht nach gemauerten Bloecken aus
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(px, py + TILE * 0.5 - 1, TILE, 2);
        ctx.fillRect(px + TILE * 0.5 - 1, py, 2, TILE * 0.5);
        ctx.fillRect(px + (zufall > 0.5 ? TILE * 0.25 : TILE * 0.75) - 1,
                     py + TILE * 0.5, 2, TILE * 0.5);

        // Grenzt unten Boden an? Dann helle Vorderkante -> wirkt raeumlich
        if (!Maze.istWand(labyrinth, x, y + 1)) {
          ctx.fillStyle = 'rgba(150, 175, 235, 0.22)';
          ctx.fillRect(px, py + TILE - 5, TILE, 5);
        }
        // Oberkante dunkel = Schattenkante
        if (!Maze.istWand(labyrinth, x, y - 1)) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(px, py, TILE, 4);
        }

      } else {
        // Boden
        ctx.fillStyle = 'rgb(' + Math.round(44 + zufall * 11) + ',' +
                                 Math.round(49 + zufall * 11) + ',' +
                                 Math.round(67 + zufall * 14) + ')';
        ctx.fillRect(px, py, TILE, TILE);

        // Fugen zwischen den Bodenplatten
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);

        // vereinzelt Flecken und Risse
        if (zufall > 0.82) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.fillRect(px + 6 + zufall * 18, py + 8 + ((zufall * 97) % 20), 7, 4);
        }
      }
    }
  }
}

/* ---------- Ausgang ---------- */
function zeichneAusgang() {
  const x = ausgang.x * TILE;
  const y = ausgang.y * TILE;
  const offen = gesammelt >= schluessel.length;
  const puls = 0.6 + Math.sin(spielZeit * 2.4) * 0.4;

  const farbe = offen ? '90, 240, 170' : '210, 70, 70';

  const schein = ctx.createRadialGradient(x + TILE / 2, y + TILE / 2, 0,
                                          x + TILE / 2, y + TILE / 2, TILE * 1.9);
  schein.addColorStop(0, 'rgba(' + farbe + ', ' + (0.4 * puls) + ')');
  schein.addColorStop(1, 'rgba(' + farbe + ', 0)');
  ctx.fillStyle = schein;
  ctx.fillRect(x - TILE * 1.5, y - TILE * 1.5, TILE * 4, TILE * 4);

  ctx.strokeStyle = 'rgba(' + farbe + ', 0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 6, y + 6, TILE - 12, TILE - 12);

  ctx.fillStyle = 'rgba(' + farbe + ', ' + (0.18 + puls * 0.15) + ')';
  ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
}

/* ---------- Schluessel ---------- */
function zeichneSchluessel() {
  for (const s of schluessel) {
    if (s.eingesammelt) continue;

    const x = (s.x + 0.5) * TILE;
    // Schweben: langsam auf und ab
    const y = (s.y + 0.5) * TILE + Math.sin(spielZeit * 2 + s.phase) * 3.5;

    const schein = ctx.createRadialGradient(x, y, 0, x, y, 34);
    schein.addColorStop(0, 'rgba(255, 210, 120, 0.5)');
    schein.addColorStop(1, 'rgba(255, 210, 120, 0)');
    ctx.fillStyle = schein;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();

    // Schluesselform: Ring + Bart
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y - 3, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x, y + 8);
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x + 4, y + 5);
    ctx.stroke();
  }
}

/* ---------- Staub ---------- */
function zeichneStaub() {
  for (const k of staub) {
    ctx.fillStyle = 'rgba(190, 210, 255, ' + k.alpha + ')';
    ctx.fillRect(k.x, k.y, k.groesse, k.groesse);
  }
}

/* ============================================================
   NEBEL DES KRIEGES
   ------------------------------------------------------------
   Wir merken uns in einem Array, welche Kacheln der Spieler
   schon einmal GESEHEN hat (nicht: betreten). Auf der Karte
   unten rechts erscheint nur dieser Teil des Labyrinths.

   Das Array ist eine Uint8Array - ein Array, das pro Eintrag
   nur ein Byte belegt. Fuer 0/1-Werte reicht das voellig und
   es ist deutlich sparsamer als ein normales Array.
   ============================================================ */
let gesehen = null;

function sichtMerken() {
  // Der Lichtkegel...
  faecherMerken(Player.blickWinkel(), KEGEL_OEFFNUNG, 42, STUFEN[stufe].lampenWeite);
  // ...und der Nahbereich rundherum
  faecherMerken(0, Math.PI * 2, 22, 104);
}

/**
 * Schickt Strahlen los und markiert jede Kachel, durch die sie
 * fliegen, als "gesehen". Weniger Strahlen als beim Zeichnen -
 * fuer die Karte reicht das voellig.
 */
function faecherMerken(mitteWinkel, oeffnung, strahlen, weite) {
  const start = mitteWinkel - oeffnung / 2;
  const schritt = oeffnung / (strahlen - 1);

  for (let i = 0; i < strahlen; i++) {
    const winkel = start + i * schritt;
    const dx = Math.cos(winkel);
    const dy = Math.sin(winkel);

    const treffer = Raycast.strahl(labyrinth, Player.x, Player.y, dx, dy, weite, TILE);

    // Am Strahl entlang alle durchquerten Kacheln markieren.
    // +TILE, damit auch die Wand am Ende auf der Karte auftaucht.
    for (let s = 0; s <= treffer + TILE; s += TILE * 0.4) {
      merke(Math.floor((Player.x + dx * s) / TILE),
            Math.floor((Player.y + dy * s) / TILE));
    }
  }
}

function merke(kx, ky) {
  if (kx < 0 || ky < 0 || kx >= labyrinth.breite || ky >= labyrinth.hoehe) return;
  gesehen[ky * labyrinth.breite + kx] = 1;
}

function istGesehen(kx, ky) {
  return gesehen[ky * labyrinth.breite + kx] === 1;
}

/* ---------- Die Karte unten rechts ---------- */
function zeichneMinikarte(w, h) {
  if (zustand !== 'spiel') return;

  // Massstab so waehlen, dass die Karte etwa 165 Pixel breit wird
  const skala = Math.max(2, Math.round(165 / labyrinth.breite));
  const kBreite = labyrinth.breite * skala;
  const kHoehe  = labyrinth.hoehe  * skala;
  const ox = w - kBreite - 22;
  const oy = h - kHoehe - 22;

  // Rahmen
  ctx.fillStyle = 'rgba(6, 8, 14, 0.72)';
  ctx.fillRect(ox - 8, oy - 8, kBreite + 16, kHoehe + 16);
  ctx.strokeStyle = 'rgba(120, 140, 200, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - 8.5, oy - 8.5, kBreite + 17, kHoehe + 17);

  // Nur bereits gesehene Kacheln zeichnen
  for (let y = 0; y < labyrinth.hoehe; y++) {
    for (let x = 0; x < labyrinth.breite; x++) {
      if (!istGesehen(x, y)) continue;

      ctx.fillStyle = labyrinth.grid[y][x] === Maze.WAND
        ? 'rgba(105, 125, 180, 0.30)'
        : 'rgba(150, 180, 240, 0.13)';
      ctx.fillRect(ox + x * skala, oy + y * skala, skala, skala);
    }
  }

  // Schluessel - aber nur, wenn man die Stelle schon gesehen hat
  for (const s of schluessel) {
    if (s.eingesammelt || !istGesehen(s.x, s.y)) continue;
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(ox + s.x * skala - 1, oy + s.y * skala - 1, skala + 2, skala + 2);
  }

  // Ausgang
  if (istGesehen(ausgang.x, ausgang.y)) {
    ctx.fillStyle = gesammelt >= schluessel.length ? '#5af0aa' : '#d24646';
    ctx.fillRect(ox + ausgang.x * skala - 1, oy + ausgang.y * skala - 1, skala + 2, skala + 2);
  }

  // Der Spieler - blinkt leicht, damit man ihn sofort findet
  const puls = 0.55 + Math.sin(spielZeit * 5) * 0.45;
  ctx.fillStyle = 'rgba(140, 210, 255, ' + puls + ')';
  const psx = ox + (Player.x / TILE) * skala;
  const psy = oy + (Player.y / TILE) * skala;
  ctx.fillRect(psx - 2, psy - 2, 4, 4);
}

/* ============================================================
   LICHT UND DUNKELHEIT
   ------------------------------------------------------------
   Wir malen eine fast komplett schwarze Flaeche und stanzen mit
   'destination-out' das Sichtfeld heraus. Der Verlauf sorgt dafuer,
   dass das Licht nach aussen weich ausblendet.
   ============================================================ */
function baueLicht(kamEff, w, h) {
  lichtCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lichtCtx.globalCompositeOperation = 'source-over';
  lichtCtx.clearRect(0, 0, w, h);

  // Im Menue nur ein sanfter Schleier, im Spiel fast voellige Finsternis
  lichtCtx.fillStyle = zustand === 'menue' ? 'rgba(0,0,0,0.93)' : 'rgba(0,0,0,0.985)';
  lichtCtx.fillRect(0, 0, w, h);

  lichtCtx.globalCompositeOperation = 'destination-out';

  if (zustand === 'menue') {
    lochStanzen(null, geist.x - kamEff.x, geist.y - kamEff.y, 260,
                [[0, 0.85], [0.5, 0.45], [1, 0]], kamEff);
    lichtCtx.globalCompositeOperation = 'source-over';
    return null;
  }

  const px = Player.x - kamEff.x;
  const py = Player.y - kamEff.y;

  // Flackern: zwei ueberlagerte Sinuswellen mit ungeraden Frequenzen
  // wirken unregelmaessiger als eine einzelne.
  const flackern = 1
    + Math.sin(spielZeit * 13.3) * 0.022
    + Math.sin(spielZeit * 31.7) * 0.014;

  const reichweite = STUFEN[stufe].lampenWeite * flackern;

  // ---- Der Kegel der Taschenlampe ----
  const kegel = Raycast.sichtPolygon(labyrinth, Player.x, Player.y,
                                     Player.blickWinkel(), KEGEL_OEFFNUNG,
                                     KEGEL_STRAHLEN, reichweite, TILE);
  lochStanzen(kegel, px, py, reichweite,
              [[0, 1], [0.45, 0.96], [0.8, 0.5], [1, 0]], kamEff);

  // ---- Schwacher Rundumschein direkt um den Spieler ----
  const nah = Raycast.sichtPolygon(labyrinth, Player.x, Player.y,
                                   0, Math.PI * 2, 64, 104, TILE);
  lochStanzen(nah, px, py, 104,
              [[0, 0.93], [0.5, 0.55], [1, 0]], kamEff);

  lichtCtx.globalCompositeOperation = 'source-over';
  return kegel;
}

/**
 * Stanzt ein Loch in die Dunkelheit.
 *
 * @param {Array|null} polygon  Sichtpolygon in Weltkoordinaten
 *                              (null = einfacher runder Schein)
 * @param {number} cx,cy        Mittelpunkt des Verlaufs in Bildschirmpixeln
 * @param {Array}  stops        Farbverlauf als [[position, alpha], ...]
 * @param {object} kamEff       Kameraposition zum Umrechnen Welt -> Bildschirm
 */
function lochStanzen(polygon, cx, cy, radius, stops, kamEff) {
  lichtCtx.save();

  if (polygon) {
    lichtCtx.beginPath();
    lichtCtx.moveTo(polygon[0].x - kamEff.x, polygon[0].y - kamEff.y);
    for (let i = 1; i < polygon.length; i++) {
      lichtCtx.lineTo(polygon[i].x - kamEff.x, polygon[i].y - kamEff.y);
    }
    lichtCtx.closePath();
    lichtCtx.clip();          // ab jetzt wird nur INNERHALB gemalt
  }

  const verlauf = lichtCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (const [pos, alpha] of stops) {
    verlauf.addColorStop(pos, 'rgba(0,0,0,' + alpha + ')');
  }
  lichtCtx.fillStyle = verlauf;
  lichtCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  lichtCtx.restore();
}

/** Legt einen warmen Schimmer in den Lichtkegel (additive Mischung). */
function zeichneLichtFarbe(kegel, kamEff) {
  const px = Player.x - kamEff.x;
  const py = Player.y - kamEff.y;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.beginPath();
  ctx.moveTo(kegel[0].x - kamEff.x, kegel[0].y - kamEff.y);
  for (let i = 1; i < kegel.length; i++) {
    ctx.lineTo(kegel[i].x - kamEff.x, kegel[i].y - kamEff.y);
  }
  ctx.closePath();
  ctx.clip();

  const r = STUFEN[stufe].lampenWeite;
  const verlauf = ctx.createRadialGradient(px, py, 0, px, py, r);
  verlauf.addColorStop(0,   'rgba(255, 216, 150, 0.24)');
  verlauf.addColorStop(0.5, 'rgba(255, 190, 120, 0.11)');
  verlauf.addColorStop(1,   'rgba(255, 170, 90, 0)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);

  ctx.restore();
}

/** Die Augen leuchten auch durch die Dunkelheit - aber nicht durch Waende. */
function zeichneMonsterAugen(kamEff) {
  const abstand = Math.hypot(Player.x - Enemy.x, Player.y - Enemy.y);
  if (abstand > 620) return;
  if (!Raycast.sichtlinie(labyrinth, Player.x, Player.y, Enemy.x, Enemy.y, TILE)) return;

  Enemy.zeichneAugen(ctx, kamEff, TILE);
}

/* ---------- Vignette ---------- */
function zeichneVignette(w, h) {
  const verlauf = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42,
                                           w / 2, h / 2, Math.max(w, h) * 0.8);
  verlauf.addColorStop(0, 'rgba(0,0,0,0)');
  verlauf.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, w, h);
}

/* ---------- Filmkorn ---------- */
// Wir bauen EINMAL eine kleine Rauschkachel und wiederholen sie als
// Muster. Jedes Bild neu zu wuerfeln waere viel zu langsam.
let koernungMuster = null;

function koernungBauen() {
  const gr = 140;
  const c = document.createElement('canvas');
  c.width = gr; c.height = gr;
  const cc = c.getContext('2d');
  const bild = cc.createImageData(gr, gr);

  for (let i = 0; i < bild.data.length; i += 4) {
    const wert = Math.random() * 255;
    bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = wert;
    bild.data[i + 3] = 255;
  }
  cc.putImageData(bild, 0, 0);
  koernungMuster = ctx.createPattern(c, 'repeat');
}

function zeichneKoernung(w, h) {
  if (!koernungMuster) return;
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.globalCompositeOperation = 'overlay';
  // Muster jedes Bild leicht verschieben -> es "rauscht"
  ctx.translate(Math.random() * 140, Math.random() * 140);
  ctx.fillStyle = koernungMuster;
  ctx.fillRect(-140, -140, w + 280, h + 280);
  ctx.restore();
}

/* ============================================================
   MENUE-HINTERGRUND
   Ein Irrlicht, das langsam durch das Labyrinth schwebt.
   ============================================================ */
const geist = { x: 0, y: 0, t: 0 };

function menueHintergrundUpdate(dt) {
  geist.t += dt * 0.12;

  const w = labyrinth.breite * TILE;
  const h = labyrinth.hoehe * TILE;

  // Lissajous-Bahn: zwei Sinuswellen mit verschiedenen Frequenzen
  // ergeben eine weiche, nie ganz gleiche Schleife.
  geist.x = w * 0.5 + Math.sin(geist.t) * w * 0.32;
  geist.y = h * 0.5 + Math.sin(geist.t * 1.37) * h * 0.32;

  kamera.x += ((geist.x - window.innerWidth / 2) - kamera.x) * Math.min(1, dt * 0.8);
  kamera.y += ((geist.y - window.innerHeight / 2) - kamera.y) * Math.min(1, dt * 0.8);

}

/* ============================================================
   HUD
   ============================================================ */
const hudElement        = document.getElementById('hud');
const hudZeit           = document.getElementById('hud-zeit');
const hudSchluessel     = document.getElementById('hud-schluessel');
const hudSchluesselMax  = document.getElementById('hud-schluessel-max');
const hudAusdauer       = document.getElementById('hud-ausdauer');
const gefahrAnzeige     = document.getElementById('gefahr');
const meldungElement    = document.getElementById('meldung');

let meldungTimer = null;

function zeigeMeldung(text) {
  meldungElement.textContent = text;
  meldungElement.classList.add('sichtbar');
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => {
    meldungElement.classList.remove('sichtbar');
  }, 2200);
}

function hudUpdate() {
  if (zustand !== 'spiel') return;
  hudZeit.textContent = spielZeit.toFixed(1);
  hudSchluessel.textContent = gesammelt;
  hudAusdauer.style.width = (Player.ausdauer * 100) + '%';
  hudAusdauer.classList.toggle('leer', Player.erschoepft);
}

/* ============================================================
   SPIELZUSTAENDE
   ============================================================ */
const menueOverlay = document.getElementById('menue');
const todOverlay   = document.getElementById('tod');
const siegOverlay  = document.getElementById('sieg');
const pauseOverlay = document.getElementById('pause');

function alleOverlaysAus() {
  menueOverlay.classList.add('versteckt');
  todOverlay.classList.add('versteckt');
  siegOverlay.classList.add('versteckt');
  pauseOverlay.classList.add('versteckt');
}

function starten() {
  Sound.init();
  Sound.ambientStarten();

  neuesSpiel();
  alleOverlaysAus();
  hudElement.classList.remove('versteckt');
  zustand = 'spiel';

  zeigeMeldung('Finde ' + schluessel.length + ' Schluessel');
}

function sterben() {
  if (zustand !== 'spiel') return;
  zustand = 'tot';
  Player.lebt = false;
  Sound.tod();

  hudElement.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');

  document.getElementById('tod-text').innerHTML =
    'Du hast <b>' + gesammelt + ' von ' + schluessel.length + '</b> Schluesseln gefunden.<br>' +
    'Ueberlebt: ' + spielZeit.toFixed(1) + ' Sekunden.';

  todOverlay.classList.remove('versteckt');
}

function gewinnen() {
  if (zustand !== 'spiel') return;
  zustand = 'sieg';
  Sound.sieg();

  hudElement.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');

  const zeit = spielZeit;
  const bisher = bestzeitLesen(stufe);
  let text = 'Zeit: <b>' + zeit.toFixed(1) + ' Sekunden</b>';

  if (bisher === null || zeit < bisher) {
    bestzeitSchreiben(stufe, zeit);
    text += '<br>Neue Bestzeit!';
  } else {
    text += '<br>Deine Bestzeit: ' + bisher.toFixed(1) + ' s';
  }

  document.getElementById('sieg-text').innerHTML = text;
  siegOverlay.classList.remove('versteckt');
  bestzeitAnzeigen();
}

function pausieren() {
  zustand = 'pause';
  hudElement.classList.add('versteckt');
  pauseOverlay.classList.remove('versteckt');
}

function fortsetzen() {
  zustand = 'spiel';
  pauseOverlay.classList.add('versteckt');
  hudElement.classList.remove('versteckt');
}

function zumMenue() {
  zustand = 'menue';
  Sound.ambientStoppen();
  alleOverlaysAus();
  hudElement.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');
  menueOverlay.classList.remove('versteckt');
  neuesSpiel();                 // frisches Labyrinth als Hintergrund
  bestzeitAnzeigen();
}

/* ============================================================
   BESTZEIT (localStorage)
   ------------------------------------------------------------
   localStorage speichert Text dauerhaft im Browser - auch nach
   dem Schliessen des Tabs. Es kann nur Strings, deshalb wandeln
   wir die Zahl beim Lesen und Schreiben um.
   ============================================================ */
function bestzeitSchluessel(s) {
  return 'schattenlabyrinth_bestzeit_' + s;
}

function bestzeitLesen(s) {
  try {
    const wert = localStorage.getItem(bestzeitSchluessel(s));
    return wert === null ? null : parseFloat(wert);
  } catch (e) {
    return null;      // z.B. wenn der Browser Speichern verbietet
  }
}

function bestzeitSchreiben(s, zeit) {
  try {
    localStorage.setItem(bestzeitSchluessel(s), zeit.toFixed(2));
  } catch (e) { /* dann eben nicht */ }
}

function bestzeitAnzeigen() {
  const zeit = bestzeitLesen(stufe);
  document.getElementById('menue-bestzeit').innerHTML =
    zeit === null
      ? 'Noch keine Bestzeit auf ' + STUFEN[stufe].name
      : 'Bestzeit ' + STUFEN[stufe].name + ': <b>' + zeit.toFixed(1) + ' s</b>';
}

/* ============================================================
   KNOEPFE
   ============================================================ */
document.querySelectorAll('.stufe').forEach(knopf => {
  knopf.addEventListener('click', () => {
    document.querySelectorAll('.stufe').forEach(k => k.classList.remove('aktiv'));
    knopf.classList.add('aktiv');
    stufe = knopf.dataset.stufe;
    neuesSpiel();               // Hintergrund an die neue Groesse anpassen
    bestzeitAnzeigen();
  });
});

document.getElementById('start-knopf').addEventListener('click', starten);
document.getElementById('weiter-knopf').addEventListener('click', fortsetzen);

document.querySelectorAll('[data-neustart]').forEach(k =>
  k.addEventListener('click', starten));

document.querySelectorAll('[data-menue]').forEach(k =>
  k.addEventListener('click', zumMenue));

/* ============================================================
   DER GAME LOOP
   ============================================================ */
let letzteZeit = performance.now();

function schleife(jetzt) {
  // dt = "delta time" = Sekunden seit dem letzten Bild.
  let dt = (jetzt - letzteZeit) / 1000;
  letzteZeit = jetzt;

  // Sicherheitsgrenze: Nach einem Tab-Wechsel kann dt riesig werden.
  // Ohne die Grenze wuerde der Spieler in einem Bild durch eine Wand
  // teleportieren.
  if (dt > 0.05) dt = 0.05;

  update(dt);
  zeichne();
  hudUpdate();

  requestAnimationFrame(schleife);
}

/* ============================================================
   START
   ============================================================ */
canvasAnpassen();
neuesSpiel();
bestzeitAnzeigen();
requestAnimationFrame(schleife);
