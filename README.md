# Secret

Secret est une application web statique pour organiser un tirage de cadeaux secret. L'organisateur ajoute les participants, peut fixer certaines attributions, puis génère un lien privé à envoyer à chaque personne. Chaque lien ne révèle que l'attribution de son destinataire.

L'application ne nécessite ni serveur applicatif, ni base de données, ni compte utilisateur. Le tirage s'effectue dans le navigateur. Une URL d'administration chiffrée permet de reprendre le formulaire et de retrouver les liens générés.

Les [spécifications fonctionnelles](./specs.md) décrivent en détail les règles de tirage, les liens, la reprise de l'administration et les limites de confidentialité.

## Déploiement

Secret peut être déployé sur n'importe quel hébergement de fichiers statiques :

1. Publiez les fichiers du projet à la racine du site ou d'un sous-répertoire : `index.html`, `secret.html`, `app.js` et `styles.css`.
2. Configurez l'hébergement pour servir `index.html` comme page d'accueil.
3. Activez HTTPS, requis pour l'API Web Crypto et la copie dans le presse-papiers.
4. Ouvrez l'adresse publiée et vérifiez qu'un tirage peut être créé et que les liens individuels ouvrent `secret.html`.

Aucune étape de compilation n'est nécessaire. Les URL de participants pointent vers `secret.html` dans le même répertoire que l'application. Les URL d'administration contiennent l'état chiffré : gardez-les privées et conservez-les pour retrouver un tirage.

## Tests

Les tests unitaires utilisent le runner intégré à Node.js :

```sh
pnpm test
```

## Licence

Ce projet est distribué sous la licence WTFPL v2. Voir [LICENSE](./LICENSE).
