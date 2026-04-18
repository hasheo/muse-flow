import { notFound } from "next/navigation";

import { SurvivalPlayView } from "@/components/quiz/survival-play-view";
import { listCatalogCategories, slugifyCategory } from "@/lib/survival-catalog";

export default async function CategoryPlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Resolve the slug back to its canonical admin-authored category name so
  // the UI shows "J-Pop" not "j-pop". 404 if nothing matches — keeps the URL
  // space clean and prevents accidental empty-pool runs.
  const categories = await listCatalogCategories();
  const match = categories.find((c) => slugifyCategory(c.category) === slug);
  if (!match) {
    notFound();
  }

  return (
    <SurvivalPlayView
      backHref="/quiz/category"
      backLabel="All categories"
      categoryName={match.category}
      categorySlug={slug}
    />
  );
}
