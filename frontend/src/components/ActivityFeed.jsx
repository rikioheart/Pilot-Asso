import { Link } from "react-router-dom";
import { Newspaper, PartyPopper, Sparkle, GraduationCap, Trophy, UserPlus, Pin } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { SectionCard, EmptyState, Chip, ProgressBar } from "@/components/Ui";

const KINDS = {
  ARTICLE: ["Article", Newspaper, "bordeaux"], EVENT: ["Événement", PartyPopper, "marine"],
  ACTIVITY: ["Activité", Sparkle, "green"], FORMATION: ["Formation", GraduationCap, "marine"],
  CONTEST: ["Jeu-concours", Trophy, "amber"], MEMBER: ["Nouveau membre", UserPlus, "muted"],
};

export const ActivityFeed = ({ feed }) => {
  if (!feed) return null;
  return (
    <div className="space-y-6">
      {feed.highlight && (
        <Link to={feed.highlight.link} data-testid="feed-highlight"
          className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
          <div className="relative h-40 bg-[#002060]/8">
            {feed.highlight.cover_file_id ? (
              <img src={fileUrl(feed.highlight.cover_file_id)} alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <div className="grid h-full place-items-center"><Newspaper className="h-10 w-10 text-[#002060]/20" /></div>
            )}
            <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#800020] px-3 py-1 text-[11px] font-bold text-white">
              <Pin className="h-3 w-3" /> À la une
            </span>
          </div>
          <div className="p-5">
            <h3 className="font-display text-base md:text-lg font-bold text-[#002060]">{feed.highlight.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feed.highlight.subtitle}</p>
          </div>
        </Link>
      )}

      <SectionCard title="Fil d'actualité de l'association" icon={Sparkle} testId="activity-feed">
        {feed.items.length === 0 ? (
          <EmptyState testId="feed-empty" title="Rien de neuf pour l'instant"
            description="Articles, événements et animations apparaîtront ici dès leur publication." />
        ) : (
          <ul className="space-y-2">
            {feed.items.map((item) => {
              const [label, Icon, tone] = KINDS[item.kind] || ["Actualité", Sparkle, "muted"];
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to={item.link} data-testid={`feed-item-${item.id}`}
                    className="flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#002060]/8">
                      <Icon className="h-4 w-4 text-[#002060]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Chip tone={tone}>{label}</Chip>
                        {item.date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.date).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#002060]">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

export const EngagementCard = ({ engagement }) => {
  if (!engagement) return null;
  const { profile_completion: completion, loyalty } = engagement;
  return (
    <SectionCard title="Ma progression" icon={Trophy} testId="engagement-card">
      <div className="space-y-5">
        <div>
          <ProgressBar value={completion.percent} tone="marine" testId="profile-completion-bar"
            label="Profil complété" />
          {completion.missing.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              À compléter : {completion.missing.join(", ")} —{" "}
              <Link to="/profile" className="font-semibold text-[#800020] hover:underline"
                data-testid="engagement-profile-link">compléter mon profil</Link>
            </p>
          )}
        </div>
        {loyalty && (
          <div>
            <ProgressBar value={loyalty.progress} testId="loyalty-progress-bar"
              label={`Fidélité — ${loyalty.total_points} point(s)`} />
            <p className="mt-2 text-xs text-muted-foreground">
              {loyalty.next_reward
                ? `Prochaine récompense à ${loyalty.next_reward.threshold} points : ${
                  loyalty.next_reward.reward || loyalty.next_reward.label}`
                : "Toutes les récompenses sont atteintes, bravo !"}
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
