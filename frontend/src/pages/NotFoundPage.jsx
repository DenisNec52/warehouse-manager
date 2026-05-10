import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="text-center">
        <p className="text-[120px] font-black leading-none bg-gradient-to-br from-[var(--brand-500)] to-purple-500 bg-clip-text text-transparent">404</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-4">Pagina non trovata</h1>
        <p className="text-gray-500 mt-2 mb-8">La pagina che cerchi non esiste o è stata spostata.</p>
        <button className="btn btn-lg btn-primary" onClick={() => nav("/")}>← Torna alla dashboard</button>
        <div className="mt-8 max-w-sm mx-auto bg-gray-900 rounded-[var(--radius)] p-4 text-left font-mono text-xs">
          <div className="flex gap-1.5 mb-3"><div className="w-2.5 h-2.5 rounded-full bg-red-500"/><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/><div className="w-2.5 h-2.5 rounded-full bg-green-500"/></div>
          <p className="text-gray-400">$ find / -name "page"</p>
          <p className="text-red-400 mt-1">find: page: No such file or directory</p>
          <p className="text-gray-400 mt-1">$ <span className="animate-pulse">_</span></p>
        </div>
      </motion.div>
    </div>
  );
}
