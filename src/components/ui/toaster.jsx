import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.length > 1 && (
        <button
          type="button"
          onClick={() => dismiss()}
          className="pointer-events-auto mb-2 self-end rounded-md border border-destructive bg-background px-3 py-2 text-xs font-bold text-destructive shadow-lg"
        >
          Clear All Alerts
        </button>
      )}
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => dismiss(id)} aria-label="Dismiss alert" />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}