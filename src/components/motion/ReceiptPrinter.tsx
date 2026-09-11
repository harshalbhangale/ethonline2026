"use client";

import {
  CheckCircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { cn } from "@/lib/cn";

/**
 * A receipt printer that feeds out whatever React is placed on its paper.
 * Adapted to this app's tokens: the machine sits on `raised`, the screen on
 * `bg`, and the paper is always paper-coloured regardless of theme.
 */

export type ReceiptPrinterStage = "processing" | "printing" | "complete";
export type ReceiptFeedMotion = "smooth" | "stepped";

type RootProps = Omit<ComponentPropsWithoutRef<"section">, "children"> & {
  animate?: boolean;
  children: ReactNode;
  feedMotion?: ReceiptFeedMotion;
  stage: ReceiptPrinterStage;
};

type StatusProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children?: ReactNode;
  labels?: Partial<Record<ReceiptPrinterStage, ReactNode>>;
};

type ContextValue = {
  animate: boolean;
  feedMotion: ReceiptFeedMotion;
  shouldMove: boolean;
  stage: ReceiptPrinterStage;
};

const ReceiptPrinterContext = createContext<ContextValue | null>(null);

const easeOut = [0.23, 1, 0.32, 1] as const;
const easeInOut = [0.77, 0, 0.175, 1] as const;

const toothCount = 40;
const toothDepth = 4;
const toothPoints = Array.from({ length: toothCount * 2 }, (_, index) => {
  const x = 100 - ((index + 1) * 100) / (toothCount * 2);
  const y = index % 2 === 0 ? "100%" : `calc(100% - ${toothDepth}px)`;
  return `${x}% ${y}`;
}).join(", ");
const receiptClipPath = `polygon(0 0, 100% 0, 100% calc(100% - ${toothDepth}px), ${toothPoints})`;

// The paper advances a line, pauses, advances again — the way a thermal
// printer actually feeds, rather than one long glide.
const printingKeyframes = [
  "translateY(calc(-100% + 2px))",
  "translateY(-91%)", "translateY(-91%)",
  "translateY(-81%)", "translateY(-81%)",
  "translateY(-70%)", "translateY(-70%)",
  "translateY(-58%)", "translateY(-58%)",
  "translateY(-45%)", "translateY(-45%)",
  "translateY(-32%)", "translateY(-32%)",
  "translateY(-20%)", "translateY(-20%)",
  "translateY(-10%)", "translateY(-10%)",
  "translateY(-3%)", "translateY(-3%)",
  "translateY(0%)",
];
const printingTimes = [
  0, 0.075, 0.105, 0.18, 0.21, 0.285, 0.315, 0.39, 0.42, 0.495, 0.525, 0.6,
  0.63, 0.705, 0.735, 0.81, 0.84, 0.915, 0.945, 1,
];

const defaultLabels: Record<ReceiptPrinterStage, ReactNode> = {
  processing: "Processing",
  printing: "Printing your receipt",
  complete: "Complete",
};

function useReceiptPrinter(component: string) {
  const context = useContext(ReceiptPrinterContext);
  if (!context) throw new Error(`${component} must be used inside ReceiptPrinter.Root.`);
  return context;
}

function Root({
  "aria-label": ariaLabel = "Receipt printer",
  animate = true,
  children,
  className,
  feedMotion = "stepped",
  stage,
  ...props
}: RootProps) {
  const reduce = useReducedMotion();
  return (
    <ReceiptPrinterContext.Provider
      value={{ animate, feedMotion, shouldMove: animate && !reduce, stage }}
    >
      <section
        aria-label={ariaLabel}
        className={cn("relative isolate flex w-full max-w-sm flex-col items-center", className)}
        data-stage={stage}
        {...props}
      >
        {children}
      </section>
    </ReceiptPrinterContext.Provider>
  );
}

function Machine({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#1c1c1f] p-3 pb-8",
        "shadow-[0_20px_36px_-20px_rgba(0,0,0,0.7),0_6px_14px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-[inherit] before:bg-[url('/textures/plastic-noise.svg')] before:bg-[length:180px_180px] before:opacity-25 before:mix-blend-overlay before:content-['']",
        className,
      )}
      {...props}
    >
      {children}
      {/* The slot the paper comes out of. */}
      <div
        aria-hidden
        className="absolute inset-x-6 bottom-3 z-40 h-2 rounded-[0.25rem] border border-bg bg-bg shadow-inner shadow-black"
      />
    </div>
  );
}

function Header({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("relative z-10 flex h-11 items-start justify-between px-1", className)} {...props}>
      {children}
    </div>
  );
}

