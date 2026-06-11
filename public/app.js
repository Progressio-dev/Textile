'use strict';

// ============================================================================
// PATRON DE COUTURE — Définition JSON
//
// Représente une demi-jupe simplifiée.
// Principe du « chaînage » : un ensemble de segments bout à bout
// (ex. A→B + B→E) peut être associé à une Mesure Finale.
// Quand la valeur de cette mesure change, la longueur de chaque segment
// est mise à l'échelle proportionnellement (même ratio), en conservant
// la direction de chaque segment.
//
// Unité de l'échelle : pixels par centimètre (px/cm)
// ============================================================================
const patronData = {
  nom: 'Demi-Jupe — Prototype PoC',
  description: 'Patron vectoriel paramétrique (demi-largeur, vue de face)',

  /** Échelle de représentation : 1 cm → 3 px */
  echellePxParCm: 3,

  /**
   * Coordonnées de référence des points.
   * Elles correspondent exactement aux valeurRef de chaque mesure.
   * Ces valeurs ne sont jamais modifiées ; elles servent de base au calcul.
   *
   *   A ─────────────── B        ← ceinture (Tour de taille)
   *   |                  \
   *   |                   \      ← couture côté
   *   D ──────────────────── C   ← ourlet (largeur = TdT + aisance ourlet)
   *
   * A : milieu-devant ceinture (point fixe / ancre du fil de chaîne)
   * B : côté ceinture
   * C : bas côté (ourlet)
   * D : bas milieu-devant
   */
  pointsRef: {
    A: { x: 60,  y: 70  },
    B: { x: 276, y: 70  },   // x: 60 + (72 cm × 3 px/cm) = 276
    C: { x: 306, y: 250 },   // x: 276 + 30 px (aisance ourlet) = 306 ; y: 70 + (60 cm × 3 px/cm) = 250
    D: { x: 60,  y: 250 },   // x: 60 (inchangé) ; y: 70 + (60 cm × 3 px/cm) = 250
  },

  /** Ordre des points définissant le contour fermé */
  contour: ['A', 'B', 'C', 'D'],

  /**
   * Mesures paramétriques.
   *
   * Chaque mesure comporte un tableau « chainages ».
   * Un chainage = une suite de segments bout à bout dont la longueur totale
   * représente la valeur de la mesure à l'échelle.
   *
   * ancreId  : identifiant du point fixe (point de départ de la chaîne)
   * segments : liste ordonnée de { de, a } — le dernier « a » d'un segment
   *            devient le « de » du suivant (bout à bout).
   */
  mesures: [
    {
      id: 'tour_de_taille',
      nom: 'Tour de taille',
      unite: 'cm',
      valeurRef: 72,       // correspond à la distance A→B dans pointsRef
      valeurCourante: 72,
      min: 56,
      max: 100,
      step: 1,
      chainages: [
        {
          ancreId: 'A',
          segments: [
            { de: 'A', a: 'B' },   // segment unique : ceinture
          ],
        },
      ],
    },
    {
      id: 'longueur',
      nom: 'Longueur de jupe',
      unite: 'cm',
      valeurRef: 60,       // correspond à la distance A→D dans pointsRef
      valeurCourante: 60,
      min: 40,
      max: 90,
      step: 1,
      chainages: [
        {
          ancreId: 'A',
          segments: [
            { de: 'A', a: 'D' },   // segment unique : fil de chaîne
          ],
        },
      ],
    },
  ],
};

// ============================================================================
// COUCHE GÉOMÉTRIQUE
// Recalcule toutes les coordonnées à partir des pointsRef et des mesures
// courantes, sans jamais modifier pointsRef (recalcul « from scratch »).
// ============================================================================

/**
 * Applique un chainage sur une copie de travail des points.
 *
 * Pour chaque segment de la chaîne :
 *   – la direction est toujours lue depuis pointsRef (invariante) ;
 *   – la longueur est mise à l'échelle par le ratio fourni ;
 *   – le point libre (seg.a) est repositionné depuis l'extrémité précédente.
 *
 * @param {Object} pts      - copie de travail { id: {x, y}, … }
 * @param {Object} ref      - pointsRef du patron (lecture seule)
 * @param {Object} chainage - { ancreId, segments: [{de, a}] }
 * @param {number} ratio    - valeurCourante / valeurRef
 */
