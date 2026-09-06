import { useEffect, useState } from "react";
import { MoreVertical } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

let pending = null;
let notify = null;

/** Confirmation universelle (AlertDialog shadcn). Usage : `if (!(await confirmDialog("…"))) return;` */
export const confirmDialog = (message, options = {}) => new Promise((resolve) => {
  pending = { message, resolve, ...options };
  notify?.(pending);
});

export const ConfirmDialogHost = () => {
  const [state, setState] = useState(null);
  useEffect(() => { notify = setState; return () => { notify = null; }; }, []);

  const close = (value) => { state?.resolve(value); pending = null; setState(null); };

  return (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title || "Confirmer l'action"}</AlertDialogTitle>
          <AlertDialogDescription data-testid="confirm-dialog-message">{state?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-dialog-cancel" className="rounded-full">Annuler</AlertDialogCancel>
          <AlertDialogAction data-testid="confirm-dialog-confirm" onClick={() => close(true)}
            className={`rounded-full ${state?.destructive
              ? "bg-red-600 hover:bg-red-700" : "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"}`}>
            {state?.confirmLabel || "Confirmer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** Menu contextuel « ⋮ » : actions secondaires et destructives hors du premier niveau de lecture. */
export const RowMenu = ({ items, testId = "row-menu", label = "Plus d'actions" }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={label} data-testid={testId}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--marine)]">
        <MoreVertical className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      {items.filter(Boolean).map((it) => (
        <DropdownMenuItem key={it.label} onSelect={it.onSelect} data-testid={it.testId}
          className={it.danger ? "text-red-600 focus:text-red-600" : ""}>
          {it.icon && <it.icon className="mr-2 h-3.5 w-3.5" />} {it.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
