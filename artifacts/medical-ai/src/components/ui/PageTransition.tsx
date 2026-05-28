import { motion } from "framer-motion";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as unknown as string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const variants: any = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.2,  ease: EASE } },
};

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}