function appliquerChainage(pts, ref, chainage, ratio) {
  // Le point d'ancre ne bouge pas ; c'est le point de départ de la chaîne.
  let precedent = { x: pts[chainage.ancreId].x, y: pts[chainage.ancreId].y };

  for (const seg of chainage.segments) {
    // Direction du segment dans le patron de référence
    const dx = ref[seg.a].x - ref[seg.de].x;
    const dy = ref[seg.a].y - ref[seg.de].y;

    // Nouveau point libre = extrémité précédente + vecteur * ratio
    pts[seg.a] = {
      x: precedent.x + dx * ratio,
      y: precedent.y + dy * ratio,
    };

    // Le prochain segment repart de ce nouveau point
    precedent = { x: pts[seg.a].x, y: pts[seg.a].y };
  }
}

/**
 * Reconstruit toutes les coordonnées du patron à partir :
 *   – des pointsRef (référence invariante) ;
 *   – des valeurCourante de chaque mesure.
 *
 * Le point C est « dérivé » : son X suit B (Tour de taille) et
 * son Y suit D (Longueur). Il est calculé en dernier.
 *
 * @returns {Object} { A:{x,y}, B:{x,y}, C:{x,y}, D:{x,y} }
 */
function calculerTousLesPoints() {
  const ref = patronData.pointsRef;

  // Copie de travail initialisée sur les coordonnées de référence
  const pts = {};
  for (const [id, coord] of Object.entries(ref)) {
    pts[id] = { x: coord.x, y: coord.y };
  }

  // Application successive de chaque mesure
  for (const mesure of patronData.mesures) {
    const ratio = mesure.valeurCourante / mesure.valeurRef;
    for (const chainage of mesure.chainages) {
      appliquerChainage(pts, ref, chainage, ratio);
    }
  }

  // Point dérivé C :
  //   X = B.x + aisance ourlet (constante, lue depuis la référence)
  //   Y = D.y (suit la longueur)
  const aisanceOurletPx = ref.C.x - ref.B.x;   // 30 px = 30 / echellePxParCm = 10 cm
  pts.C = {
    x: pts.B.x + aisanceOurletPx,
    y: pts.D.y,
  };

  return pts;
}

// ============================================================================
// COUCHE GRAPHIQUE — Paper.js
// ============================================================================

// Initialisation de Paper.js sur le canvas HTML
paper.setup(document.getElementById('patronCanvas'));

/** Groupe Paper.js contenant tous les éléments dessinés */
let patronGroup = null;

/**
 * Crée une cotation horizontale entre deux paper.Point.
 * Retourne un paper.Group.
 *
 * @param {paper.Point} p1
 * @param {paper.Point} p2
 * @param {string}      labelText
 * @param {string}      couleur   - couleur CSS
 * @param {number}      [decalageY=22] - décalage au-dessus de la ligne
 */
function cotationHorizontale(p1, p2, labelText, couleur, decalageY) {
  decalageY = decalageY || 22;
  const yLigne = Math.min(p1.y, p2.y) - decalageY;
  const grp = new paper.Group();

  // Ligne de cote
  const ligne = new paper.Path.Line(
    new paper.Point(p1.x, yLigne),
    new paper.Point(p2.x, yLigne)
  );
  ligne.strokeColor = couleur;
  ligne.strokeWidth = 1;
  ligne.dashArray = [5, 3];
  grp.addChild(ligne);

  // Terminaisons verticales
  [p1.x, p2.x].forEach((xPos) => {
    const tick = new paper.Path.Line(
      new paper.Point(xPos, yLigne - 5),
      new paper.Point(xPos, yLigne + 5)
    );
    tick.strokeColor = couleur;
    tick.strokeWidth = 1;
    grp.addChild(tick);
  });

  // Étiquette centrée
  const midX = (p1.x + p2.x) / 2;
  const txt = new paper.PointText(new paper.Point(midX, yLigne - 6));
  txt.content = labelText;
  txt.fillColor = couleur;
  txt.fontSize = 11;
  txt.justification = 'center';
  grp.addChild(txt);

  return grp;
}

