"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = "max-w-[740px]" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className={`panel relative my-auto w-full ${width} overflow-hidden bg-[#0b0d10]/95`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[15px] font-medium tracking-[-0.01em] text-ivory">{title}</h2>
            {subtitle ? <p className="mt-1 text-[11px] leading-relaxed text-fog/85">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="icon-btn !h-7 !w-7" aria-label="Close dialog">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="scroll-thin max-h-[min(72vh,760px)] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
