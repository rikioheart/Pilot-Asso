import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Users, HandHeart, Check, X, Star, Video, FileText } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";
import { MapEmbed } from "@/components/MapEmbed";
import { WeatherWidget } from "@/components/WeatherWidget";
import { CommentSection } from "@/components/CommentSection";
import { ParticipationControl } from "@/components/ParticipationControl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_TYPE_LABELS, VISIBILITY_LABELS, ROLE_LABELS, ATTENDANCE_LABELS, label }
  from "@/lib/labels";

const ATTENDANCE = ["UNKNOWN", "PRESENT", "ABSENT", "EXCUSED"];

export default function EventDetail() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [newParticipant, setNewParticipant] = useState({ user_id: "", role: "PARTICIPANT" });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/events/${eventId}`);
      setData(data);
    } catch (e) {
      toast.error(apiError(e));
      setData(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/members", { params: { status: "ACTIVE", limit: 100 } })
      .then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, []);

  if (data === null) return <p className="text-muted-foreground">Chargement de l'événement…</p>;
  if (data === false) return <EmptyState testId="event-not-found" title="Événement indisponible"
    description="Cet événement n'existe pas ou ne vous est pas visible." />;

  const { event, activities, participations, tasks, is_organizer } = data;
  const mine = participations.find((p) => p.user_id === user.user_id && !p.activity_id);

  const act = async (fn, message) => {
    try {
      await fn();
      toast.success(message);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="event-detail-page">
      <Link to="/events" data-testid="event-back-link"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--bordeaux)]">
        <ArrowLeft className="h-4 w-4" /> Retour aux événements
      </Link>
      <PageHeader breadcrumb={`Événements · ${label(EVENT_TYPE_LABELS, event.event_type)}`} title={event.title}
        subtitle={event.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} testId="event-detail-status" />
            {mine ? (
              <Button variant="outline" size="sm" className="rounded-full" data-testid="event-detail-unregister"
                onClick={() => act(() => api.delete(`/events/${eventId}/register`), "Inscription annulée")}>
                <X className="mr-1 h-3.5 w-3.5" /> Me désinscrire ({label(ROLE_LABELS, mine.role)})
              </Button>
            ) : (
              <>
                <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                  data-testid="event-detail-register"
                  onClick={() => act(() => api.post(`/events/${eventId}/register`, { role: "PARTICIPANT" }),
                    "Inscription confirmée")}>
                  <Check className="mr-1 h-3.5 w-3.5" /> M'inscrire
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" data-testid="event-detail-volunteer"
                  onClick={() => act(() => api.post(`/events/${eventId}/register`, { role: "VOLUNTEER" }),
                    "Proposition de bénévolat enregistrée")}>
                  <HandHeart className="mr-1 h-3.5 w-3.5" /> Être bénévole
                </Button>
              </>
            )}
          </div>
        } />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="event-rsvp-card">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Ma participation</h2>
            <div className="mt-3"><ParticipationControl elementType="event" elementId={eventId} testId="event-rsvp" /></div>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="event-activities">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Activités du programme</h2>
            <div className="mt-4 space-y-2">
              {activities.length === 0 && (
                <EmptyState testId="event-activities-empty" title="Aucune activité rattachée"
                  description="Créez des activités et rattachez-les à cet événement." />
              )}
              {activities.map((a) => (
                <div key={a.activity_id} className="rounded-lg border px-4 py-3" data-testid={`event-activity-${a.activity_id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--marine)]">{a.title}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.category.replaceAll("_", " ")}
                    {a.date && ` · ${new Date(a.date).toLocaleDateString("fr-FR")}`}
                    {a.start_time && ` · ${a.start_time}`}
                    {a.eligible_for_loyalty && ` · +${a.loyalty_points || 1} tampon d'engagement`}
                  </p>
                </div>
              ))}
            </div>
            <Link to="/activities" data-testid="event-activities-link"
              className="mt-4 inline-block text-sm font-semibold text-[var(--bordeaux)] hover:underline">
              Gérer les activités
            </Link>
          </div>

          {is_organizer && (
            <div className="rounded-xl border bg-card p-5" data-testid="event-participants">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">
                Participants et bénévoles ({participations.length})
              </h2>
              <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="event-add-participant">
                <div className="w-full sm:w-56">
                  <Select value={newParticipant.user_id}
                    onValueChange={(v) => setNewParticipant({ ...newParticipant, user_id: v })}>
                    <SelectTrigger data-testid="event-participant-member">
                      <SelectValue placeholder="Ajouter un membre" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profile?.display_name || m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Select value={newParticipant.role}
                    onValueChange={(v) => setNewParticipant({ ...newParticipant, role: v })}>
                    <SelectTrigger data-testid="event-participant-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                  data-testid="event-participant-add"
                  onClick={() => {
                    if (!newParticipant.user_id) return toast.error("Choisissez un membre");
                    act(() => api.post(`/events/${eventId}/participants`, newParticipant),
                      "Participant ajouté depuis la fiche");
                    setNewParticipant({ user_id: "", role: "PARTICIPANT" });
                  }}>
                  Ajouter
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto">                <table className="w-full text-sm" data-testid="event-participants-table">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Membre</th>
                      <th className="px-3 py-2">Rôle</th>
                      <th className="px-3 py-2 hidden sm:table-cell">Inscrit le</th>
                      <th className="px-3 py-2">Présence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participations.map((p) => (
                      <tr key={p.participation_id} className="border-t" data-testid={`participant-row-${p.user_id}`}>
                        <td className="px-3 py-2 font-semibold text-[var(--marine)]">{p.display_name || p.user_id}</td>
                        <td className="px-3 py-2 text-xs">{label(ROLE_LABELS, p.role)}</td>
                        <td className="px-3 py-2 hidden sm:table-cell text-xs text-muted-foreground">
                          {new Date(p.registered_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-3 py-2">
                          {p.activity_id ? (
                            <span className="text-xs text-muted-foreground">activité</span>
                          ) : (
                            <Select value={p.attendance_status}
                              onValueChange={(v) => act(() => api.post(`/events/${eventId}/attendance`,
                                { user_id: p.user_id, attendance_status: v }), "Présence enregistrée")}>
                              <SelectTrigger className="h-8 w-32" data-testid={`attendance-select-${p.user_id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ATTENDANCE.map((a) => (
                                  <SelectItem key={a} value={a} data-testid={`attendance-${p.user_id}-${a}`}>
                                    {label(ATTENDANCE_LABELS, a)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <div className="rounded-xl border bg-card p-5" data-testid="event-tasks">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Tâches du projet lié</h2>
              <div className="mt-4 space-y-2">
                {tasks.map((t) => (
                  <Link key={t.task_id} to={`/projects/${event.project_id}`} data-testid={`event-task-${t.task_id}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted/50">
                    <span>{t.title}</span>
                    <StatusBadge status={t.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <CommentSection elementType="event" elementId={eventId} testId="event-comments" />
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="event-info">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Informations</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt>
                <dd>{new Date(event.start_date).toLocaleDateString("fr-FR")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lieu</dt>
                <dd className="text-right">{event.location || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Organisateur</dt>
                <dd>{event.organizer_name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Capacité</dt>
                <dd>{event.capacity ?? "illimitée"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Visibilité</dt>
                <dd>{label(VISIBILITY_LABELS, event.visibility)}</dd></div>
            </dl>
            <div className="mt-4 space-y-2 text-sm">
              {event.google_maps_url && (
                <a href={event.google_maps_url} target="_blank" rel="noreferrer" data-testid="event-maps-link"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--marine)] hover:underline">
                  <MapPin className="h-3.5 w-3.5" /> Itinéraire Google Maps
                </a>
              )}
              {event.is_remote && event.visio_url && (
                <a href={event.visio_url} target="_blank" rel="noreferrer" data-testid="event-visio-link"
                  className="block font-semibold text-[var(--marine)] hover:underline">
                  Rejoindre en visioconférence
                </a>
              )}
              {event.eligible_for_loyalty && (
                <p className="inline-flex items-center gap-1 font-semibold text-[var(--bordeaux)]"
                  data-testid="event-loyalty-eligible">
                  <Star className="h-3.5 w-3.5" /> Éligible à la carte d'engagement
                  (+{event.loyalty_points || 1} tampon)
                </p>
              )}
              {event.form_id && (
                <Link to="/forms" data-testid="event-form-link"
                  className="block font-semibold text-[var(--bordeaux)] hover:underline">
                  Formulaire associé à compléter
                  {event.form_notify_date &&
                    ` · rappel le ${new Date(event.form_notify_date).toLocaleDateString("fr-FR")}`}
                </Link>
              )}
              {event.google_meet_url && (
                <a href={event.google_meet_url} target="_blank" rel="noreferrer" data-testid="event-meet-link"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--marine)] hover:underline">
                  <Video className="h-3.5 w-3.5" /> Rejoindre via Google Meet
                </a>
              )}
              {event.google_forms_url && (
                <a href={event.google_forms_url} target="_blank" rel="noreferrer" data-testid="event-gforms-link"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--bordeaux)] hover:underline">
                  <FileText className="h-3.5 w-3.5" /> Ouvrir le formulaire Google
                </a>
              )}
            </div>
            {(event.address || event.location) && (
              <div className="mt-4 space-y-3" data-testid="event-logistics">
                <MapEmbed address={event.address || event.location} testId="event-map" />
                <WeatherWidget location={event.address || event.location} testId="event-weather" />
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/60 p-3" data-testid="event-participants-count">
                <p className="font-display text-2xl font-extrabold text-[var(--bordeaux)]">{data.participants_count}</p>
                <p className="text-xs text-muted-foreground">participants</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-3" data-testid="event-volunteers-count">
                <p className="font-display text-2xl font-extrabold text-[var(--bordeaux)]">{data.volunteers_count}</p>
                <p className="text-xs text-muted-foreground">bénévoles</p>
              </div>
            </div>
          </div>

          {activities.some((a) => a.eligible_for_loyalty) && (
            <div className="rounded-xl border bg-[var(--bordeaux-a5)] p-5" data-testid="event-loyalty-hint">
              <p className="inline-flex items-center gap-2 font-display text-sm font-bold text-[var(--bordeaux)]">
                <Star className="h-4 w-4" /> Activités qui donnent des points
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Présentez votre QR personnel au professionnel présent : il validera votre participation.
              </p>
              <Link to="/loyalty" data-testid="event-loyalty-link"
                className="mt-3 inline-block text-sm font-semibold text-[var(--bordeaux)] hover:underline">Voir ma carte</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
