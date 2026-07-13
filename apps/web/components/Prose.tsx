export function Prose({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-[70ch] px-5 py-14">
      <h1 className="display text-3xl text-ink">{title}</h1>
      <p className="mt-2 text-sm text-inkfaint">Last updated: {updated}</p>
      <div className="mt-8 space-y-5 leading-7 text-inkdim [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-ink [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
