# CONTINUE — cosa resta da fare

Aggiornato: 2026-10-24. Branch: `fix/import-tempi-standard-intestazioni` → **PR #10**
(https://github.com/DenisNec52/warehouse-manager/pull/10), base `main` @ `52eec9f` (PR #9 già unita).

## Stato attuale (fatto, nella PR #10)
- **Import Tempi standard**: riconosce le intestazioni del foglio saldatura ("Temp standard (a pezzo)").
  Dal foglio di prova salva 5 custodie (una per tipologia × grandezza).
- **Import Andon**: legge il foglio anche con valori grezzi (data come numero seriale Excel 46315 o
  testo gg/mm/aaaa, tempi come frazione di giorno, intestazioni su più righe).
- **Firme automatiche**: le colonne Firma del foglio NON si importano. Sulla riga Andon:
  `Inizia` (chi prende la commessa) → `Finisci` (lo stesso o un altro). Salva nome, utente e ora.
  Update atomici: due clic insieme → il secondo riceve 409. `annulla` solo supervisori/admin.
  Rotte: `POST /api/production/entries/:id/start | finish | undo`.
  Campi nuovi su `ProductionEntry`: `iniziataDa/At`, `finitaDa/At` (+ `firmaInizio/firmaFine` = nome).
- **Tabella Andon** a colonne separate: Comm., Inizio/Fine, Pos., Cliente, Q.tà, Tipologia, DN,
  Ø Elem. (mm), Grandezza, Temp standard, Atteso, Impiegato, Eff.
- Fix: "Atteso" ed "Eff." per riga mostravano "—" / NaN% (lista con `.lean()` senza virtual).
- Verifiche (24/10): backend 152/152 test, lint backend+frontend puliti, build OK, controllo in Chrome
  su MongoDB in memoria (mai il DB del `.env`).

## Da fare — Denis
1. ~~Unire la PR #10 su `main`~~ — fatto (merge diretto). Controllare che Render e Vercel abbiano pubblicato.
2. **Variabile d'ambiente `GITHUB_TOKEN` non valida**: toglierla o rinnovarla. Oggi il push
   funziona solo ignorandola (`env -u GITHUB_TOKEN -u GH_TOKEN git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`).
3. **Node ≥ 20.19** su Vercel/CI (lo richiede Vite 8).
4. Decidere cosa fare di `backend/samples/standard-times/Test foglio.png` (non committato:
   è uno screenshot che mostra anche l'interfaccia di un altro programma).

## Fatto il 2026-10-24 (dopo la prima versione di questo file)
- Intestazioni come nel foglio in tabella, import e form: Comm., Pos., Cliente, Q.tà (n°),
  Tipologia, DN, Ø Elem. (mm), Grandezza, Temp standard.
- Super-admin nascosto anche nelle firme Inizio/Fine (lista, report, export).
- Export Excel (foglio "Dati"): tutte le colonne del foglio + Lavorazione, Firma/Ora inizio,
  Firma/Ora fine (ora italiana).
- "Nuova riga": firmata da chi la registra (e finita se ha la data fine); campi Cliente, DN,
  Ø Elem.; tipologia e grandezza salvate separate dalla tabella tempi.
- Righe importate ora modificabili (prima il form chiedeva una tipologia a catalogo e non si
  poteva salvare); modificandole l'operatore resta "non assegnato".
- Migrazione `2026-10-24-andon-firme` (automatica all'avvio): righe esistenti a mano risultano
  firmate; righe con la firma scritta nel foglio risultano iniziate/finite.

## Da fare — sviluppo
1. **Tempo impiegato**: resta = STD × pezzi, correggibile a mano (ora anche sulle righe
   importate). Decidere se calcolarlo da Inizia→Finisci (attenzione a pause e notte).
2. **Prova da telefono** di Inizia/Finisci con un operatore vero (tabella larga: la colonna
   Inizio/Fine è subito dopo Comm. apposta).
3. Le righe precedenti alla PR #9 non hanno fase, tipologia e grandezza separate.
4. Facoltativo: import incollando il testo copiato da Excel (oltre al file .xlsx).
5. Facoltativo: un solo import che crea le righe Andon E aggiorna i Tempi standard.

## Rimasto in sospeso da prima
- Bump di versione (package.json è ancora `1.0.0`) e tag di release.
- Stash `WIP lettore barcode (segreto hex + parser tollerante)` — da riprendere dopo i reparti.

## Promemoria per chi riprende
- **Mai eseguire script di `backend/utils/`** (seed/import) né avviare il backend con il `.env`:
  scrivono sul database vero. Test e prove solo su `mongodb-memory-server`
  (`npm test` in `backend/`, che usa `--runInBand`).
- File di prova: `backend/samples/standard-times/foglio-saldatura-esempio.xlsx` (10 capi, 20/10/2026, clienti anonimizzati).
- Test principali: `backend/tests/andon-import.test.js`, `backend/tests/standard-times-import.test.js`.
