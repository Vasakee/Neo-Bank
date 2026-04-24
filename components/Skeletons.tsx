export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      {/* Balance card */}
      <Skeleton className="h-44 rounded-2xl" />
      {/* Shield/Unshield */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      {/* Swap */}
      <Skeleton className="h-52 rounded-2xl" />
      {/* Wallet */}
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

export function SendSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="h-4 w-64 rounded-lg" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}

export function ReceiveSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <Skeleton className="h-8 w-32 rounded-xl" />
      <Skeleton className="h-4 w-56 rounded-lg" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

export function ComplianceSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <Skeleton className="h-8 w-36 rounded-xl" />
      <Skeleton className="h-4 w-72 rounded-lg" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="h-11 rounded-xl" />
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-16 rounded-lg" />)}
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    </div>
  );
}
