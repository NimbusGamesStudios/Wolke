/* ============================================================
   spiel.js  -  Steuert das ganze Spiel
   ------------------------------------------------------------
   Game Loop, Spielzustaende, Kamera, HUD und Karte.

   Der Unterschied zur 2D-Version steckt fast nur im Zeichnen.
   Die Spielwelt selbst - Labyrinth, Wegfindung, Gegner-KI,
   Schluessel - ist dieselbe. Das ist der Vorteil davon, Logik
   und Darstellung getrennt zu halten.
   ============================================================ */

// Version des Spiels. Muss zur "version" in info.json passen -
// katalog_bauen.py prueft das und warnt, wenn es auseinanderlaeuft.
const SPIEL_VERSION = '1.2.0';

// ---------- Grundeinstellungen ----------
const TILE = 64;                 // Kachelgroesse in Welteinheiten
const RENDER_BREITE = 480;       // interne Aufloesung (wird hochskaliert)

const STUFEN = {
  leicht: {
    name: 'Leicht',
    zellenX: 10, zellenY: 8, schluessel: 2,
    monsterTempo: 84, sichtWeite: 380, schonfrist: 10,
    lampenWeite: 6.0, grundlicht: 0.09, kegelStaerke: 1.1, sichtfeld: 0.72
  },
  normal: {
    name: 'Normal',
    zellenX: 13, zellenY: 10, schluessel: 3,
    monsterTempo: 108, sichtWeite: 460, schonfrist: 7,
    lampenWeite: 4.6, grundlicht: 0.055, kegelStaerke: 1.35, sichtfeld: 0.72
  },
  albtraum: {
    name: 'Albtraum',
    zellenX: 17, zellenY: 13, schluessel: 4,
    monsterTempo: 136, sichtWeite: 560, schonfrist: 4,
    lampenWeite: 3.6, grundlicht: 0.03, kegelStaerke: 1.6, sichtfeld: 0.72
  }
};

let stufe = 'normal';

// ---------- Canvas ----------
const canvas = document.getElementById('spielfeld');
const ctx = canvas.getContext('2d');

let renderHoehe = 270;

function canvasAnpassen() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  // Interne Aufloesung mit demselben Seitenverhaeltnis wie das Fenster,
  // damit nichts verzerrt wird.
  renderHoehe = Math.max(120, Math.round(RENDER_BREITE * h / w));
  Raycaster3D.init(RENDER_BREITE, renderHoehe);

  koernungBauen();
}
window.addEventListener('resize', canvasAnpassen);

// ---------- Spielzustand ----------
let zustand = 'menue';
let labyrinth = null;
let spielZeit = 0;

let schluessel = [];
let gesammelt = 0;
let ausgang = { x: 0, y: 0 };

let gesehen = null;              // Nebel des Krieges
let herzTimer = 0;
let verschlossenTimer = 0;
let ruettelStaerke = 0;

const tasten = {};

/* ============================================================
   EINGABE
   ============================================================ */
let karteSichtbar = true;

window.addEventListener('keydown', (e) => {
  const taste = e.key.toLowerCase();
  tasten[taste] = true;

  // M blendet die Karte aus - fuer alle, die es sich schwerer machen wollen
  if (taste === 'm' && zustand === 'spiel') {
    karteSichtbar = !karteSichtbar;
    zeigeMeldung(karteSichtbar ? 'Karte an' : 'Karte aus');
  }

  if (e.key.startsWith('Arrow')) e.preventDefault();
  if (e.key === ' ') e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  tasten[e.key.toLowerCase()] = false;
});

/* ---------- Maussteuerung ueber Pointer Lock ----------
   Pointer Lock versteckt den Mauszeiger und liefert stattdessen
   nur noch die BEWEGUNG der Maus (movementX). Dadurch kann man
   sich endlos weiterdrehen, ohne dass der Zeiger am Bildschirmrand
   anstoesst. Browser erlauben das nur nach einem Klick. */
const klickHinweis = document.getElementById('klick-hinweis');

