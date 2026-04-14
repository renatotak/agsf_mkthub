"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyableCode({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API requires HTTPS in some browsers; ignore silently
    }
  };
  return (
    <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2 font-mono text-[12px] text-neutral-700">
      <code className="flex-1 truncate">{text}</code>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-brand-primary transition-colors shrink-0"
        title={label || "Copy"}
      >
        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
        {copied ? "Copied" : label || "Copy"}
      </button>
    </div>
  );
}
