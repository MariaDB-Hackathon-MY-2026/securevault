import { useEffect } from "react";
import { toast } from "sonner";

interface ActionState {
  error?: string;
}

interface UseActionToastOptions {
  loadingMessage: string;
  successMessage: string;
  id?: string;
}

export function useActionToast(
  isPending: boolean,
  state: ActionState | undefined,
  options: UseActionToastOptions
) {
  const toastId = options.id || "action-toast";

  useEffect(() => {
    return () => {
      toast.dismiss(toastId);
    };
  }, [toastId]);

  useEffect(() => {
    if (isPending) {
      toast.loading(options.loadingMessage, { id: toastId });
    } else if (state?.error) {
      toast.error(state.error, { id: toastId });
    } else if (state !== undefined && !state.error) {
      toast.success(options.successMessage, { id: toastId });
    } else {
      toast.dismiss(toastId);
    }
  }, [isPending, state, options.loadingMessage, options.successMessage, toastId]);
}
