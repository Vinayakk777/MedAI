import { motion } from "framer-motion";

function Shimmer({ className }: { className: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className={`bg-white/6 rounded-lg ${className}`}
    />
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((n) => (
        <div key={n} className={`flex items-end gap-3 ${n === 2 ? "flex-row-reverse" : ""}`}>
          <div className="w-8 h-8 rounded-full bg-white/8 flex-shrink-0" />
          <div className={`space-y-2 ${n === 2 ? "items-end" : "items-start"} flex flex-col max-w-[60%]`}>
            <Shimmer className="h-4 w-48" />
            <Shimmer className="h-4 w-72" />
            <Shimmer className="h-4 w-56" />
            <Shimmer className="h-3 w-16 mt-1 opacity-50" />
          </div>
        </div>
      ))}
    </div>
  );
}