let mausGesperrt = false;

/**
 * Fordert Pointer Lock an. Das kann fehlschlagen - zum Beispiel,
 * wenn die Seite in einem Rahmen (iframe) laeuft. Deshalb faengt
 * die Funktion den Fehler ab, statt das Spiel abstuerzen zu lassen.
 * Ohne Lock funktioniert die Maus trotzdem, sie stoesst nur am
 * Bildschirmrand an.
 */
function mausSperren() {
  if (zustand !== 'spiel') return;
  try {
    const ergebnis = canvas.requestPointerLock();
    // Neuere Browser liefern ein Promise zurueck
    if (ergebnis && typeof ergebnis.catch === 'function') {
      ergebnis.catch(() => { mausGesperrt = false; });
    }
  } catch (e) {
    mausGesperrt = false;
  }
}

canvas.addEventListener('click', mausSperren);
klickHinweis.addEventListener('click', mausSperren);

document.addEventListener('pointerlockchange', () => {
  mausGesperrt = (document.pointerLockElement === canvas);
  klickHinweis.classList.toggle('versteckt', mausGesperrt || zustand !== 'spiel');

  // Maus wurde waehrend des Spiels freigegeben (meist per Esc)
  // -> das werten wir als Pause.
  if (!mausGesperrt && zustand === 'spiel') pausieren();
});

document.addEventListener('mousemove', (e) => {
  if (zustand !== 'spiel') return;

  // movementX/movementY gibt es auch OHNE Pointer Lock. Damit
  // funktioniert das Umsehen zur Not auch dann, wenn der Browser
  // die Maus nicht einfangen darf.
  Spieler.drehen(e.movementX * 0.0023);

  // Hoch- und Runterschauen: nur die Bildmitte verschieben.
  // Echtes Kippen kann ein Raycaster nicht - das faellt aber
  // kaum auf, solange man nicht extrem weit schaut.
  Spieler.neigung = Math.max(-renderHoehe * 0.32,
                     Math.min(renderHoehe * 0.32,
                       Spieler.neigung - e.movementY * 0.5));
});

/* ============================================================
   NEUES SPIEL
   ============================================================ */
function neuesSpiel() {
  const s = STUFEN[stufe];

  labyrinth = Maze.generate(s.zellenX, s.zellenY);
  Maze.schleifenEinbauen(labyrinth, 0.09);

  const start = Maze.zufaelligeWegKachel(labyrinth);
  Spieler.setzeAufKachel(start.x, start.y, TILE);

  // In eine freie Richtung schauen lassen
  const richtungen = [
    { dx: 1, dy: 0, w: 0 },
    { dx: 0, dy: 1, w: Math.PI / 2 },
    { dx: -1, dy: 0, w: Math.PI },
    { dx: 0, dy: -1, w: -Math.PI / 2 }
  ];
  const frei = richtungen.find(r => !Maze.istWand(labyrinth, start.x + r.dx, start.y + r.dy));
  Spieler.winkel = frei ? frei.w : 0;

  const entfernung = Pathfinding.entfernungsKarte(labyrinth, start.x, start.y);
  let maxEntfernung = 0;
  for (const k of Maze.wegKacheln(labyrinth)) {
    const d = entfernung[k.y * labyrinth.breite + k.x];
    if (d > maxEntfernung) maxEntfernung = d;
  }

  ausgangPlatzieren(entfernung, maxEntfernung);
  schluesselPlatzieren(entfernung, maxEntfernung, s.schluessel);

  Gegner.reset(labyrinth, TILE, start.x, start.y, s);

  gesammelt = 0;
  spielZeit = 0;
  herzTimer = 0;
  verschlossenTimer = 0;
  ruettelStaerke = 0;
  gesehen = new Uint8Array(labyrinth.breite * labyrinth.hoehe);

  hudSchluesselMax.textContent = '/' + s.schluessel;
}

