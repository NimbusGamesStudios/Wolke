/* ============================================================
   audio.js  -  Klang komplett aus Code
   ------------------------------------------------------------
   Es gibt hier KEINE mp3- oder wav-Dateien. Jeder Ton wird zur
   Laufzeit mit der Web Audio API berechnet.

   Vorteile: das Spiel bleibt winzig, laedt sofort, und die Toene
   koennen live auf das Geschehen reagieren (der Herzschlag wird
   schneller, je naeher das Monster kommt).

   GRUNDPRINZIP der Web Audio API:
   Man baut eine Kette aus Bausteinen und steckt sie zusammen -
   wie bei einem Synthesizer:

     Oszillator  ->  Filter  ->  Lautstaerke  ->  Lautsprecher
     (erzeugt Ton)   (formt)     (Huellkurve)

   Browser erlauben Ton erst nach einer Nutzer-Aktion (Klick).
   Deshalb wird init() erst beim Klick auf "Spiel starten" aufgerufen.
   ============================================================ */

const Sound = {

  ctx: null,
  an: false,
  master: null,
  rauschPuffer: null,

  drone: null,
  droneGain: null,
  droneFilter: null,

  /** Wird beim ersten Klick des Nutzers aufgerufen. */
  init() {
    if (this.ctx) return;

    try {
      const AudioKlasse = window.AudioContext || window.webkitAudioContext;
      if (!AudioKlasse) return;

      this.ctx = new AudioKlasse();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      this.rauschPufferBauen();
      this.an = true;
    } catch (e) {
      // Kein Audio moeglich - das Spiel laeuft trotzdem weiter.
      this.an = false;
    }
  },

  /**
   * Erzeugt zwei Sekunden weisses Rauschen als wiederverwendbaren Puffer.
   * Rauschen ist die Grundlage fuer Schritte, Wind und Knurren.
   */
  rauschPufferBauen() {
    const laenge = this.ctx.sampleRate * 2;
    const puffer = this.ctx.createBuffer(1, laenge, this.ctx.sampleRate);
    const daten = puffer.getChannelData(0);
    for (let i = 0; i < laenge; i++) {
      daten[i] = Math.random() * 2 - 1;     // Zufallswerte = Rauschen
    }
    this.rauschPuffer = puffer;
  },

  /** Hilfsfunktion: eine Rauschquelle erzeugen. */
  rauschQuelle() {
    const q = this.ctx.createBufferSource();
    q.buffer = this.rauschPuffer;
    q.loop = true;
    return q;
  },

  /* ---------- Dauerhafter Hintergrund-Drone ---------- */
  ambientStarten() {
    if (!this.an || this.drone) return;
    const t = this.ctx.currentTime;

    // Tiefer, leicht verstimmter Grundton
    const osz1 = this.ctx.createOscillator();
    const osz2 = this.ctx.createOscillator();
    osz1.type = 'sine';  osz1.frequency.value = 42;
    osz2.type = 'sine';  osz2.frequency.value = 42.7;   // Schwebung

    // Gefiltertes Rauschen daruebergelegt = "Raumluft"
    const rauschen = this.rauschQuelle();
    const rauschFilter = this.ctx.createBiquadFilter();
    rauschFilter.type = 'lowpass';
    rauschFilter.frequency.value = 320;
    const rauschGain = this.ctx.createGain();
    rauschGain.gain.value = 0.035;

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.gain.linearRampToValueAtTime(0.3, t + 3);

    osz1.connect(this.droneFilter);
    osz2.connect(this.droneFilter);
    rauschen.connect(rauschFilter).connect(rauschGain).connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain).connect(this.master);

    osz1.start(); osz2.start(); rauschen.start();
    this.drone = osz1;
  },

  ambientStoppen() {
    if (!this.an || !this.droneGain) return;
    this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
  },

  /**
   * Spannung 0..1 - macht den Hintergrund bedrohlicher,
   * je naeher das Monster ist.
   */
  spannung(wert) {
    if (!this.an || !this.droneFilter) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(260 + wert * 900, t, 0.3);
    this.droneGain.gain.setTargetAtTime(0.3 + wert * 0.28, t, 0.4);
  },

  /* ---------- Schritt ---------- */
  schritt(rennen) {
    if (!this.an) return;
    const t = this.ctx.currentTime;

    const q = this.rauschQuelle();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = rennen ? 1500 : 900;
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(rennen ? 0.16 : 0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

    q.connect(filter).connect(gain).connect(this.master);
    q.start(t);
    q.stop(t + 0.13);
  },

  /* ---------- Herzschlag ---------- */
  herzschlag(staerke) {
    if (!this.an) return;
    this.schlag(this.ctx.currentTime, staerke);
    this.schlag(this.ctx.currentTime + 0.19, staerke * 0.65);
  },

  schlag(zeit, staerke) {
    const osz = this.ctx.createOscillator();
    osz.type = 'sine';
    osz.frequency.setValueAtTime(78, zeit);
    osz.frequency.exponentialRampToValueAtTime(34, zeit + 0.13);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, zeit);
    gain.gain.exponentialRampToValueAtTime(0.42 * staerke, zeit + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.19);

    osz.connect(gain).connect(this.master);
    osz.start(zeit);
    osz.stop(zeit + 0.2);
  },

  /* ---------- Schluessel aufsammeln ---------- */
  aufsammeln() {
    if (!this.an) return;
    const t = this.ctx.currentTime;
    // zwei helle Toene im Quintabstand
    [880, 1320].forEach((f, i) => {
      const osz = this.ctx.createOscillator();
      osz.type = 'triangle';
      osz.frequency.value = f;
      const gain = this.ctx.createGain();
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osz.connect(gain).connect(this.master);
      osz.start(start);
      osz.stop(start + 0.55);
    });
  },

  /* ---------- Monster hat dich entdeckt ---------- */
  knurren() {
    if (!this.an) return;
    const t = this.ctx.currentTime;

    const osz = this.ctx.createOscillator();
    osz.type = 'sawtooth';
    osz.frequency.setValueAtTime(160, t);
    osz.frequency.exponentialRampToValueAtTime(48, t + 0.75);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + 0.75);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

    osz.connect(filter).connect(gain).connect(this.master);
    osz.start(t);
    osz.stop(t + 0.9);
  },

  /* ---------- Tod ---------- */
  tod() {
    if (!this.an) return;
    const t = this.ctx.currentTime;

    const q = this.rauschQuelle();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 1.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.42, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);

    q.connect(filter).connect(gain).connect(this.master);
    q.start(t);
    q.stop(t + 1.5);

    this.ambientStoppen();
  },

  /* ---------- Sieg ---------- */
  sieg() {
    if (!this.an) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const osz = this.ctx.createOscillator();
      osz.type = 'triangle';
      osz.frequency.value = f;
      const gain = this.ctx.createGain();
      const start = t + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osz.connect(gain).connect(this.master);
      osz.start(start);
      osz.stop(start + 1);
    });
    this.ambientStoppen();
  },

  /* ---------- Tuer / Ausgang verschlossen ---------- */
  verschlossen() {
    if (!this.an) return;
    const t = this.ctx.currentTime;
    const osz = this.ctx.createOscillator();
    osz.type = 'square';
    osz.frequency.value = 110;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osz.connect(gain).connect(this.master);
    osz.start(t);
    osz.stop(t + 0.2);
  }
};
