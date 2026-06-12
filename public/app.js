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

const MEASURE_TYPE_OPTIONS = [
  { id: 'taille', label: 'Taille' },
  { id: 'poitrine', label: 'Poitrine' },
  { id: 'hanches', label: 'Hanches' },
  { id: 'longueur', label: 'Longueur' },
  { id: 'epaule', label: 'Épaule' },
];

let patronImporte = null;

function echelleActive() {
  return Number.isFinite(patronData.echellePxParCm) && patronData.echellePxParCm > 0
    ? patronData.echellePxParCm
    : 1;
}

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

function distancePoints(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function genererIdPoint(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < alphabet.length) {
    return alphabet[index];
  }
  const base = Math.floor(index / alphabet.length) - 1;
  return `${alphabet[base]}${alphabet[index % alphabet.length]}`;
}

function construireModeleDepuisSegments(segmentsBruts, nomFichier, nomParDefaut) {
  const pointsRef = {};
  const pointMap = new Map();
  const segments = [];

  function getOrCreatePointId(point) {
    const key = `${point.x.toFixed(2)}:${point.y.toFixed(2)}`;
    if (pointMap.has(key)) {
      return pointMap.get(key);
    }
    const id = genererIdPoint(pointMap.size);
    pointsRef[id] = { x: point.x, y: point.y };
    pointMap.set(key, id);
    return id;
  }

  for (const segment of segmentsBruts) {
    if (!segment || !segment.start || !segment.end) {
      continue;
    }
    const start = getOrCreatePointId(segment.start);
    const end = getOrCreatePointId(segment.end);
    if (start === end) {
      continue;
    }
    segments.push({
      id: `S${segments.length + 1}`,
      start,
      end,
    });
  }

  if (!Object.keys(pointsRef).length || !segments.length) {
    throw new Error('Le fichier ne contient pas de segments exploitables.');
  }

  return {
    nom: nomFichier || nomParDefaut,
    pointsRef,
    pointsCourants: Object.fromEntries(
      Object.entries(pointsRef).map(([id, p]) => [id, { x: p.x, y: p.y }])
    ),
    segments,
    zones: [],
  };
}

function extraireModeleDepuisDxf(dxfText, nomFichier) {
  const lignes = (dxfText || '').replace(/\r/g, '').split('\n');
  const segmentsBruts = [];

  function lireEntite(indexDepart) {
    const entite = {};
    let i = indexDepart;
    while (i + 1 < lignes.length) {
      const code = (lignes[i] || '').trim();
      const valeur = (lignes[i + 1] || '').trim();
      if (code === '0') {
        break;
      }
      if (!entite[code]) {
        entite[code] = [];
      }
      entite[code].push(valeur);
      i += 2;
    }
    return { entite, nextIndex: i };
  }

  function lireNombre(entite, code, index) {
    const valeurs = entite[code] || [];
    const raw = valeurs[index || 0];
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : NaN;
  }

  let i = 0;
  while (i + 1 < lignes.length) {
    const code = (lignes[i] || '').trim();
    const valeur = (lignes[i + 1] || '').trim().toUpperCase();
    if (code !== '0') {
      i += 2;
      continue;
    }

    if (valeur === 'LINE') {
      const { entite, nextIndex } = lireEntite(i + 2);
      const x1 = lireNombre(entite, '10');
      const y1 = lireNombre(entite, '20');
      const x2 = lireNombre(entite, '11');
      const y2 = lireNombre(entite, '21');
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        segmentsBruts.push({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });
      }
      i = nextIndex;
      continue;
    }

    if (valeur === 'LWPOLYLINE') {
      const { entite, nextIndex } = lireEntite(i + 2);
      const xs = entite['10'] || [];
      const ys = entite['20'] || [];
      const pts = [];
      const count = Math.min(xs.length, ys.length);
      for (let p = 0; p < count; p += 1) {
        const x = parseFloat(xs[p]);
        const y = parseFloat(ys[p]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          pts.push({ x, y });
        }
      }
      for (let p = 0; p < pts.length - 1; p += 1) {
        segmentsBruts.push({ start: pts[p], end: pts[p + 1] });
      }
      const flags = parseInt((entite['70'] || ['0'])[0], 10);
      if ((flags & 1) === 1 && pts.length > 2) {
        segmentsBruts.push({ start: pts[pts.length - 1], end: pts[0] });
      }
      i = nextIndex;
      continue;
    }

    i += 2;
  }

  return construireModeleDepuisSegments(segmentsBruts, nomFichier, 'Patron DXF importé');
}