function ausgangPlatzieren(entfernung, maxEntfernung) {
  for (const k of Maze.wegKacheln(labyrinth)) {
    if (entfernung[k.y * labyrinth.breite + k.x] === maxEntfernung) {
      ausgang = { x: k.x, y: k.y };
      return;
    }
  }
}

function schluesselPlatzieren(entfernung, maxEntfernung, anzahl) {
  schluessel = [];

  const kandidaten = Maze.wegKacheln(labyrinth).filter(k =>
    entfernung[k.y * labyrinth.breite + k.x] > maxEntfernung * 0.3);

  // Fisher-Yates: Liste zufaellig mischen
  for (let i = kandidaten.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]];
  }

  let mindestAbstand = 6;
  while (schluessel.length < anzahl && mindestAbstand > 0) {
    for (const k of kandidaten) {
      if (schluessel.length >= anzahl) break;
      if (Math.hypot(k.x - ausgang.x, k.y - ausgang.y) < 3) continue;
      if (schluessel.some(s => Math.hypot(s.x - k.x, s.y - k.y) < mindestAbstand)) continue;

      schluessel.push({ x: k.x, y: k.y, eingesammelt: false, phase: Math.random() * 6.28 });
    }
    mindestAbstand -= 2;
  }
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt) {
  if (zustand !== 'spiel') return;

  spielZeit += dt;

  Spieler.update(dt, labyrinth, tasten, TILE);
  Gegner.update(dt, labyrinth, TILE);

  sichtMerken();
  schluesselPruefen();
  ausgangPruefen();
  spannungUpdate(dt);

  if (Gegner.hatSpielerErwischt()) sterben();

  if (verschlossenTimer > 0) verschlossenTimer -= dt;
  if (ruettelStaerke > 0) ruettelStaerke = Math.max(0, ruettelStaerke - dt * 12);
}

