# Esempi per l'import dei Tempi Standard

Metti **qui dentro** i file di esempio reali, così il parser viene scritto sul formato
vero e non su uno inventato. Idealmente due file:

1. **Un Excel reale** → `esempio.xlsx` (o `.xls` / `.csv`)
   Quello che usi davvero per i tempi standard, anche disordinato: colonne in
   ordine diverso, righe vuote, intestazioni su più righe, celle unite... va bene.
   Serve proprio a vedere com'è fatto nella realtà.

2. **Una foto del foglio** → `esempio-foto.jpg` (o `.png`)
   Es. il foglio plastificato di reparto. Serve a tarare l'estrazione via Vision IA.

## Dati che ogni riga deve contenere (obiettivo del parser)

| Campo        | Obbligatorio | Esempio                        | Note |
|--------------|:------------:|--------------------------------|------|
| `tipologia`  | sì           | `Custodia IP65 (calandrata)`   | tipologia custodia |
| `dimensione` | no           | `Piccola (DN80-DN150)`         | vuoto se la tipologia è unica |
| `label`      | sì           | `IP65 Piccola`                 | nome breve mostrato nell'Andon |
| `minuti`     | sì           | `90`  oppure  `1:30`           | tempo per singolo pezzo (1–1440 min) |

Il **reparto** NON serve nel file: l'import avviene nel reparto già selezionato
nella pagina Tempi Standard.

## Cosa NON mettere
- Niente dati sensibili o riservati (non servono).
- Se la colonna del tempo è in formato `h:mm` (es. `1:30`) va benissimo: lo converto io in minuti.

Quando hai messo i file, dimmelo: leggo il formato e costruisco l'import (Excel + foto)
con anteprima prima del salvataggio.
