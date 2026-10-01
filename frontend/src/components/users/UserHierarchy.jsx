// FASE 1 (bozza Ollama gemma4:26b) — organigramma a caselle. Da rifinire in fase 2/3:
// collegare ogni gruppo di operai al proprio supervisore e aggiungere le linee.
import { Crown } from "lucide-react";

const UserCard = ({ user, extraClass = "" }) => (
  <div className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-center min-w-[9rem] ${extraClass}`}>
    <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
    <p className="text-xs text-gray-400">{user.role}</p>
  </div>
);

const getShiftLabel = (shift) => {
  if (shift === "turno1") return "Turno 1";
  if (shift === "turno2") return "Turno 2";
  if (shift === "centrale") return "Turno centrale";
  return "Non assegnato";
};

const groupWorkersByShift = (workers) => {
  const groups = {};
  workers.forEach((w) => {
    const label = getShiftLabel(w.shift);
    (groups[label] ||= []).push(w);
  });
  return groups;
};

export default function UserHierarchy({ users = [] }) {
  const superAdmin = users.find((u) => u.isSuperAdmin);
  const admins = users.filter((u) => u.role === "admin" && !u.isSuperAdmin);
  const supervisors = users.filter((u) => u.role === "supervisore");
  const unsupervisedWorkers = users.filter((u) => u.role === "operatore" && !u.supervisor);

  return (
    <div className="overflow-x-auto p-6">
      <div className="flex flex-col items-center w-full">

        {superAdmin && (
          <div className="mb-10">
            <div className="rounded-lg border-2 border-amber-500 bg-white dark:bg-gray-800 p-3 text-center min-w-[9rem]">
              <div className="flex justify-center mb-1"><Crown size={14} className="text-amber-500" /></div>
              <p className="font-semibold text-gray-900 dark:text-white">{superAdmin.name}</p>
              <p className="text-xs text-gray-400">{superAdmin.role}</p>
            </div>
          </div>
        )}

        {admins.length > 0 && (
          <div className="mb-10 w-full">
            <p className="text-xs uppercase text-gray-400 font-bold mb-3 text-center">Admin</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {admins.map((u) => <UserCard key={u._id} user={u} />)}
            </div>
          </div>
        )}

        {supervisors.length > 0 && (
          <div className="mb-10 w-full">
            <p className="text-xs uppercase text-gray-400 font-bold mb-3 text-center">Supervisori</p>
            {supervisors.map((sup) => {
              const workers = users.filter((u) => u.role === "operatore" && String(u.supervisor) === String(sup._id));
              const groups = groupWorkersByShift(workers);
              return (
                <div key={sup._id} className="w-full flex flex-col items-center mb-8">
                  <UserCard user={sup} />
                  {workers.length > 0 && (
                    <div className="w-full mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                      {Object.entries(groups).map(([label, group]) => (
                        <div key={label} className="w-full mb-4">
                          <p className="text-[10px] uppercase text-gray-500 font-bold text-center mb-2">{label}</p>
                          <div className="flex flex-wrap gap-3 justify-center">
                            {group.map((w) => <UserCard key={w._id} user={w} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unsupervisedWorkers.length > 0 && (
          <div className="mb-10 w-full">
            <p className="text-xs uppercase text-gray-400 font-bold mb-3 text-center">Operai senza supervisore</p>
            {Object.entries(groupWorkersByShift(unsupervisedWorkers)).map(([label, group]) => (
              <div key={label} className="mb-4">
                <p className="text-[10px] uppercase text-gray-500 font-bold text-center mb-2">{label}</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {group.map((w) => <UserCard key={w._id} user={w} />)}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
