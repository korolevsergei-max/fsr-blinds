import { Suspense } from "react";
import { loadFullDataset } from "@/lib/server-data";
import { WindowForm } from "./window-form";

export default async function NewWindowPage() {
  const data = await loadFullDataset();
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-muted text-sm">Loading form…</div>
      }
    >
      <WindowForm data={data} />
    </Suspense>
  );
}
