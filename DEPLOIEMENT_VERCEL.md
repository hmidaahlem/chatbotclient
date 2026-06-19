# Guide de Déploiement Vercel (Chatbot Client)

Ce document explique comment déployer l'application client Chatbot Next.js sur Vercel. Cette méthode est idéale pour les présentations (PFE) car elle permet aux membres du jury de scanner un QR Code et d'accéder au Chatbot depuis leurs téléphones, tout en se connectant en toute sécurité à la base de données distante `AlwaysData`.

## Étapes de Déploiement

### 1. Importer le projet
1. Connectez-vous à [Vercel.com](https://vercel.com) en utilisant votre compte GitHub.
2. Cliquez sur le bouton **"Add New..."** et sélectionnez **"Project"**.
3. Dans la liste de vos dépôts GitHub, trouvez `AeroServe` et cliquez sur **"Import"**.

### 2. Configurer le répertoire source (Très Important ⚠️)
Puisque le Chatbot n'est pas à la racine du dépôt, vous devez indiquer à Vercel où le trouver :
1. Sur la page de configuration du projet, repérez la section **"Root Directory"**.
2. Cliquez sur le bouton **"Edit"**.
3. Sélectionnez le dossier `chatbot_client` dans la liste déroulante et sauvegardez.

### 3. Ajouter les variables d'environnement
Afin de protéger vos mots de passe et clés API, ils ne doivent pas être visibles dans le code source. Vous devez les ajouter dans Vercel :
1. Descendez jusqu'à la section **"Environment Variables"** et développez-la.
2. Ajoutez les 6 variables suivantes (une par une), exactement comme elles apparaissent dans votre fichier `.env.local` :

| Nom (Name) | Valeur (Value) |
|---|---|
| `DB_HOST` | `mysql-billelz.alwaysdata.net` |
| `DB_PORT` | `3306` |
| `DB_USER` | `billelz_admin` |
| `DB_PASSWORD` | `ahlemhmida40@gmail.com` |
| `DB_NAME` | `billelz_aeroserve` |
| `GROQ_API_KEY` | `gsk_votre_cle_api_ici...` |

*Remarque : Vercel chiffrera ces données et les gardera secrètes.*

### 4. Lancer le Déploiement
1. Cliquez sur le gros bouton noir **"Deploy"**.
2. Patientez environ 1 à 2 minutes pendant que Vercel construit votre application.
3. Une fois terminé, Vercel vous fournira une URL publique (ex: `https://aeroserve-chatbot.vercel.app`).

### 5. Créer le QR Code (Jury PFE)
- Copiez l'URL fournie par Vercel.
- Utilisez un générateur de QR Code en ligne (comme QRCode Monkey) pour générer un code.
- Imprimez ce code ou affichez-le sur votre présentation pour que le jury puisse le scanner avec leurs téléphones portables.

---
**Félicitations !** Votre assistant intelligent AeroServe est maintenant en direct sur le cloud ! 🚀
