# Travel Tracker

Application web locale multi-voyages avec analyse IA automatique des photos et reconnaissance faciale.

## Fonctionnalités

- **Multi-voyages** — créez et gérez plusieurs voyages (pays, carte centrée automatiquement)
- **Carte interactive** — photos positionnées via GPS (EXIF) ou géocodage IA
- **Analyse IA** — Claude analyse chaque photo : description, catégorie, lieu reconnu
- **Journal automatique** — résumés de voyage générés par IA, jour par jour
- **Reconnaissance faciale** — détection automatique des visages (InsightFace), groupage par similarité, nommage des personnes
- **Support iPhone** — gestion native des fichiers HEIC
- **Timeline** — vue chronologique avec grille de photos et récits

## Démarrage rapide

```bash
# 1. Configurer la clé API Anthropic
cp .env.example .env
# Éditer .env avec votre clé : ANTHROPIC_API_KEY=sk-ant-...

# 2. Lancer l'application
docker compose up -d --build

# 3. Ouvrir dans le navigateur
open http://localhost:5173
```

## Architecture

| Service  | Port | Tech                                    |
|----------|------|-----------------------------------------|
| Frontend | 5173 | React, Vite, Tailwind, Leaflet          |
| Backend  | 8000 | FastAPI, SQLAlchemy, InsightFace, Pillow |

Les photos, base de données et modèles de reconnaissance faciale sont stockés dans des volumes Docker persistants.

## Utilisation

1. Créer un voyage depuis le **Dashboard** (nom + pays)
2. Aller sur l'onglet **Ajouter** et glisser-déposer des photos
3. L'application extrait les coordonnées GPS, analyse via Claude, détecte les visages
4. Les photos apparaissent sur la **Carte** avec des marqueurs colorés par catégorie
5. Dans le **Journal**, cliquer sur "Générer le résumé" pour créer un récit de la journée
6. Dans **Personnes**, nommer les visages détectés pour l'auto-tag futur
