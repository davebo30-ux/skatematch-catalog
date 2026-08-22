# Synchronisation des flux SkateMatch

Ce dossier contient le premier normaliseur de catalogues pour SkateMatch. Il lit uniquement les sources déclarées dans `feeds.json`, conserve les produits de type plateau, trucks, roues et roulements, puis produit `data/catalog.json`.

Sources actuellement configurées :

- BUD Skateshop : API publique WooCommerce Store.
- WallStreet, Buzzz, Circle et Ollieday : catalogues JSON Shopify.

Sources étudiées mais non connectées :

- Play Skateshop : boutique PrestaShop, API produits protégée par une clé.
- Novoid Plus : aucun catalogue JSON public identifié.
- Blue Tomato : plateforme propriétaire et enseigne non indépendante, donc priorité basse.

## Exécution

Node.js 20 ou supérieur suffit, sans dépendance externe :

```bash
npm test
npm run sync
```

Le workflow `.github/workflows/sync-feeds.yml` exécute ces vérifications et actualise automatiquement le catalogue deux fois par jour, à 05:00 et 17:00 UTC. L’application Android lit uniquement le catalogue public généré ; elle n’interroge pas directement tous les shops.

Les trucks vendus à l’unité indiquent une quantité de deux pour la composition d’un skateboard complet. Les accessoires de nettoyage, lubrifiants, pièces isolées et roulements vendus individuellement sont exclus des recommandations.