function schluesselPruefen() {
  for (const s of schluessel) {
    if (s.eingesammelt) continue;
    const sx = (s.x + 0.5) * TILE;
    const sy = (s.y + 0.5) * TILE;

    if (Math.hypot(Spieler.x - sx, Spieler.y - sy) < TILE * 0.55) {
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
  if (Math.hypot(Spieler.x - ax, Spieler.y - ay) > TILE * 0.75) return;

  if (gesammelt >= schluessel.length) {
    gewinnen();
  } else if (verschlossenTimer <= 0) {
    Sound.verschlossen();
    zeigeMeldung('Verschlossen - dir fehlen ' + (schluessel.length - gesammelt) + ' Schluessel');
    verschlossenTimer = 1.6;
  }
}

function spannungUpdate(dt) {
  const abstand = Math.hypot(Spieler.x - Gegner.x, Spieler.y - Gegner.y);
  const jagt = Gegner.zustand === 'jagd';

  let naehe = Math.max(0, 1 - abstand / (TILE * 10));
  if (jagt) naehe = Math.max(naehe, 0.55);

  Sound.spannung(naehe);

  if (naehe > 0.18) {
    herzTimer -= dt;
    if (herzTimer <= 0) {
      Sound.herzschlag(Math.min(1, naehe * 1.3));
      herzTimer = 1.15 - naehe * 0.75;
    }
  }

  if (jagt && abstand < TILE * 5) {
    ruettelStaerke = Math.max(ruettelStaerke, (1 - abstand / (TILE * 5)) * 5);
  }

  gefahrAnzeige.classList.toggle('versteckt', !jagt);
}

/* ---------- Nebel des Krieges ---------- */
function sichtMerken() {
  const strahlen = 30;
  const oeffnung = 1.4;
  const weite = TILE * 7;
  const start = Spieler.winkel - oeffnung / 2;

  for (let i = 0; i < strahlen; i++) {
    const winkel = start + (oeffnung / (strahlen - 1)) * i;
    const dx = Math.cos(winkel);
    const dy = Math.sin(winkel);

    // In kleinen Schritten am Strahl entlang, bis eine Wand kommt
    for (let s = 0; s <= weite; s += TILE * 0.4) {
      const kx = Math.floor((Spieler.x + dx * s) / TILE);
      const ky = Math.floor((Spieler.y + dy * s) / TILE);
      merke(kx, ky);
      if (Maze.istWand(labyrinth, kx, ky)) break;
    }
  }

  // Nahbereich rundum
  const meinX = Math.floor(Spieler.x / TILE);
  const meinY = Math.floor(Spieler.y / TILE);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      merke(meinX + dx, meinY + dy);
}

function merke(kx, ky) {
  if (kx < 0 || ky < 0 || kx >= labyrinth.breite || ky >= labyrinth.hoehe) return;
  gesehen[ky * labyrinth.breite + kx] = 1;
}

function istGesehen(kx, ky) {
  return gesehen[ky * labyrinth.breite + kx] === 1;
}

/* ============================================================
   ZEICHNEN
   ============================================================ */
function zeichne() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (zustand === 'menue' || !labyrinth) {
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // Bildschirmwackeln, wenn das Monster nah ist
  const wackelX = (Math.random() - 0.5) * ruettelStaerke;
  const wackelY = (Math.random() - 0.5) * ruettelStaerke;

  const kamera = {
    x: Spieler.x,
    y: Spieler.y,
    winkel: Spieler.winkel,
    neigung: Spieler.neigung + wackelY,
    wackeln: Spieler.wackeln
  };

  const einstellungen = STUFEN[stufe];

  // ---- 1) Die 3D-Ansicht ----
  Raycaster3D.zeichne(labyrinth, kamera, TILE, einstellungen);
  Raycaster3D.zeichneFiguren(figurenListe(), kamera, TILE, einstellungen);

  ctx.save();
  ctx.translate(wackelX, 0);
  Raycaster3D.ausgeben(ctx, w, h);
  ctx.restore();

  // ---- 2) Bildlook obendrauf ----
  zeichneVignette(w, h);
  zeichneKoernung(w, h);
  zeichneMinikarte(w, h);
}

/**
 * Baut die Liste der Figuren, die gezeichnet werden sollen.
 * groesse: 1 = so hoch wie eine Wand
 * hoehe:   wie weit ueber dem Boden sie schwebt
 */
function figurenListe() {
  const figuren = [];

  for (const s of schluessel) {
    if (s.eingesammelt) continue;
    figuren.push({
      x: (s.x + 0.5) * TILE,
      y: (s.y + 0.5) * TILE,
      textur: 'schluessel',
      groesse: 0.3,
      // langsames Schweben auf und ab
      hoehe: 0.34 + Math.sin(spielZeit * 1.8 + s.phase) * 0.05,
      leuchtet: true
    });
  }

  figuren.push({
    x: (ausgang.x + 0.5) * TILE,
    y: (ausgang.y + 0.5) * TILE,
    textur: 'tuer',
    groesse: 0.92,
    hoehe: 0,
    leuchtet: gesammelt >= schluessel.length
  });

  figuren.push({
    x: Gegner.x,
    y: Gegner.y,
    textur: 'monster',
    groesse: 0.8,
    hoehe: 0.02,
    leuchtet: false
  });

  return figuren;
}

/* ---------- Vignette ---------- */
function zeichneVignette(w, h) {
  const verlauf = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34,
                                           w / 2, h / 2, Math.max(w, h) * 0.75);
  verlauf.addColorStop(0, 'rgba(0,0,0,0)');
  verlauf.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, w, h);
}

/* ---------- Filmkorn ---------- */
let koernungMuster = null;

function koernungBauen() {
  const g = 140;
  const c = document.createElement('canvas');
  c.width = g; c.height = g;
  const cc = c.getContext('2d');
  const bild = cc.createImageData(g, g);
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
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  ctx.translate(Math.random() * 140, Math.random() * 140);
  ctx.fillStyle = koernungMuster;
  ctx.fillRect(-140, -140, w + 280, h + 280);
  ctx.restore();
}

