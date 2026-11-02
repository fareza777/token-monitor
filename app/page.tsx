import { Dashboard } from "@/components/Dashboard";
import { getEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function Page() {
  const engine = await getEngine();
  return <Dashboard initial={engine.snapshot("1h")} />;
}
