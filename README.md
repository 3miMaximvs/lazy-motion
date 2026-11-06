# Lazy Motion

Les petits outils motion de LazyApps, dans un panneau After Effects **2026 / 26.x sur Windows**. Interface issue de la première maquette choisie : trois outils visibles, branding LazyApps et composants officiels PanelUI.

## Utilisation

Ouvrir **Fenêtre > Extensions > Lazy Motion**, puis sélectionner des calques dans la timeline d’une composition. Les précompositions placées dans la timeline sont prises en charge. Les compositions sélectionnées dans le panneau Projet ne sont pas des calques et ne sont pas traitées par cette version.

- **Cascade** : choisir l’ordre de haut en bas ou de bas en haut, puis cliquer sur **Mettre en cascade**. Le premier calque de cet ordre garde son début actuel. Chaque suivant commence exactement à la fin du précédent. Les durées et la vitesse sont conservées.
- **Durée commune** : saisir un nombre d’images ou de secondes, puis cliquer sur **Appliquer la durée**. Les secondes sont arrondies à l’image entière la plus proche selon la cadence de la composition ; la conversion s’affiche sous le champ. La virgule française est acceptée. La commande change la fin du calque et conserve son début et sa vitesse.
- **Point d’ancrage** : cliquer directement sur l’un des neuf boutons. L’ancrage suit les limites du contenu à l’instant courant, avec compensation de position. Les décalages du texte et des formes sont pris en compte.

Chaque commande s’annule avec **Ctrl + Z dans After Effects**. Le bouton d’actualisation relit la sélection. La lecture est automatique à l’ouverture, puis explicite : aucune interrogation de la timeline en boucle ou au changement de focus.

## Limites de cette première version

L’ancrage concerne les **calques visuels 2D**, sans réduction des transformations ni orientation automatique. L’ancrage, l’échelle et la rotation doivent être sans animation ni expression. La position peut être animée, y compris avec X et Y séparés, mais sans expression. En cas de sélection incompatible ou verrouillée, la commande entière est refusée avant modification.

Une cascade ou une durée qui dépasserait la fin de la composition est refusée. L’extension d’un média ou d’une précomposition au-delà de sa source disponible est également refusée hors remappage temporel. Le panneau ne rallonge pas automatiquement la composition et ne sauvegarde pas le projet.

## Mises à jour

Depuis la version **0.2.0**, le panneau recherche une nouvelle release stable à l’ouverture. Une notification apparaît dans le pied du panneau si une version plus récente existe. Le menu de réglages permet aussi une recherche manuelle, puis **Installer la version…**. Le téléchargement est vérifié avant remplacement. Après installation, enregistrer son projet puis **redémarrer After Effects**. Aucun EXE à relancer.

