export default function CopyrightNotice({ className = "" }) {
  return (
    <p className={`text-center text-[11px] text-gray-400 dark:text-gray-500 ${className}`}>
      © {new Date().getFullYear()} Denis Alexandru Necula — Tutti i diritti riservati
    </p>
  );
}