/**
 * Crée une cotation verticale entre deux paper.Point.
 * Retourne un paper.Group.
 *
 * @param {paper.Point} p1
 * @param {paper.Point} p2
 * @param {string}      labelText
 * @param {string}      couleur
 * @param {number}      [decalageX=22] - décalage à droite de la ligne
 */
function cotationVerticale(p1, p2, labelText, couleur, decalageX) {
  decalageX = decalageX || 22;
  const xLigne = Math.max(p1.x, p2.x) + decalageX;
  const grp = new paper.Group();

  const ligne = new paper.Path.Line(
    new paper.Point(xLigne, p1.y),
    new paper.Point(xLigne, p2.y)
  );
  ligne.strokeColor = couleur;
  ligne.strokeWidth = 1;
  ligne.dashArray = [5, 3];
  grp.addChild(ligne);

  [p1.y, p2.y].forEach((yPos) => {
    const tick = new paper.Path.Line(
      new paper.Point(xLigne - 5, yPos),
      new paper.Point(xLigne + 5, yPos)
    );
    tick.strokeColor = couleur;
    tick.strokeWidth = 1;
    grp.addChild(tick);
  });

  const midY = (p1.y + p2.y) / 2;
  const txt = new paper.PointText(new paper.Point(xLigne + 8, midY + 4));
  txt.content = labelText;
  txt.fillColor = couleur;
  txt.fontSize = 11;
  grp.addChild(txt);

  return grp;
}

/**
 * Dessine (ou redessine) le patron complet dans Paper.js.
 * Supprime le groupe précédent avant de recréer tous les éléments.
 */
function dessinerPatron() {
  const pts = calculerTousLesPoints();

  // Supprimer le dessin précédent
  if (patronGroup) {
    patronGroup.remove();
  }
  patronGroup = new paper.Group();

  // ── Contour principal ───────────────────────────────────────────────────
  const contourPts = patronData.contour.map(
    (id) => new paper.Point(pts[id].x, pts[id].y)
  );
  const contour = new paper.Path(contourPts);
  contour.closed = true;
  contour.strokeColor = '#2c3e50';
  contour.strokeWidth = 2;
  contour.fillColor = new paper.Color(0.98, 0.96, 0.88, 0.85);
  patronGroup.addChild(contour);

  // ── Fil de chaîne (ligne de droit-fil, A→D) ─────────────────────────────
  const filChaine = new paper.Path.Line(
    new paper.Point(pts.A.x, pts.A.y),
    new paper.Point(pts.D.x, pts.D.y)
  );
  filChaine.strokeColor = '#95a5a6';
  filChaine.strokeWidth = 1;
  filChaine.dashArray = [8, 4];
  patronGroup.addChild(filChaine);

  // ── Points + étiquettes ─────────────────────────────────────────────────
  for (const [id, coord] of Object.entries(pts)) {
    const dot = new paper.Path.Circle(new paper.Point(coord.x, coord.y), 3.5);
    dot.fillColor = '#e74c3c';
    patronGroup.addChild(dot);

    const offset = id === 'A' ? { x: -14, y: -6 }
                 : id === 'B' ? { x: 6,   y: -6 }
                 : id === 'C' ? { x: 6,   y: 12 }
                 :              { x: -14, y: 12 };

    const label = new paper.PointText(
      new paper.Point(coord.x + offset.x, coord.y + offset.y)
    );
    label.content = id;
    label.fillColor = '#555';
    label.fontSize = 12;
    label.fontWeight = 'bold';
    patronGroup.addChild(label);
  }

  // ── Cotation Tour de taille (horizontale, au-dessus de A-B) ────────────
  const mesureTdT = patronData.mesures.find((m) => m.id === 'tour_de_taille');
  const cotTdT = cotationHorizontale(
    new paper.Point(pts.A.x, pts.A.y),
    new paper.Point(pts.B.x, pts.B.y),
    `TdT : ${mesureTdT.valeurCourante} cm`,
    '#2980b9'
  );
  patronGroup.addChild(cotTdT);

  // ── Cotation Longueur (verticale, à droite) ─────────────────────────────
  const mesureLon = patronData.mesures.find((m) => m.id === 'longueur');
  const cotLon = cotationVerticale(
    new paper.Point(pts.B.x, pts.A.y),
    new paper.Point(pts.C.x, pts.D.y),
    `${mesureLon.valeurCourante} cm`,
    '#27ae60',
    50
  );
  patronGroup.addChild(cotLon);

  // ── Barre d'échelle ─────────────────────────────────────────────────────
  const xBar = pts.A.x;
  const yBar = pts.D.y + 36;
  const barPx = 10 * patronData.echellePxParCm;   // 10 cm en pixels

  const bar = new paper.Path.Line(
    new paper.Point(xBar, yBar),
    new paper.Point(xBar + barPx, yBar)
  );
  bar.strokeColor = '#555';
  bar.strokeWidth = 3;
  patronGroup.addChild(bar);

  const barLabel = new paper.PointText(
    new paper.Point(xBar + barPx / 2, yBar + 14)
  );
  barLabel.content = '10 cm';
  barLabel.fillColor = '#555';
  barLabel.fontSize = 10;
  barLabel.justification = 'center';
  patronGroup.addChild(barLabel);

  // Forcer le rendu
  paper.view.update();

  // Mettre à jour le panneau d'info
  mettreAJourInfoPoints(pts);
}

