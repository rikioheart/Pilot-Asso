import { Dog } from "lucide-react";

const ageFrom = (birth) => {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const months = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4));
  if (months < 12) return `${Math.max(months, 1)} mois`;
  return `${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`;
};

const SIZES = { sm: "h-6 w-6", md: "h-9 w-9", lg: "h-12 w-12" };

/** Prompt 10 — Avatar rond du chien + pop-up d'infos au survol, réutilisable dans tous les modules. */
export const DogAvatar = ({ name, photo, breed, birthDate, referent, size = "sm",
  showName = true, testId = "dog-avatar" }) => {
  const age = ageFrom(birthDate);
  return (
    <span className="group/dog relative inline-flex items-center gap-1.5 align-middle" data-testid={testId}>
      <span className={`grid ${SIZES[size]} shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--sable)] bg-[var(--marine-a8)]`}>
        {photo
          ? <img src={photo} alt={name} className="h-full w-full object-cover" data-testid={`${testId}-photo`} />
          : <Dog className="h-1/2 w-1/2 text-[var(--bordeaux)]" data-testid={`${testId}-silhouette`} />}
      </span>
      {showName && <span className="font-semibold text-[var(--marine)]">{name}</span>}

      <span role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-56 origin-top-left scale-95 rounded-xl border bg-card p-3 opacity-0 shadow-xl transition-all duration-150 group-hover/dog:pointer-events-auto group-hover/dog:scale-100 group-hover/dog:opacity-100 group-focus-within/dog:opacity-100"
        data-testid={`${testId}-popup`}>
        <span className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--marine-a8)]">
            {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" />
              : <Dog className="h-7 w-7 text-[var(--bordeaux)]" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display font-bold text-[var(--marine)]">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{breed || "Race non renseignée"}</span>
          </span>
        </span>
        <span className="mt-2 block space-y-0.5 text-xs text-muted-foreground">
          {age && <span className="block">Âge : {age}</span>}
          {referent && <span className="block">Pro référent : {referent}</span>}
        </span>
      </span>
    </span>
  );
};

export default DogAvatar;
