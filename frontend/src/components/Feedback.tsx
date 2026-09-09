export function EmptyState({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 text-center">
      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-md border border-[#f3c6b9] bg-[#fbeae5] p-3 text-sm text-[#8e1f0b]">
      {message}
    </div>
  );
}
