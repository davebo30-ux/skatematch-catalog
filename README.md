# Synchronisation des flux SkateMatch

Ce dossier contient le premier normaliseur de catalogues pour SkateMatch. Il lit uniquement les sources déclarées dans `feeds.json`, conserve les produits de type plateau, trucks, roues et roulements, puis produit `data/catalog.json`.

Sources actuellement configurées :

- BUD Skateshop et OKLA Shop : API publiques WooCommerce Store.
- WallStreet, Buzzz, Circle, Ollieday, Freedom, Numéro 4, Official, Balargue, Bird, Born2ride, Le Père Skateur et Woodstock : catalogues JSON Shopify.
- Central Sk8 Shop, Bass, Bamboo, City et Jack'n Roll : flux JSON publics des catégories PrestaShop.
- Lockwood Skateshop : catalogue JSON public Big Cartel.
- Shifty Board Shop, Nozbone Skateshop et Snowbeach : catégories publiques PrestaShop ou Magento, lues sans dépendance externe.

Pour les boutiques proposant aussi du longboard, des trottinettes ou des rollers, seules les catégories skateboard correspondant aux plateaux, trucks, roues et roulements sont interrogées. Les catalogues de Riot et SB Skateshop refusent actuellement les requêtes automatisées et ne sont donc pas intégrés.

Sources étudiées mais non connectées :

- Play Skateshop : boutique PrestaShop, catégories publiques à vérifier séparément.
- Novoid Plus : aucun catalogue JSON public identifié.
- Blue Tomato : plateforme propriétaire et enseigne non indépendante, donc priorité basse.

## Exécution

Node.js 20 ou supérieur suffit, sans dépendance externe :

```bash
npm test
npm run sync
```

Le workflow `.github/workflows/sync-feeds.yml` exécute ces vérifications et actualise automatiquement le catalogue deux fois par jour, à 05:00 et 17:00 UTC. L’application Android lit uniquement le catalogue public généré ; elle n’interroge pas directement tous les shops.

Le fichier `data/status.json` présente le nombre d'offres par catégorie, les boutiques actives et celles momentanément indisponibles, sans devoir télécharger l'intégralité du catalogue.

Quand un flux fournit un prix de référence supérieur au prix actuel, le catalogue publie aussi `regularPrice`. L’application peut ainsi afficher uniquement de vraies promotions et calculer leur pourcentage sans inventer de remise.

Les trucks vendus à l’unité indiquent une quantité de deux pour la composition d’un skateboard complet. Les accessoires de nettoyage, lubrifiants, pièces isolées et roulements vendus individuellement sont exclus des recommandations.

Si un shop refuse temporairement le serveur GitHub ou tombe en panne, ses derniers produits valides sont conservés et la source est indiquée comme `stale`, afin d’éviter qu’une boutique entière disparaisse du catalogue.
