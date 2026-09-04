import { Link } from "react-router-dom";
import { LayoutDashboard, Users, Briefcase, Sparkle, PartyPopper, Link2 } from "lucide-react";
import { KpiCard, SectionCard, EmptyState, Chip } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";

const MODES = [["global", "Global", LayoutDashboard], ["members", "Membres", Users],
  ["pros", "Professionnels", Briefcase], ["activities", "Activités", Sparkle]];

export const CockpitModes = ({ value, onChange }) => (
  <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Mode du cockpit" data-testid="cockpit-modes">
    {MODES.map(([k, label, Icon]) => (
      <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
        data-testid={`cockpit-mode-${k}`}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          value === k ? "border-transparent bg-[var(--bordeaux)] text-white" : "bg-card text-[var(--marine)] hover:bg-muted"}`}>
        <Icon className="h-4 w-4" /> {label}
      </button>
    ))}
  </div>
);

const short = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");

const Row = ({ to, title, meta, right, testId }) => (
  <Link to={to} data-testid={testId}
    className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
    <div className="min-w-0"><p className="truncate font-semibold text-[var(--marine)]">{title}</p>
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}</div>
    {right}
  </Link>
);

export const MembersMode = ({ data }) => {
  const k = data.kpis;
  return (
    <div data-testid="cockpit-members">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard testId="cm-kpi-members" label="Membres" value={k.members} icon={Users} />
        <KpiCard testId="cm-kpi-individuals" label="Particuliers actifs" value={k.individuals} icon={Users} />
        <KpiCard testId="cm-kpi-pending" label="Adhésions en attente" value={k.pending_members} tone="bordeaux" />
        <KpiCard testId="cm-kpi-suspended" label="Suspendus" value={k.suspended} tone="bordeaux" />
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Demandes d'adhésion" testId="cm-pending"
          actions={<Link to="/admin/members?status=PENDING" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline">Gérer</Link>}>
          {data.pending_list.length === 0
            ? <EmptyState testId="cm-pending-empty" module="dashboard" title="Aucune demande en attente" description="Les nouvelles inscriptions apparaîtront ici." />
            : <div className="space-y-2">{data.pending_list.map((u) => (
              <Row key={u.user_id} to={`/admin/members?focus=${u.user_id}`} title={u.email} meta={u.role}
                testId={`cm-pending-${u.user_id}`} right={<Chip tone="amber">En attente</Chip>} />))}</div>}
        </SectionCard>
        <SectionCard title="Derniers membres validés" testId="cm-recent">
          <div className="space-y-2">{(data.recent_members || []).map((u) => (
            <Row key={u.user_id} to={`/admin/members?focus=${u.user_id}`} title={u.email}
              meta={`${u.role} · ${u.access_level}`} testId={`cm-recent-${u.user_id}`} right={<Chip tone="green">Actif</Chip>} />))}</div>
        </SectionCard>
      </section>
    </div>
  );
};

export const ProsMode = ({ data }) => {
  const pros = data.pros_list || [];
  return (
    <div data-testid="cockpit-pros">
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard testId="cp-kpi-pros" label="Professionnels actifs" value={pros.length} icon={Briefcase} />
        <KpiCard testId="cp-kpi-partners" label="Partenariats actifs" value={pros.filter((p) => p.partnership_status && p.partnership_status !== "NONE").length} />
        <KpiCard testId="cp-kpi-connected" label="Connexions externes" value={pros.filter((p) => p.google_calendar || p.rintintin).length} icon={Link2} />
        <KpiCard testId="cp-kpi-reviews" label="Retours qualitatifs" value={(data.recent_reviews || []).length} tone="bordeaux" />
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <SectionCard title="Suivi des professionnels" testId="cp-list"
          actions={<Link to="/directory" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline">Annuaire</Link>}>
          <div className="space-y-2">{pros.map((p) => (
            <Row key={p.user_id} to={`/directory?focus=${p.user_id}`} testId={`cp-pro-${p.user_id}`}
              title={p.company_name || p.display_name || p.email}
              meta={`${p.access_level} · ${p.activities} activité(s) · ${p.category || "catégorie non renseignée"}`}
              right={<div className="flex gap-1">
                {p.partnership_status !== "NONE" && <Chip tone="green">Partenaire</Chip>}
                {(p.google_calendar || p.rintintin) && <Chip tone="marine"><Link2 className="h-3 w-3" /> Connecté</Chip>}
              </div>} />))}</div>
        </SectionCard>
        <SectionCard title="Derniers retours qualitatifs" testId="cp-reviews">
          {(data.recent_reviews || []).length === 0
            ? <p className="text-sm text-muted-foreground">Aucun retour enregistré. Les retours se saisissent depuis la fiche d'un professionnel.</p>
            : <div className="space-y-2">{data.recent_reviews.map((r) => (
              <div key={r.review_id} className="rounded-lg border px-3 py-2 text-sm" data-testid={`cp-review-${r.review_id}`}>
                <p className="text-xs text-muted-foreground">{r.author_name} · {short(r.created_at)}</p>
                <p className="mt-1">{r.observations}</p>
              </div>))}</div>}
        </SectionCard>
      </section>
    </div>
  );
};

export const ActivitiesMode = ({ data }) => (
  <div data-testid="cockpit-activities">
    <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiCard testId="ca-kpi-upcoming" label="Activités à venir" value={(data.upcoming_activities || []).length} icon={Sparkle} />
      <KpiCard testId="ca-kpi-events" label="Événements à venir" value={data.kpis.upcoming_events} icon={PartyPopper} />
      <KpiCard testId="ca-kpi-review" label="À valider" value={data.kpis.activities_to_review} tone="bordeaux" />
      <KpiCard testId="ca-kpi-stamps" label="Participations validées" value={data.kpis.loyalty_stamps} tone="bordeaux" />
    </section>
    <section className="mt-6 grid gap-6 lg:grid-cols-3">
      {(data.delegated_recent || []).length > 0 && (
        <SectionCard title="Publications déléguées (modération 48 h)" testId="ca-delegated" className="lg:col-span-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.delegated_recent.map((a) => (
            <Row key={a.activity_id} to={`/activities?focus=${a.activity_id}`} title={a.title}
              meta={`${short(a.date)} · modérable jusqu'au ${short(a.moderation_until)}`}
              testId={`ca-delegated-${a.activity_id}`} right={<Chip tone="marine">Déléguée</Chip>} />))}</div>
        </SectionCard>
      )}
      <SectionCard title="Propositions à valider" testId="ca-review">
        {(data.activities_review_list || []).length === 0
          ? <p className="text-sm text-muted-foreground">Aucune proposition en attente.</p>
          : <div className="space-y-2">{data.activities_review_list.map((a) => (
            <Row key={a.activity_id} to={`/activities?focus=${a.activity_id}`} title={a.title} meta={short(a.date)}
              testId={`ca-review-${a.activity_id}`} right={<Chip tone="amber">Proposée</Chip>} />))}</div>}
      </SectionCard>
      <SectionCard title="Prochaines activités" testId="ca-activities">
        {(data.upcoming_activities || []).length === 0
          ? <p className="text-sm text-muted-foreground">Aucune activité planifiée.</p>
          : <div className="space-y-2">{data.upcoming_activities.map((a) => (
            <Row key={a.activity_id} to={`/activities?focus=${a.activity_id}`} title={a.title}
              meta={`${short(a.date)}${a.start_time ? ` · ${a.start_time}` : ""}${a.location ? ` · ${a.location}` : ""}`}
              testId={`ca-activity-${a.activity_id}`} right={<StatusBadge status={a.status} />} />))}</div>}
      </SectionCard>
      <SectionCard title="Prochains événements" testId="ca-events">
        {(data.upcoming_events_list || []).length === 0
          ? <p className="text-sm text-muted-foreground">Aucun événement planifié.</p>
          : <div className="space-y-2">{data.upcoming_events_list.map((e) => (
            <Row key={e.event_id} to={`/events/${e.event_id}`} title={e.title}
              meta={`${short(e.start_date)}${e.location ? ` · ${e.location}` : ""}`}
              testId={`ca-event-${e.event_id}`} right={<StatusBadge status={e.status} />} />))}</div>}
      </SectionCard>
    </section>
  </div>
);
