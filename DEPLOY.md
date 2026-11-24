# Mettere la chat online con Render (gratis)

Il progetto è già pronto: `npm start` avvia il server di produzione, `render.yaml` contiene la configurazione e `.gitignore` esclude `node_modules` e i file `.env`.

## 1. Carica il progetto su GitHub

1. Crea un account su https://github.com e un repository nuovo, vuoto (es. `chat`). Può essere anche privato.
2. Apri PowerShell in questa cartella ed esegui (sostituisci `TUO-UTENTE`):

```powershell
git init
git add .
git commit -m "chore: prima versione"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/chat.git
git push -u origin main
```

## 2. Collega Render

1. Vai su https://render.com e accedi con GitHub.
2. **New → Blueprint**, scegli il repository `chat` e conferma: Render legge `render.yaml` da solo.
   - In alternativa: **New → Web Service**, scegli il repository e imposta
     Build Command `npm install --omit=dev`, Start Command `npm start`, piano **Free**.
3. Dopo 1–2 minuti ricevi il link, tipo `https://chat-xxxx.onrender.com`: funziona da qualsiasi rete.

## Da sapere

- Nel piano gratuito il server va in pausa dopo ~15 minuti senza visite: la prima apertura dopo la pausa impiega 30–60 secondi.
- A ogni pausa/riavvio i messaggi si perdono (non c'è un database).
- Chiunque abbia il link può entrare.
- Per aggiornare il sito: `git add .`, `git commit -m "..."`, `git push` → Render ripubblica da solo.

## In locale

- `npm start` → server normale
- `npm run dev` → riavvio automatico a ogni modifica (nodemon)
- `npm test` → test
