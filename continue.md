# CONTINUE — cosa resta da fare

Aggiornato: 2026-10-23. Branch: `fix/import-tempi-standard-intestazioni` → **PR #10**
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
- **Tabella Andon** a colonne separate: Commessa, Inizio/Fine, Pos., Cliente, Q.tà, Tipologia, DN,
  Ø Elem., Grandezza, STD/pz, Atteso, Impiegato, Eff.
- Fix: "Atteso" ed "Eff." per riga mostravano "—" / NaN% (lista con `.lean()` senza virtual).
- Verifiche: backend 146/146 test, lint backend+frontend puliti, build OK, controllo in Chrome
  su MongoDB in memoria (mai il DB del `.env`).

## Da fare — Denis
1. **Unire la PR #10 su `main`**: Render (backend) e Vercel (frontend) pubblicano solo da `main`.
2. **Variabile d'ambiente `GITHUB_TOKEN` non valida**: toglierla o rinnovarla. Oggi il push
   funziona solo ignorandola (`env -u GITHUB_TOKEN -u GH_TOKEN git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`).
3. **Node ≥ 20.19** su Vercel/CI (lo richiede Vite 8).
4. Decidere cosa fare di `backend/samples/standard-times/Test foglio.png` (non committato:
   è uno screenshot che mostra anche l'interfaccia di un altro programma).

## Da fare — sviluppo (in ordine di priorità)
1. **Super-admin invisibile anche nelle firme** (regola di HANDOFF.md): `hiddenSuperAdminId`
   in `GET /entries` maschera solo `operatoreNome`; va applicato anche a `firmaInizio` e
   `firmaFine` (e nei report/export se le firme vi compaiono). + test.
2. **Export Excel / report Andon**: verificare che includano le nuove colonne separate
   (Pos., Cliente, Tipologia, DN, Ø Elem., Grandezza) e le firme Inizio/Fine con l'ora
   (`backend/utils/andonExcel.js`, `andonReport`). Non ancora controllato.
3. **Righe inserite a mano ("Nuova riga")**: oggi mostrano anche loro il pulsante Inizia,
   ma sono lavori già fatti. Proposta: alla creazione mettere in automatico firma di inizio
   (= operatore) e, se c'è `dataFine`, anche quella di fine.
4. **Tempo impiegato**: resta = STD × pezzi, correggibile a mano. Decidere se calcolarlo da
   Inizia→Finisci (attenzione a pause e notte: forse solo se stesso giorno, o con conferma).
5. **Righe importate prima della PR #10**: possono avere `firmaInizio/firmaFine` come testo
   dal foglio ma senza `iniziataAt` → mostrano comunque "Inizia". Valutare una migrazione
   (svuotare le firme testuali, o considerarle iniziate). Le righe precedenti alla PR #9 non
   hanno nemmeno fase, tipologia e grandezza separate.
6. **Ruolo operatore sul telefono**: provare Inizia/Finisci da mobile (tabella larga:
   la colonna Inizio/Fine è subito dopo Commessa apposta, ma va vista su schermo piccolo).
7. Facoltativo: import incollando il testo copiato da Excel (oltre al file .xlsx).
8. Facoltativo: un solo import che crea le righe Andon E aggiorna i Tempi standard.

## Rimasto in sospeso da prima
- Bump di versione (package.json è ancora `1.0.0`) e tag di release.
- Stash `WIP lettore barcode (segreto hex + parser tollerante)` — da riprendere dopo i reparti.

## Promemoria per chi riprende
- **Mai eseguire script di `backend/utils/`** (seed/import) né avviare il backend con il `.env`:
  scrivono sul database vero. Test e prove solo su `mongodb-memory-server`
  (`npm test` in `backend/`, che usa `--runInBand`).
- File di prova: `backend/samples/standard-times/TEST FOGLIO SALD.xlsx` (10 capi, 20/10/2026).
- Test principali: `backend/tests/andon-import.test.js`, `backend/tests/standard-times-import.test.js`.
