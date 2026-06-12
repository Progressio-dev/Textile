# Textile

Prototype SaaS de patron textile paramétrique (Paper.js + Express).

## Démarrage

```bash
npm install
npm start
```

## Nouveau flux : patron vectoriel à plat (DXF / PDF)

Depuis le panneau de droite :

1. **Import vectoriel (DXF / PDF)** : charger un fichier `.dxf` ou `.pdf` contenant des segments vectoriels.
2. **Zones de mesure** :
   - créer une zone,
   - choisir son type métier (`taille`, `poitrine`, `hanches`, `longueur`, `épaule`),
   - ajouter des segments orientés (`A->B`, `B->C`, etc.) en chaîne continue.
3. **Valeur réelle (cm)** : modifier la valeur de la zone pour recalculer automatiquement le tracé lié.

Notes :
- Le statut de fermeture (`ouverte` / `fermée`) est affiché pour chaque zone.
- Le recalcul utilise un algorithme de mise à l’échelle simple (ratio valeur réelle / valeur de référence sur la chaîne).