export function AreaPlaceholder(props: { icon: string; label: string; description: string }) {
  return (
    <div class="p-6 lg:p-8">
      <section class="flex min-h-[60vh] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
        <span class="text-3xl">{props.icon}</span>
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{props.label}</h1>
        <p class="max-w-sm text-sm text-slate-500 dark:text-slate-400">{props.description}</p>
      </section>
    </div>
  );
}