/* ---------- Karte ---------- */
function zeichneMinikarte(w, h) {
  if (!karteSichtbar) return;

  const skala = Math.max(3, Math.round(150 / labyrinth.breite));
  const kb = labyrinth.breite * skala;
  const kh = labyrinth.hoehe * skala;
  const ox = w - kb - 22;
  const oy = h - kh - 22;

  ctx.fillStyle = 'rgba(6, 8, 14, 0.7)';
  ctx.fillRect(ox - 8, oy - 8, kb + 16, kh + 16);
  ctx.strokeStyle = 'rgba(120, 140, 200, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - 8.5, oy - 8.5, kb + 17, kh + 17);

  for (let y = 0; y < labyrinth.hoehe; y++) {
    for (let x = 0; x < labyrinth.breite; x++) {
      if (!istGesehen(x, y)) continue;
      ctx.fillStyle = labyrinth.grid[y][x] === Maze.WAND
        ? 'rgba(105, 125, 180, 0.32)'
        : 'rgba(150, 180, 240, 0.13)';
      ctx.fillRect(ox + x * skala, oy + y * skala, skala, skala);
    }
  }

  for (const s of schluessel) {
    if (s.eingesammelt || !istGesehen(s.x, s.y)) continue;
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(ox + s.x * skala - 1, oy + s.y * skala - 1, skala + 2, skala + 2);
  }

  if (istGesehen(ausgang.x, ausgang.y)) {
    ctx.fillStyle = gesammelt >= schluessel.length ? '#5af0aa' : '#d24646';
    ctx.fillRect(ox + ausgang.x * skala - 1, oy + ausgang.y * skala - 1, skala + 2, skala + 2);
  }

  // Spieler als Dreieck in Blickrichtung
  const px = ox + (Spieler.x / TILE) * skala;
  const py = oy + (Spieler.y / TILE) * skala;
  const dx = Math.cos(Spieler.winkel);
  const dy = Math.sin(Spieler.winkel);

  ctx.fillStyle = 'rgba(140, 210, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(px + dx * 5, py + dy * 5);
  ctx.lineTo(px - dy * 3.2 - dx * 2.5, py + dx * 3.2 - dy * 2.5);
  ctx.lineTo(px + dy * 3.2 - dx * 2.5, py - dx * 3.2 - dy * 2.5);
  ctx.closePath();
  ctx.fill();
}

/* ============================================================
   HUD
   ============================================================ */
const hudElement       = document.getElementById('hud');
const hudZeit          = document.getElementById('hud-zeit');
const hudSchluessel    = document.getElementById('hud-schluessel');
const hudSchluesselMax = document.getElementById('hud-schluessel-max');
const hudAusdauer      = document.getElementById('hud-ausdauer');
const gefahrAnzeige    = document.getElementById('gefahr');
const meldungElement   = document.getElementById('meldung');
const fadenkreuz       = document.getElementById('fadenkreuz');
const trefferBlende    = document.getElementById('treffer');

let meldungTimer = null;

function zeigeMeldung(text) {
  meldungElement.textContent = text;
  meldungElement.classList.add('sichtbar');
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => meldungElement.classList.remove('sichtbar'), 2200);
}

function hudUpdate() {
  if (zustand !== 'spiel') return;
  hudZeit.textContent = spielZeit.toFixed(1);
  hudSchluessel.textContent = gesammelt;
  hudAusdauer.style.width = (Spieler.ausdauer * 100) + '%';
  hudAusdauer.classList.toggle('leer', Spieler.erschoepft);
}

/* ============================================================
   SPIELZUSTAENDE
   ============================================================ */
const menueOverlay = document.getElementById('menue');
const todOverlay   = document.getElementById('tod');
const siegOverlay  = document.getElementById('sieg');
const pauseOverlay = document.getElementById('pause');

function alleOverlaysAus() {
  [menueOverlay, todOverlay, siegOverlay, pauseOverlay]
    .forEach(o => o.classList.add('versteckt'));
}

