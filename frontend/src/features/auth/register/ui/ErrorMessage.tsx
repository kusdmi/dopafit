/** Inline error line shared by every wizard step. */
export function ErrorMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="text-body-s text-danger">
      {message}
    </p>
  );
}
