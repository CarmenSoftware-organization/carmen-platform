import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        className: 'text-sm',
        duration: 4000,
      }}
      richColors
      closeButton
    />
  );
}
