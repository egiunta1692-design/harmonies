# Harmonies Online — setup da zero

Guida pensata per chi usa **Visual Studio Code** e non ha mai usato Supabase.
Segui i passi in ordine, sono tutti necessari per far partire il progetto.

## 0. Cosa ti serve installato

- **Node.js** (versione 18 o superiore). Verifica aprendo un terminale (in VS Code: `Terminal` → `New Terminal`) e digitando:
  ```
  node -v
  ```
  Se non è installato, scaricalo da https://nodejs.org (versione "LTS").
- **VS Code** (che presumo tu abbia già).

## 1. Apri il progetto in VS Code

Scompatta la cartella `harmonies-online` da qualche parte sul tuo computer, poi:
- `File` → `Open Folder...` → seleziona la cartella `harmonies-online`.
- Apri il terminale integrato: `Terminal` → `New Terminal` (o **Ctrl+`**). Da qui lancerai tutti i comandi.

## 2. Installa le dipendenze

Nel terminale di VS Code:
```
npm install
```
Scarica React, Vite e il client Supabase dentro `node_modules` (non serve toccarla mai a mano).

## 3. Crea un account e un progetto Supabase

Supabase è il servizio che ti dà gratis il database, l'autenticazione e la sincronizzazione in tempo reale. Ecco esattamente cosa cliccare:

1. Vai su **https://supabase.com** e clicca **"Start your project"** (in alto a destra).
2. Registrati con GitHub, Google o email — scegli quello che ti è più comodo, non cambia nulla per il progetto.
3. Se te lo chiede, crea una **organizzazione** (basta un nome a caso, es. il tuo nome) — è solo un contenitore, gratuito.
4. Clicca **"New project"**.
5. Compila il form:
   - **Name**: `harmonies-online` (o quello che vuoi)
   - **Database Password**: generane una robusta e **salvala da qualche parte** (non ti servirà nel codice, ma è utile in caso di emergenza)
   - **Region**: scegli quella più vicina a te (es. `Central EU (Frankfurt)` se sei in Italia)
   - Piano: quello gratuito è già selezionato di default
6. Clicca **"Create new project"** e aspetta 1-2 minuti mentre Supabase prepara il database (vedrai una schermata di caricamento).

## 4. Recupera le chiavi API

Una volta che il progetto è pronto:
1. Nel menu laterale sinistro della dashboard Supabase, clicca l'icona a forma di **ingranaggio** (**Project Settings**), poi **API** (oppure vai direttamente su `Project Settings` → `Data API` a seconda della versione della dashboard).
2. Copia due valori:
   - **Project URL** (qualcosa tipo `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key** (una stringa lunga che inizia con `eyJ...`)

Torna in VS Code:
1. Nella cartella del progetto trovi un file `.env.example`. Duplicalo e rinomina la copia in `.env` (in VS Code: click destro sul file → `Copy`, poi click destro nella cartella → `Paste`, poi rinomina).
2. Apri `.env` e incolla i due valori:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
   ```
3. Salva il file. **Non condividere mai questo file** (è già escluso da Git tramite `.gitignore`).

## 5. Crea le tabelle nel database

1. Nella dashboard Supabase, menu laterale → **SQL Editor**.
2. Clicca **"New query"**.
3. Apri in VS Code il file `supabase/schema.sql`, copia **tutto** il contenuto.
4. Incollalo nell'SQL Editor di Supabase e clicca **"Run"** (in basso a destra, o **Ctrl+Enter**).
5. Dovresti vedere "Success. No rows returned" — significa che le tabelle `games`, `players` e `moves` sono state create, con la sincronizzazione in tempo reale già attiva.

Se vuoi verificare: menu laterale → **Table Editor**, dovresti vedere le 3 tabelle.

> Nota: lo script include anche dei `grant` espliciti (`games`, `players`, `moves` → ruolo `authenticated`). Sono necessari perché dal 30 maggio 2026 Supabase non espone più le tabelle alla Data API per default: senza questi `grant`, il client riceverebbe un errore `42501: permission denied` anche con RLS e policy corrette. Se durante la creazione del progetto hai spuntato **"Enable automatic RLS"**, nessun problema: è compatibile con questo script, aggiunge solo una rete di sicurezza in più per eventuali tabelle future.

## 6. Abilita il login anonimo

Il progetto fa entrare i giocatori senza email/password (solo un nickname), quindi serve attivare un'opzione:

1. Nella dashboard Supabase, menu laterale → **Authentication**.
2. Vai nella sezione **Sign In / Providers** (oppure **Configuration**, a seconda della versione della dashboard).
3. Cerca l'opzione **"Allow anonymous sign-ins"** e attivala (toggle su ON).
4. Salva.

> Nota: la UI di Supabase cambia ogni tanto posizione a queste voci. Se non la trovi dove indicato, cerca "anonymous" nella barra di ricerca in alto nella dashboard — c'è sempre una scorciatoia che ti porta dritto all'impostazione.

## 7. Avvia il progetto

Torna al terminale di VS Code e lancia:
```
npm run dev
```
Vedrai un output tipo `Local: http://localhost:5173/`. **Ctrl+click** su quel link per aprirlo nel browser (o copialo manualmente).

Da qui puoi:
- Inserire un nickname e cliccare **"Crea una nuova stanza"** → ti genera un codice stanza e ti porta nella pagina di gioco (ancora vuota di regole, solo lo scheletro).
- Aprire un'altra scheda/browser, inserire un altro nickname, e usare **"Entra in una stanza"** con il codice generato prima, per simulare un secondo giocatore.

Se tutto funziona, vedrai la stessa `room_code` e la lista giocatori aggiornarsi in tempo reale tra le due schede: è la prova che Realtime funziona.

## Cosa funziona adesso

- Creazione/accesso stanza, login anonimo, sincronizzazione realtime.
- Rientro sicuro in una stanza già joinata (es. dopo un refresh) senza errori di riga duplicata.
- Avvio partita: assegna l'ordine dei turni; ogni giocatore ha già una plancia vuota fin da quando è entrato.
- Presa dei 3 dischi da una casella della plancia centrale, con possibilità di **cambiare casella** finché non hai piazzato un disco (i dischi tornano al loro posto).
- Piazzamento con **ordine libero**, **Annulla ultima azione**, **Annulla tutto il turno**, **Conferma turno**.
- **Dischi e cubi Animale condividono un'unica cronologia di turno**: puoi piazzare un cubo usando un habitat formato da un disco messo giù pochi istanti prima, nello stesso turno — esattamente come nell'esempio di Serena a pag. 6 del manuale. Tutto resta annullabile (singola azione o intero turno) finché non confermi.
- La plancia esagonale mostra la pila di ogni casella come barre colorate impilate (ordine e tipo visibili, non solo il colore in cima).
- **Carte Animale**: riga di 5 carte scoperte, presa di 1 carta per turno (limite 4 carte attive, annullabile prima di piazzare un cubo da essa), con dati reali di nome/punti/numero cubi per tutte e 32 le carte.
- **Cubi Animale**: per le 9 carte con pattern Habitat disponibile, il motore trova dove il pattern è formato (in qualsiasi delle 6 rotazioni) ed evidenzia le caselle valide in giallo. Il diagramma di ogni carta mostra i livelli reali della pila (non solo colori piatti) e le 3 opzioni di base per gli Edifici.
- **Plance degli altri giocatori**: visualizzazione in sola lettura, con le loro carte Animale mostrate con lo stesso dettaglio delle tue.

## Pattern Habitat: stato attuale

**Tutte e 32 le carte hanno ora un pattern Habitat codificato.** Confidenza:

- **Alta**: le 9 coppie a 2 tessere (Coccinelle, Rane, Suricati, Koala, Anatre, Pipistrelli, Pesci, Facoceri, Falchi) e Corvi (confermato anche da una foto della carta reale, non solo dalla scheda riassuntiva).
- **Media**: le restanti 22 carte (catene a 3 tessere e cluster a triangolo). Colori e posizione del cubo letti con buona sicurezza dalla foto ad alta risoluzione; la forma esatta (fila dritta vs triangolo) resta un giudizio visivo da un'icona piccola. Se in gioco una carta non si forma mai pur avendo la disposizione giusta sul tavolo, segnalala e la correggo — è una modifica isolata in `src/game-engine/animalCards.js`.

## Cosa manca ancora (prossimi step)

- Validazione server-side (Edge Function) — per ora il client scrive direttamente su Postgres.
- Nessun trigger di fine partita automatico: le condizioni di fine (pag. 7) e la schermata di punteggio finale non sono ancora collegate all'interfaccia — il motore (`scorePlayerBoard`) è pronto e testabile, manca solo il "chiama questa funzione quando la partita finisce".

## Modalità plancia: Standard (Fiume) vs Isole

Le plance giocatore sono stampate su due lati (vedi foto fornita): lato "Standard" (punteggio Fiume) e lato "Isole" (punteggio Isole). Chi crea la stanza sceglie la modalità in `Lobby.jsx`; tutti i giocatori della partita la condividono (salvata in `games.board_mode`), ed è visibile in cima alla stanza.

**Forma della plancia**: 5 righe di 6, 6, 6, 6, 5 caselle, letta dalla foto delle plance fisiche fornita (`src/game-engine/hexGrid.js`) — non più un segnaposto.

## Punteggio finale (`src/game-engine/scoring.js`)

Implementato: Alberi, Montagne (con regola di adiacenza), Campi, Edifici, Acqua (Fiume o Isole a seconda della modalità), carte Animale. Confidenza:

- **Alta**: quali forme contano, come raggrupparle, condizioni di adiacenza — tutto testuale dal manuale.
- **Alta**: tutti i valori numerici (Alberi/Montagne 1/3/7, Campi e Edifici 5 fissi, tabella Fiume 0/2/5/8/11/15 +4/disco oltre il sesto, Isole 5 fisse) sono confermati da una scheda ufficiale "Tallying Points" fornita dall'utente — non più una ricostruzione dagli esempi del manuale.

## Problemi comuni

- **"Mancano VITE_SUPABASE_URL..."** in console → hai dimenticato di creare `.env` o di riavviare `npm run dev` dopo averlo creato (Vite legge le variabili d'ambiente solo all'avvio: fermalo con **Ctrl+C** nel terminale e rilancia `npm run dev`).
- **"Stanza non trovata"** quando entri con un codice → controlla di aver copiato il codice esatto (maiuscole incluse) generato dall'altro giocatore.
- Errori tipo `row-level security policy` nel terminale/console del browser → di solito significa che il login anonimo (punto 6) non è attivo, oppure che le policy in `schema.sql` non sono state eseguite per intero.