function Screen({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative z-10 isolate overflow-hidden rounded-[0.75rem] border border-bg bg-bg p-4 text-ink shadow-inner shadow-black/80",
        "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[inherit] after:shadow-[inset_0_0_24px_4px_rgba(0,0,0,0.55)] after:content-['']",
        className,
      )}
      {...props}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function StatusIndicator({ animate, move, stage }: { animate: boolean; move: boolean; stage: ReceiptPrinterStage }) {
  const complete = stage === "complete";
  const transition = { duration: animate ? 0.16 : 0, ease: easeOut };
  const enter = { opacity: animate ? 0 : 1, transform: move ? "scale(0.94)" : "scale(1)" };
  const leave = { opacity: animate ? 0 : 1, transform: move ? "scale(0.96)" : "scale(1)" };

  return (
    <span aria-hidden className="relative grid size-5 shrink-0 place-items-center">
      <AnimatePresence initial={false} mode="sync">
        {complete ? (
          <motion.span
            key="complete"
            className="col-start-1 row-start-1 grid place-items-center text-paid"
            initial={enter}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={leave}
            transition={transition}
          >
            <CheckCircleIcon size={18} weight="fill" />
          </motion.span>
        ) : (
          <motion.span
            key="working"
            className="col-start-1 row-start-1 grid place-items-center text-muted"
            initial={enter}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={leave}
            transition={transition}
          >
            <CircleNotchIcon
              className={cn(animate && "animate-spin motion-reduce:animate-none")}
              size={18}
              weight="bold"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Status({ children, className, labels, ...props }: StatusProps) {
  const { animate, shouldMove, stage } = useReceiptPrinter("ReceiptPrinter.Status");
  const label = children ?? labels?.[stage] ?? defaultLabels[stage];

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)} {...props}>
      <StatusIndicator animate={animate} move={shouldMove} stage={stage} />
      <div aria-live="polite" role="status" className="grid min-w-0 flex-1 items-center">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={stage}
            className="col-start-1 row-start-1 truncate text-[12px] font-medium leading-none text-muted"
            initial={{ opacity: animate ? 0 : 1, transform: shouldMove ? "translateY(4px)" : "translateY(0px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: animate ? 0 : 1, transform: shouldMove ? "translateY(-4px)" : "translateY(0px)" }}
            transition={{ duration: animate ? 0.18 : 0, ease: easeOut }}
          >
            {label}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Paper({ children, className, style, ...props }: ComponentPropsWithoutRef<"article">) {
  return (
    <article
      className={cn(
        "relative z-10 min-h-80 bg-[#f4f2ec] bg-[url('/textures/receipt-paper.svg')] bg-cover px-6 pt-7 pb-8 font-mono text-[12.5px] text-[#141414]",
        className,
      )}
      style={{ clipPath: receiptClipPath, ...style }}
      {...props}
    >
      {children}
    </article>
  );
}

function Output({ children, className, ...props }: ComponentPropsWithoutRef<"div">) {
  const { animate, feedMotion, shouldMove, stage } = useReceiptPrinter("ReceiptPrinter.Output");
  const visible = stage !== "processing";
  const stepped = feedMotion === "stepped" && stage === "printing" && shouldMove;

  return (
    <div
      className={cn("relative z-50 -mt-4 h-[32rem] w-[calc(80%+3rem)] max-w-full overflow-hidden px-6", className)}
      {...props}
    >
      {visible ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-6 -top-1 z-20 h-2 bg-black/75 blur-[6px]" />
      ) : null}

      <motion.div
        initial={false}
        aria-hidden={stage !== "complete"}
        className="relative isolate before:pointer-events-none before:absolute before:inset-x-3 before:top-3 before:bottom-4 before:z-0 before:rounded-sm before:shadow-[0_8px_24px_rgba(0,0,0,0.35)] before:content-['']"
        animate={{
          opacity: visible ? 1 : 0,
          transform:
            stage === "printing" && shouldMove
              ? stepped
                ? printingKeyframes
                : "translateY(0%)"
              : visible || !shouldMove
                ? "translateY(0%)"
                : "translateY(calc(-100% + 2px))",
        }}
        transition={{
          opacity: { duration: animate ? 0.16 : 0, ease: easeOut },
          transform: {
            duration: shouldMove ? 1.75 : 0,
            ease: stepped ? "linear" : easeInOut,
            times: stepped ? printingTimes : undefined,
          },
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export const ReceiptPrinter = { Root, Machine, Header, Screen, Status, Output, Paper };
