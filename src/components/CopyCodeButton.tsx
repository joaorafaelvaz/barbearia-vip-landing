"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { site } from "@/content/site";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível: o código está visível na tela */ }
  }
  return (
    <Button type="button" variant="secondary" onClick={copy} aria-live="polite">
      {copied ? site.voucher.copied : site.voucher.copy}
    </Button>
  );
}
