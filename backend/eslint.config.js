const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs", globals: globals.node },
    rules: {
      // _next: il middleware di errore di Express deve avere 4 parametri anche se non usa next;
      // ({ _id, ...resto }) toglie un campo dall'oggetto. I catch che rispondono 500 senza usare
      // l'errore sono codice esistente (vedi nota nel riepilogo), non variabili dimenticate.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true, caughtErrors: "none" }],
    },
  },
  { files: ["tests/**/*.js"], languageOptions: { globals: { ...globals.node, ...globals.jest } } },
];