Seules les releases publiées sur [3miMaximvs/lazy-motion](https://github.com/3miMaximvs/lazy-motion/releases) sont proposées. Un push sur `main` lance les vérifications ; une mise à jour devient disponible lorsqu’un tag de version est publié. Le panneau ne télécharge ni n’installe une mise à jour sans clic sur Installer.

La recherche utilise l’API publique GitHub sans identifiant. Hors connexion ou en cas de limite GitHub, les outils motion restent utilisables ; la recherche peut être relancée depuis les réglages. Les notes de version sont affichées comme texte, sans HTML distant. Le navigateur du panneau conserve une politique réseau fermée ; le module Node intégré à CEP effectue uniquement les requêtes HTTPS de mise à jour.

Le SHA-256 fourni par GitHub et la taille de l’archive doivent correspondre. L’extraction refuse les traversées de dossiers, liens, noms Windows spéciaux, doublons et archives trop volumineuses. La version et l’identité du panneau sont vérifiées. La version précédente reste dans `%APPDATA%\Adobe\CEP\.lazy-motion-updates\update-…\previous`. Si le remplacement échoue, elle est restaurée. Ce mécanisme vérifie l’intégrité du téléchargement ; il dépend de la sécurité du compte et du dépôt GitHub, sans signature Adobe.

## Installation et développement

### Première installation

Télécharger les trois fichiers de la [dernière release](https://github.com/3miMaximvs/lazy-motion/releases/latest) dans un même dossier : `lazy-motion-VERSION.zip`, `lazy-motion-VERSION.zip.sha256` et `Installer-Lazy-Motion.ps1`. Fermer After Effects, puis lancer le script PowerShell (clic droit → Exécuter avec PowerShell). Il vérifie l’archive et installe le panneau dans `%APPDATA%\Adobe\CEP\extensions\dev.lazyapps.motion`. Ce script n’est nécessaire qu’à la première installation, ou pour une réinstallation manuelle. Il n’installe aucun programme supplémentaire et ne demande pas les droits administrateur.

Il s’agit d’une extension personnelle **non signée Adobe**. Le script active le chargement des extensions locales non signées pour CEP 12 sur le compte Windows courant. Le réglage initial est conservé dans le dossier de sauvegarde d’installation. Si une politique Windows interdit les scripts, une installation manuelle du dossier du panneau et l’activation du mode développeur CEP sont nécessaires ; l’installeur ne modifie pas la politique Windows.

### Développement

Pour reconstruire : `npm ci`, `npm run check`, puis `npm run build`. Fermer le panneau, exécuter `scripts/install-dev.ps1`, puis rouvrir Lazy Motion. Un redémarrage d’After Effects peut être nécessaire après un changement du manifeste ou du libellé de menu.

L’installation de développement active le chargement des extensions locales non signées pour **CEP 12** (`HKCU\Software\Adobe\CSXS.12\PlayerDebugMode=1`). La valeur initiale est conservée dans `artifacts/cep-dev-setting-before-install.json`. Ce réglage concerne les extensions CEP 12 de ce compte. Aucune préférence d’accès disque/réseau des scripts After Effects n’est modifiée.

Le panneau installé fonctionne **hors connexion et sans serveur**. L’aperçu de développement est distinct : `npm run dev`, puis `http://localhost:4173/?preview`. Il est marqué « Aperçu », utilise des calques simulés et ne modifie aucun projet Adobe. Le serveur écoute uniquement les adresses locales de cet ordinateur.

## Composants et licences

PanelUI **Button, Input, Frame, Select, ButtonGroup et Tooltip** : sources officielles conservées dans `vendor/panelui/` et extraites sans modification dans `src/panelui/`. Le style est adapté séparément aux limites CSS de Chromium 99 / CEP 12. JavaScript compilé pour Chrome 99 ; dépendances verrouillées.

Logo paresseux et police Geist issus du projet LazyApps de l’utilisateur. Palette noir `#0B0B0B`, blanc cassé `#F4F4F1`, orange `#FF4A1C`. Icônes Phosphor. Licences incluses dans `dist/licenses/` et avis dans `THIRD_PARTY_NOTICES.md`.

## Vérifications

- TypeScript et **28 tests automatiques** de comportement, dont les mises à jour, la restauration après échec et les archives malformées (tests d’extraction Windows).
- **10 scénarios natifs dans After Effects 26.0x67**, sur des projets de démonstration uniquement : cascade dans les deux sens, durée, verrouillage, neuf ancrages, rotation/échelle, position animée et séparée, refus du 3D, cadence 29,97 i/s.
- Comparaison visuelle à la maquette et essais interactifs à 380 px et 300 px de large.

Les scripts de démonstration et de vérification restent dans `scripts/` et ne sont pas distribués dans le panneau installé. `scripts/create-demo.jsx` refuse un projet non vide ; `scripts/verify-native.jsx` refuse tout projet autre que les fichiers de test nommés du dossier `artifacts/`.

## Publier une version

Mettre à jour `package.json`, `package-lock.json`, les deux versions de `CSXS/manifest.xml` et `docs/release-notes.md`. Vérifier avec `npm run check`, `npm run build`, `npm run package`. Pousser ensuite un tag correspondant exactement à la version, par exemple `v0.3.0`. GitHub Actions reconstruit sur Windows, relance les tests et publie le ZIP, son SHA-256 et le script de première installation. La release est ensuite détectée par les panneaux installés. Les versions de test avec suffixe ne sont pas proposées par cette première version du système de mise à jour.

Le dépôt public permet les téléchargements sans compte GitHub dans After Effects. Les fichiers de projets, sauvegardes, rapports locaux et paramètres de ce poste ne sont pas publiés. Le branding LazyApps reste la propriété de son titulaire ; les licences des dépendances sont détaillées dans les avis tiers. Aucune licence libre supplémentaire n’est accordée au code et au branding de ce projet par sa seule publication.
