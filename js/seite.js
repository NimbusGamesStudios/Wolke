/* ============================================================
   seite.js  -  Kleine Belebungen fuer die Website
   ------------------------------------------------------------
   Drei Dinge:
     1. die Taschenlampe im Startbereich
     2. Abschnitte blenden beim Scrollen ein
     3. Bilder lassen sich gross anzeigen

   Alles ist so gebaut, dass die Seite auch ohne JavaScript
   vollstaendig lesbar bleibt.
   ============================================================ */

(function () {
  'use strict';

  /*
     Wer in den Systemeinstellungen weniger Bewegung wuenscht, bekommt
     keine SELBSTLAUFENDEN Animationen - kein Zoom, kein Flackern, kein
     Einblenden beim Scrollen.

     Die Taschenlampe bleibt trotzdem an: Sie bewegt sich nur, wenn der
     Nutzer selbst die Maus bewegt. Das ist eine direkte Reaktion auf
     eine Eingabe, so wie ein Hover-Effekt - und genau das ist mit der
     Einstellung nicht gemeint.
  */
  const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* ==========================================================
     1) TASCHENLAMPE
     ----------------------------------------------------------
     Im CSS liegt ueber dem Startbild eine dunkle Schicht mit
     einem hellen Loch. Wo dieses Loch sitzt, steht in den
     CSS-Variablen --mx und --my. Hier werden sie auf die
     Mausposition gesetzt.

     requestAnimationFrame sorgt dafuer, dass wir hoechstens
     einmal pro Bild rechnen - egal wie oft die Maus meldet.
     ========================================================== */
  const held = document.querySelector('.held');

  if (held) {
    let zielX = 50, zielY = 46;      // in Prozent
    let angefordert = false;

    function malen() {
      angefordert = false;
      held.style.setProperty('--mx', zielX + '%');
      held.style.setProperty('--my', zielY + '%');
    }

    held.addEventListener('mousemove', function (e) {
      const kasten = held.getBoundingClientRect();
      zielX = ((e.clientX - kasten.left) / kasten.width) * 100;
      zielY = ((e.clientY - kasten.top) / kasten.height) * 100;

      if (!angefordert) {
        angefordert = true;
        requestAnimationFrame(malen);
      }
    });

    // Maus weg -> Lampe zurueck in die Mitte
    held.addEventListener('mouseleave', function () {
      zielX = 50; zielY = 46;
      requestAnimationFrame(malen);
    });
  }


  /* ==========================================================
     2) EINBLENDEN BEIM SCROLLEN
     ----------------------------------------------------------
     Ein IntersectionObserver meldet, sobald ein Element in den
     sichtbaren Bereich rutscht. Das ist deutlich sparsamer, als
     bei jedem Scrollen alle Positionen nachzumessen.
     ========================================================== */
  const kandidaten = document.querySelectorAll('.zeigen');

  if (!('IntersectionObserver' in window) || ruhig) {
    // Kein Beobachter verfuegbar: einfach alles sofort zeigen
    kandidaten.forEach(el => el.classList.add('da'));
  } else {
    const beobachter = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (eintrag, i) {
        if (!eintrag.isIntersecting) return;

        // Leicht versetzt einblenden, damit es nicht auf einmal springt
        setTimeout(function () {
          eintrag.target.classList.add('da');
        }, i * 70);

        beobachter.unobserve(eintrag.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    kandidaten.forEach(el => beobachter.observe(el));
  }


  /* ==========================================================
     3) BILDER GROSS ANZEIGEN
     ========================================================== */
  const lupe = document.getElementById('lupe');
  const lupeBild = document.getElementById('lupe-bild');
  const lupeZu = document.getElementById('lupe-zu');

  if (lupe && lupeBild) {

    document.querySelectorAll('.galerie figure').forEach(function (figur) {
      figur.addEventListener('click', function () {
        const bild = figur.querySelector('img');
        lupeBild.src = bild.src;
        lupeBild.alt = bild.alt;
        lupe.hidden = false;
        document.body.style.overflow = 'hidden';   // Seite dahinter feststellen
      });
    });

    function schliessen() {
      lupe.hidden = true;
      lupeBild.src = '';
      document.body.style.overflow = '';
    }

    lupeZu.addEventListener('click', schliessen);

    // Klick neben das Bild schliesst ebenfalls
    lupe.addEventListener('click', function (e) {
      if (e.target === lupe) schliessen();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lupe.hidden) schliessen();
    });
  }

})();
