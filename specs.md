# Spécifications fonctionnelles — Secret

## Présentation et architecture

**Secret** est une application générique de création et de partage de tirages de cadeaux secrets. Elle n'est pas liée à une fête ou une saison particulière.

L'application est statique et fonctionne entièrement dans le navigateur : aucun backend, compte utilisateur ni base de données ne sont nécessaires. Le navigateur génère le tirage et les liens privés, chiffre les données avec l'API native Web Crypto, puis les transporte dans les paramètres d'URL.

## Écran d'administration (`index.html`)

### Événement et participants

- Le nom de l'événement est obligatoire et limité à 100 caractères. Le caractère `§`, utilisé comme séparateur des données chiffrées, n'est pas autorisé.
- Un tirage requiert au moins trois participants.
- Un participant doit avoir un nom non vide, limité à 100 caractères. Les noms sont uniques sans distinction de casse et après suppression des espaces superflus. Le caractère `§` est interdit.
- Un message explicite est affiché en cas de doublon.
- Chaque participant peut être assigné à un autre participant ou laissé en mode `Tirer au sort`. Il n'est pas possible de se désigner soi-même.
- Les choix d'attribution proposés sont actualisés quand la liste change. Si un participant supprimé était une cible manuelle, l'attribution correspondante revient au tirage au sort.

### Génération du tirage

- Le bouton de génération est activé à partir de trois participants.
- L'algorithme produit une attribution complète : chaque participant donne et reçoit exactement une fois, sans auto-attribution ni échange réciproque, tout en respectant les attributions manuelles.
- Si ces contraintes ne peuvent pas être satisfaites, aucun lien n'est généré et le message `Tirage impossible. Vérifiez les attributions manuelles et évitez les échanges réciproques.` est affiché.
- En cas de succès, la page présente un lien privé par participant. Un lien déchiffré révèle seulement le nom de l'événement, le donneur et son destinataire.
- Chaque lien personnel peut être copié séparément.

### Modifications après génération

Après génération, toute modification confirmée de l'événement, des participants ou des attributions demande une confirmation. Si seul le nom de l'événement change, les liens sont renouvelés avec ce nom, mais les attributions (qui offre à qui) restent identiques. Si les participants ou les attributions changent, les anciens liens sont supprimés et l'administration revient à l'étape de préparation. Une annulation conserve le tirage.

Un clic sur « Générer les liens privés » lorsqu'un tirage existe demande confirmation avant de le remplacer par un nouveau tirage. Une annulation conserve le tirage et ses liens.

### Reprise de l'administration et historique

- L'état administratif est chiffré dans le paramètre `state` de l'URL. Il comprend le nom de l'événement, les participants et leurs attributions, les saisies en cours et les liens déjà générés.
- Les brouillons ne sont pas chiffrés à chaque caractère : l'état est enregistré lors des interactions prévues, notamment quand un champ perd le focus ou qu'un participant est ajouté.
- Le dernier état est également conservé sous forme chiffrée dans le stockage local du navigateur. À l'ouverture de `index.html` sans paramètre `state`, si une sauvegarde existe, l'application propose de la rétablir ; si l'utilisateur choisit de commencer sans, l'URL de ce dernier état est ajoutée à l'historique du navigateur puis la sauvegarde locale est supprimée.
- Chaque enregistrement ajoute une entrée à l'historique du navigateur. Les boutons précédent/suivant restaurent l'état correspondant et le rechargement restaure l'état de l'URL.
- Après la génération, l'interface affiche l'URL d'administration complète et permet de la copier pour reprendre ultérieurement l'accès aux résultats.
- Le bouton « Vider le formulaire » ajoute l'état courant à l'historique du navigateur, puis vide tous les champs et remplace l'entrée courante par l'état vide. Si un tirage a été généré, une confirmation prévient que ses liens seront perdus.
- Quand le formulaire est vide, le bouton principal propose de visualiser un exemple. Au premier usage, l'application calcule un tirage pour chacune des équipes en mémoire ; les visualisations suivantes de la page réutilisent ces mêmes états et liens. Elle choisit aléatoirement une équipe, préremplit l'événement et les participants ; dès qu'une saisie commence, le bouton reprend son libellé et son comportement habituels. Si l'état correspond à un exemple connu, y compris après restauration depuis son URL, le bouton propose d'en visualiser un autre ; après confirmation, une autre équipe est choisie au hasard.

## Écran participant (`secret.html`)

- Chaque lien individuel ouvre `secret.html` avec un paramètre `token`.
- Si le jeton est valide, la page affiche le nom de l'événement, le nom du donneur et le nom de son destinataire.
- Si le jeton est absent, altéré ou illisible, la page n'affiche pas d'attribution et indique que le lien est invalide ou corrompu.

## Chiffrement et confidentialité

- Les attributions et l'état administratif sont chiffrés côté navigateur avec AES-GCM et l'API Web Crypto. Les deux usages emploient des clés distinctes.
- Le vecteur d'initialisation est aléatoire et préfixé aux données chiffrées. Le résultat est encodé en Base64URL pour être transportable dans une URL.
- Les clés sont intégrées au code JavaScript. Le chiffrement masque les informations dans les URL, mais ne constitue pas un contrôle d'accès : une personne qui inspecte l'application peut retrouver les clés. Les liens ne doivent donc pas être considérés comme une protection contre un utilisateur technique ou malveillant.
- L'application ne dispose pas de backend et n'enregistre pas les tirages sur un serveur. Les URL contenant `state` ou `token` donnent accès à des données du tirage : elles doivent être conservées et partagées avec précaution.
- Le stockage local ne contient que des états chiffrés. Il reste propre à ce navigateur et n'est pas une sauvegarde serveur ; supprimer les données du site l'efface.
- Le déploiement doit fournir les pages en HTTPS afin que Web Crypto et les fonctions de presse-papiers soient disponibles dans un contexte sécurisé.

## Vérification

Les tests unitaires sont lancés avec `pnpm test`. Ils couvrent la création de tirages, les contraintes impossibles, les noms homonymes, la validité des liens et la sérialisation/restauration de l'état administratif.