// ============================================================================
// COUCHE UI — Génération dynamique des sliders
// ============================================================================

/**
 * Génère les contrôles slider pour chaque mesure définie dans patronData.
 * Branche un écouteur « input » sur chaque slider pour déclencher le redessin.
 */
function creerControles() {
  const container = document.getElementById('mesures-list');
  container.innerHTML = '';

  for (const mesure of patronData.mesures) {
    const div = document.createElement('div');
    div.className = 'mesure-control';
    div.id = `ctrl-${mesure.id}`;

    div.innerHTML = `
      <div class="mesure-header">
        <span class="mesure-label">${mesure.nom}</span>
        <span class="mesure-value" id="val-${mesure.id}">${mesure.valeurCourante}&nbsp;${mesure.unite}</span>
      </div>
      <input
        type="range"
        class="mesure-slider"
        id="slider-${mesure.id}"
        min="${mesure.min}"
        max="${mesure.max}"
        step="${mesure.step}"
        value="${mesure.valeurCourante}"
      />
      <div class="mesure-range">
        <span>${mesure.min}&nbsp;${mesure.unite}</span>
        <span>${mesure.max}&nbsp;${mesure.unite}</span>
      </div>
    `;

    container.appendChild(div);

    // Écoute du changement de valeur
    const slider = document.getElementById(`slider-${mesure.id}`);
    slider.addEventListener('input', (e) => {
      const nouvelleValeur = parseFloat(e.target.value);

      // Mise à jour de la valeur courante dans le modèle de données
      mesure.valeurCourante = nouvelleValeur;

      // Mise à jour de l'affichage de la valeur
      document.getElementById(`val-${mesure.id}`).textContent =
        `${nouvelleValeur}\u00a0${mesure.unite}`;

      // Recalcul et redessin du patron en temps réel
      dessinerPatron();
    });
  }
}

/**
 * Rafraîchit la liste des coordonnées affichées dans le panneau d'info.
 * @param {Object} pts - { A:{x,y}, B:{x,y}, … }
 */
function mettreAJourInfoPoints(pts) {
  const ul = document.getElementById('points-info');
  ul.innerHTML = '';
  for (const [id, coord] of Object.entries(pts)) {
    const li = document.createElement('li');
    li.textContent = `${id} : (${coord.x.toFixed(1)}, ${coord.y.toFixed(1)})`;
    ul.appendChild(li);
  }
}

// ============================================================================
// INITIALISATION
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('patron-name').textContent = patronData.nom;
  creerControles();
  dessinerPatron();
});
