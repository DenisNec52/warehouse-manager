/**
 * components/ui/MovementTypeBadge.jsx — badge Entrata/Uscita riutilizzabile
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import clsx from "clsx";

export default function MovementTypeBadge({ type, size = 10 }) {
  const isIn = type === "IN";
  return (
    <span className={clsx("badge", isIn ? "badge-green" : "badge-red")}>
      {isIn ? <ArrowDown size={size}/> : <ArrowUp size={size}/>}
      {isIn ? "Entrata" : "Uscita"}
    </span>
  );
}
