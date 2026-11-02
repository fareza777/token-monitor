export default function Loading() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1640px]">
        <div className="hidden w-[84px] shrink-0 border-r border-line/70 p-5 md:block">
          <div className="skeleton h-9 w-9 rounded-[11px]" />
          <div className="mt-10 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton mx-auto h-11 w-11 rounded-xl" />
            ))}
          </div>
        </div>
        <main className="flex-1 px-5 py-7 md:px-9">
          <div className="flex items-center justify-between">
            <div>
              <div className="skeleton h-2.5 w-32 rounded" />
              <div className="skeleton mt-4 h-8 w-72 rounded-lg" />
              <div className="skeleton mt-3 h-3 w-96 max-w-full rounded" />
            </div>
            <div className="skeleton h-9 w-56 rounded-lg" />
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="panel h-[172px] p-5">
                <div className="skeleton h-2.5 w-24 rounded" />
                <div className="skeleton mt-5 h-8 w-32 rounded" />
                <div className="skeleton mt-7 h-9 w-full rounded" />
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
            <div className="panel h-[430px] p-6">
              <div className="skeleton h-3 w-40 rounded" />
              <div className="skeleton mt-6 h-[300px] w-full rounded-xl" />
            </div>
            <div className="panel h-[430px] p-6">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton mx-auto mt-10 h-40 w-40 rounded-full" />
              <div className="mt-8 space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-8 w-full rounded" />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
