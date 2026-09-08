import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { WelcomeBanner } from "@/components/Ui";
import { BaseHomeBlocks } from "@/components/BaseHomeBlocks";
import { DashboardShortcuts } from "@/components/DashboardShortcuts";
import { ExternalTools } from "@/components/ExternalTools";
import { Button } from "@/components/ui/button";

export default function MemberDashboard() {
  const [profile, setProfile] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard/member").then((r) => setProfile(r.data.profile)).catch(() => {});
    api.get("/me/engagement").then((r) => setEngagement(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="member-dashboard">
      <WelcomeBanner testId="member-welcome" greeting="Espace adhérent"
        name={`Bonjour ${profile?.first_name || ""}`}
        message="L'essentiel : la progression de votre chien, les actualités et vos prochaines sorties."
        badges={engagement?.badges}
        actions={
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="member-advantages-cta"
            onClick={() => navigate("/advantages")}>Voir mes avantages</Button>
        } />

      <div className="mb-6"><DashboardShortcuts /></div>
      <BaseHomeBlocks />
      <ExternalTools />
    </div>
  );
}
