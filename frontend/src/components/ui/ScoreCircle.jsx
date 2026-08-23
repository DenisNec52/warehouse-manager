/**
 * components/ui/ScoreCircle.jsx — pallino punteggio % riutilizzabile
 */
import { scoreColorSoft } from "@/lib/format";

export default function ScoreCircle({ score, size = 36 }) {
  const { bg, text } = scoreColorSoft(score);
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: bg, color: text, fontSize: size <= 36 ? 12 : 14 }}>
      {score}%
    </div>
  );
}
