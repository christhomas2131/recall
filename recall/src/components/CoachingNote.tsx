export function CoachingNote({ note }: { note: string }) {
  if (!note.trim()) return null;
  return (
    <aside className="panel mt-8 px-5 py-4">
      <div className="eyebrow opacity-70">Coaching note</div>
      <p className="mt-2 font-serif text-[16px] leading-relaxed">{note}</p>
    </aside>
  );
}
