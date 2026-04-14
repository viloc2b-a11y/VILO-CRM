import { Suspense } from "react";
import { IntakeForm } from "@/components/intake/IntakeForm";

function IntakeFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Loading…
    </div>
  );
}

export default function IntakePage() {
  return (
    <Suspense fallback={<IntakeFallback />}>
      <IntakeForm />
    </Suspense>
  );
}