function extraireModeleDepuisPdf(pdfText, nomFichier) {
  const tokens = (pdfText || '').match(/-?\d*\.?\d+|[A-Za-z]{1,2}/g) || [];
  const segmentsBruts = [];
  const pile = [];
  let pointCourant = null;

  for (const token of tokens) {
    const num = parseFloat(token);
    if (Number.isFinite(num)) {
      pile.push(num);
      continue;
    }

    if (token === 'm' && pile.length >= 2) {
      pointCourant = { x: pile[pile.length - 2], y: pile[pile.length - 1] };
      pile.length = 0;
      continue;
    }

    if (token === 'l' && pile.length >= 2 && pointCourant) {
      const nextPoint = { x: pile[pile.length - 2], y: pile[pile.length - 1] };
      segmentsBruts.push({ start: pointCourant, end: nextPoint });
      pointCourant = nextPoint;
      pile.length = 0;
      continue;
    }

    if (token === 'S' || token === 's' || token === 'f' || token === 'n' || token === 'h') {
      pile.length = 0;
    }
  }

  return construireModeleDepuisSegments(segmentsBruts, nomFichier, 'Patron PDF importé');
}

function extraireModeleDepuisFichier(file, rawText) {
  const nom = (file && file.name) || '';
  const lower = nom.toLowerCase();
  if (lower.endsWith('.dxf')) {
    return extraireModeleDepuisDxf(rawText, nom);
  }
  if (lower.endsWith('.pdf')) {
    return extraireModeleDepuisPdf(rawText, nom);
  }
  throw new Error('Format non pris en charge. Importez un fichier DXF ou PDF.');
}

function longueurChaine(points, chaineSegments) {
  return chaineSegments.reduce((acc, seg) => {
    const p1 = points[seg.de];
    const p2 = points[seg.a];
    if (!p1 || !p2) {
      return acc;
    }
    return acc + distancePoints(p1, p2);
  }, 0);
}

function recalculerPointsImportes() {
  if (!patronImporte) {
    return;
  }

  patronImporte.pointsCourants = Object.fromEntries(
    Object.entries(patronImporte.pointsRef).map(([id, p]) => [id, { x: p.x, y: p.y }])
  );

  for (const zone of patronImporte.zones) {
    if (!zone.segments.length || zone.valeurReference <= 0) {
      continue;
    }
    const ratio = zone.valeurCourante / zone.valeurReference;
    appliquerChainage(
      patronImporte.pointsCourants,
      patronImporte.pointsRef,
      { ancreId: zone.segments[0].de, segments: zone.segments },
      ratio
    );
  }
}

