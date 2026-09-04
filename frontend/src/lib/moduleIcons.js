import {
  Home, LayoutDashboard, Users, Calendar, CalendarDays, ListChecks, Gift, Trophy,
  Newspaper, BookOpen, GraduationCap, MapPin, Boxes, Wallet, Receipt, FileText,
  BarChart3, Settings, PawPrint, HeartHandshake, Bell, Star, ClipboardList, Sparkles,
} from "lucide-react";

export const ICON_LIBRARY = {
  Home, LayoutDashboard, Users, Calendar, CalendarDays, ListChecks, Gift, Trophy,
  Newspaper, BookOpen, GraduationCap, MapPin, Boxes, Wallet, Receipt, FileText,
  BarChart3, Settings, PawPrint, HeartHandshake, Bell, Star, ClipboardList, Sparkles,
};
export const ICON_NAMES = Object.keys(ICON_LIBRARY);

/** Modules paramétrables (clé = chemin de navigation). */
export const ICONABLE_MODULES = [
  ["/dashboard", "Tableau de bord"], ["/members", "Membres"], ["/directory", "Annuaire"],
  ["/dogs", "Chiens"], ["/activities", "Activités"], ["/events", "Événements"],
  ["/tasks", "Tâches"], ["/projects", "Projets"], ["/terrains", "Terrains"],
  ["/loyalty", "Fidélité"], ["/advantages", "Avantages"], ["/library", "Bibliothèque"],
  ["/formations", "Formations"], ["/blog", "Blog"], ["/paiements", "Paiements"],
  ["/finance", "Finances"], ["/statistics", "Statistiques"], ["/admin/settings", "Paramètres"],
];