function starten() {
  Sound.init();
  Sound.ambientStarten();

  neuesSpiel();
  alleOverlaysAus();
  hudElement.classList.remove('versteckt');
  fadenkreuz.classList.remove('versteckt');
  zustand = 'spiel';

  mausSperren();
  zeigeMeldung('Finde ' + schluessel.length + ' Schluessel');
}

function sterben() {
  if (zustand !== 'spiel') return;
  zustand = 'tot';
  Spieler.lebt = false;
  Sound.tod();

  if (document.pointerLockElement) document.exitPointerLock();

  trefferBlende.classList.add('aktiv');
  setTimeout(() => trefferBlende.classList.remove('aktiv'), 900);

  hudElement.classList.add('versteckt');
  fadenkreuz.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');
  klickHinweis.classList.add('versteckt');

  document.getElementById('tod-text').innerHTML =
    'Du hast <b>' + gesammelt + ' von ' + schluessel.length + '</b> Schluesseln gefunden.<br>' +
    'Ueberlebt: ' + spielZeit.toFixed(1) + ' Sekunden.';

  todOverlay.classList.remove('versteckt');
}

function gewinnen() {
  if (zustand !== 'spiel') return;
  zustand = 'sieg';
  Sound.sieg();

  if (document.pointerLockElement) document.exitPointerLock();

  hudElement.classList.add('versteckt');
  fadenkreuz.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');
  klickHinweis.classList.add('versteckt');

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
  if (zustand !== 'spiel') return;
  zustand = 'pause';
  hudElement.classList.add('versteckt');
  fadenkreuz.classList.add('versteckt');
  klickHinweis.classList.add('versteckt');
  pauseOverlay.classList.remove('versteckt');
}

function fortsetzen() {
  zustand = 'spiel';
  pauseOverlay.classList.add('versteckt');
  hudElement.classList.remove('versteckt');
  fadenkreuz.classList.remove('versteckt');
  mausSperren();
}

function zumMenue() {
  zustand = 'menue';
  Sound.ambientStoppen();
  if (document.pointerLockElement) document.exitPointerLock();

  alleOverlaysAus();
  hudElement.classList.add('versteckt');
  fadenkreuz.classList.add('versteckt');
  gefahrAnzeige.classList.add('versteckt');
  klickHinweis.classList.add('versteckt');
  menueOverlay.classList.remove('versteckt');
  bestzeitAnzeigen();
}

/* ============================================================
   BESTZEIT (localStorage)
   ============================================================ */
function bestzeitLesen(s) {
  try {
    const wert = localStorage.getItem('schattenlabyrinth3d_' + s);
    return wert === null ? null : parseFloat(wert);
  } catch (e) { return null; }
}

function bestzeitSchreiben(s, zeit) {
  try { localStorage.setItem('schattenlabyrinth3d_' + s, zeit.toFixed(2)); }
  catch (e) { /* Browser verbietet Speichern - nicht schlimm */ }
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
    bestzeitAnzeigen();
  });
});

document.getElementById('start-knopf').addEventListener('click', starten);
document.getElementById('weiter-knopf').addEventListener('click', fortsetzen);
document.querySelectorAll('[data-neustart]').forEach(k => k.addEventListener('click', starten));
document.querySelectorAll('[data-menue]').forEach(k => k.addEventListener('click', zumMenue));

/* ============================================================
   GAME LOOP
   ============================================================ */
let letzteZeit = performance.now();

function schleife(jetzt) {
  let dt = (jetzt - letzteZeit) / 1000;
  letzteZeit = jetzt;

  // Nach einem Tab-Wechsel kann dt riesig werden - begrenzen,
  // sonst springt der Spieler durch Waende.
  if (dt > 0.05) dt = 0.05;

  update(dt);
  zeichne();
  hudUpdate();

  requestAnimationFrame(schleife);
}

/* ============================================================
   START
   ============================================================ */
document.getElementById('version-anzeige').textContent = 'Version ' + SPIEL_VERSION;

Texturen.alleErzeugen();
canvasAnpassen();
bestzeitAnzeigen();
requestAnimationFrame(schleife);