function estChaineFermee(segmentsZone) {
  if (!segmentsZone.length) {
    return false;
  }
  return segmentsZone[0].de === segmentsZone[segmentsZone.length - 1].a;
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

function dessinerPatronImporte() {
  recalculerPointsImportes();
  const pts = patronImporte.pointsCourants;

  if (patronGroup) {
    patronGroup.remove();
  }
  patronGroup = new paper.Group();

  for (const seg of patronImporte.segments) {
    const p1 = pts[seg.start];
    const p2 = pts[seg.end];
    if (!p1 || !p2) {
      continue;
    }
    const line = new paper.Path.Line(
      new paper.Point(p1.x, p1.y),
      new paper.Point(p2.x, p2.y)
    );
    line.strokeColor = '#2c3e50';
    line.strokeWidth = 1.8;
    patronGroup.addChild(line);
  }

  patronImporte.zones.forEach((zone, index) => {
    const color = ['#e74c3c', '#8e44ad', '#16a085', '#2980b9'][index % 4];
    zone.segments.forEach((seg) => {
      const p1 = pts[seg.de];
      const p2 = pts[seg.a];
      if (!p1 || !p2) {
        return;
      }
      const line = new paper.Path.Line(
        new paper.Point(p1.x, p1.y),
        new paper.Point(p2.x, p2.y)
      );
      line.strokeColor = color;
      line.strokeWidth = 3;
      patronGroup.addChild(line);
    });
  });

  for (const [id, coord] of Object.entries(pts)) {
    const dot = new paper.Path.Circle(new paper.Point(coord.x, coord.y), 3.2);
    dot.fillColor = '#d35400';
    patronGroup.addChild(dot);

    const label = new paper.PointText(new paper.Point(coord.x + 6, coord.y - 6));
    label.content = id;
    label.fillColor = '#555';
    label.fontSize = 11;
    label.fontWeight = 'bold';
    patronGroup.addChild(label);
  }

  paper.view.update();
  mettreAJourInfoPoints(pts);
}

/**
 * Dessine (ou redessine) le patron complet dans Paper.js.
 * Supprime le groupe précédent avant de recréer tous les éléments.
 */
function dessinerPatron() {
  if (patronImporte) {
    dessinerPatronImporte();
    return;
  }

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
  const barPx = 10 * echelleActive();   // 10 cm en pixels

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

  if (patronImporte) {
    container.innerHTML = '<p class="hint">Mesures paramétriques natives désactivées après import DXF/PDF.</p>';
    return;
  }

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

function peuplerOptionsTypesMesure() {
  const select = document.getElementById('zone-measure-type');
  select.innerHTML = '';
  for (const item of MEASURE_TYPE_OPTIONS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.appendChild(option);
  }
}

function rafraichirSelecteursPointsEtZones() {
  const zoneSelect = document.getElementById('zone-select');
  const startSelect = document.getElementById('segment-start');
  const endSelect = document.getElementById('segment-end');

  zoneSelect.innerHTML = '';
  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  if (!patronImporte) {
    return;
  }

  patronImporte.zones.forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = `${zone.nom} (${zone.typeMesure})`;
    zoneSelect.appendChild(option);
  });

  Object.keys(patronImporte.pointsRef).forEach((pointId) => {
    const optionStart = document.createElement('option');
    optionStart.value = pointId;
    optionStart.textContent = pointId;
    startSelect.appendChild(optionStart);

    const optionEnd = document.createElement('option');
    optionEnd.value = pointId;
    optionEnd.textContent = pointId;
    endSelect.appendChild(optionEnd);
  });
}

