export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-bold tracking-tight">
            Rodin Driver Debrief
          </h1>
          <p className="mt-3 text-slate-600">
            Digital driver debrief platform for engineers and drivers
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <h2 className="text-2xl font-semibold">
                Creator Dashboard
              </h2>
              <p className="mt-2 text-slate-500">
                Create sessions, upload track maps, generate QR links and export reports
              </p>
              <button className="mt-6 rounded-xl bg-black px-4 py-2 text-white">
                Open Creator
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <h2 className="text-2xl font-semibold">
                Driver Debrief
              </h2>
              <p className="mt-2 text-slate-500">
                Corner balance, reliability issues and session comments
              </p>
              <button className="mt-6 rounded-xl bg-black px-4 py-2 text-white">
                Open Debrief
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}