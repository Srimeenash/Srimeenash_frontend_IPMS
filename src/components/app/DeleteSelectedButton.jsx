import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export function DeleteSelectedButton({ selectedCount = 0, onDelete, disabled }) {
  const hasSelection = selectedCount > 0;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={disabled || !hasSelection}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "#E85D75" }}
        >
          <Trash2 className="size-4" />
          {hasSelection ? `Delete Selected (${selectedCount})` : "Delete Selected"}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete selected items</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {selectedCount} selected item{selectedCount === 1 ? "" : "s"}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            style={{ backgroundColor: "#E85D75", color: "white" }}
          >
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