function rafraichirDetailsZones() {
  const details = document.getElementById('zone-details');
  details.innerHTML = '';

  if (!patronImporte || !patronImporte.zones.length) {
    details.innerHTML = '<li>Aucune zone définie.</li>';
    return;
  }

  patronImporte.zones.forEach((zone) => {
    const li = document.createElement('li');
    const chaine = zone.segments.map((seg) => `${seg.de}->${seg.a}`).join(', ') || '∅';
    const etatFermeture = estChaineFermee(zone.segments) ? 'fermée' : 'ouverte';
    const title = document.createElement('strong');
    title.textContent = zone.nom;
    li.appendChild(title);
    li.appendChild(document.createTextNode(` — ${zone.typeMesure}`));
    li.appendChild(document.createElement('br'));
    li.appendChild(document.createTextNode(`Segments: ${chaine}`));
    li.appendChild(document.createElement('br'));
    li.appendChild(document.createTextNode(`Contour: ${etatFermeture}`));
    li.appendChild(document.createElement('br'));
    li.appendChild(
      document.createTextNode(
        `Réf: ${(zone.valeurReference / echelleActive()).toFixed(2)} cm`
      )
    );

    const label = document.createElement('label');
    label.htmlFor = `zone-value-${zone.id}`;
    label.textContent = 'Valeur réelle (cm)';
    li.appendChild(label);

    const input = document.createElement('input');
    input.id = `zone-value-${zone.id}`;
    input.type = 'number';
    input.min = '1';
    input.step = '0.1';
    input.value = zone.valeurCouranteCm.toFixed(2);
    li.appendChild(input);
    details.appendChild(li);

    input.addEventListener('input', (event) => {
      const valueCm = parseFloat(event.target.value);
      if (!Number.isFinite(valueCm) || valueCm <= 0) {
        return;
      }
      zone.valeurCouranteCm = valueCm;
      zone.valeurCourante = valueCm * echelleActive();
      dessinerPatron();
    });
  });
}

function creerZoneMesure() {
  if (!patronImporte) {
    return;
  }

  const typeMesure = document.getElementById('zone-measure-type').value;
  const nomZoneInput = document.getElementById('zone-name');
  const nomZone = nomZoneInput.value.trim() || `Zone ${patronImporte.zones.length + 1}`;
  const zone = {
    id: `zone_${patronImporte.zones.length + 1}`,
    nom: nomZone,
    typeMesure,
    segments: [],
    valeurReference: 0,
    valeurCourante: 0,
    valeurCouranteCm: 0,
  };
  patronImporte.zones.push(zone);
  nomZoneInput.value = '';
  rafraichirSelecteursPointsEtZones();
  rafraichirDetailsZones();
}

function ajouterSegmentOrienteZone() {
  if (!patronImporte) {
    return;
  }

  const zoneId = document.getElementById('zone-select').value;
  const start = document.getElementById('segment-start').value;
  const end = document.getElementById('segment-end').value;
  const status = document.getElementById('vector-import-status');
  const zone = patronImporte.zones.find((z) => z.id === zoneId);
  if (!zone || !start || !end || start === end) {
    status.textContent = 'Sélection de segment invalide.';
    return;
  }

  if (zone.segments.length && zone.segments[zone.segments.length - 1].a !== start) {
    status.textContent = 'La chaîne doit rester continue (fin du segment précédent = début du suivant).';
    return;
  }

  zone.segments.push({ de: start, a: end });
  zone.valeurReference = longueurChaine(patronImporte.pointsRef, zone.segments);
  if (zone.valeurReference > 0 && zone.valeurCourante <= 0) {
    zone.valeurCourante = zone.valeurReference;
    zone.valeurCouranteCm = zone.valeurReference / echelleActive();
  }

  status.textContent = `Segment ${start}->${end} ajouté à "${zone.nom}".`;
  rafraichirDetailsZones();
  dessinerPatron();
}

function brancherUiImportEtZones() {
  peuplerOptionsTypesMesure();
  rafraichirSelecteursPointsEtZones();
  rafraichirDetailsZones();

  const status = document.getElementById('vector-import-status');
  const fileInput = document.getElementById('vector-import-input');
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      patronImporte = extraireModeleDepuisFichier(file, rawText);
      status.textContent = `Import réussi: ${Object.keys(patronImporte.pointsRef).length} points, ${patronImporte.segments.length} segments.`;
      document.getElementById('patron-name').textContent = patronImporte.nom;
      creerControles();
      rafraichirSelecteursPointsEtZones();
      rafraichirDetailsZones();
      dessinerPatron();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.getElementById('create-zone-btn').addEventListener('click', creerZoneMesure);
  document.getElementById('add-segment-btn').addEventListener('click', ajouterSegmentOrienteZone);
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
  brancherUiImportEtZones();
  creerControles();
  dessinerPatron();
});
