import { AdminCatalogView } from "@/components/admin/admin-catalog-view";

export default function AdminCatalogPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          Survival catalog
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
          Curated track catalog
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">
          Tracks in this catalog appear in Survival mode runs. Use the YouTube search to find a
          video, then tag year, country, category, and genre so filters can use them later.
        </p>
      </div>
      <AdminCatalogView />
    </div>
  );
}
