"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Modal } from "./ui/Modal";

const CLAUDE_PLANS: { id: Settings["claudePlan"]; label: string }[] = [
  { id: "pro", label: "Pro" },
  { id: "max5", label: "Max 5×" },
  { id: "max20", label: "Max 20×" },
  { id: "custom", label: "Custom" },
];

const CODEX_PLANS: { id: Settings["codexPlan"]; label: string }[] = [
  { id: "plus", label: "Plus" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

export function SettingsDialog({
  open,
  onClose,
  settings,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(settings);
      setError(null);
    }
  }, [open, settings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || data.ok === false) {
        setError(data.error ?? "Could not save settings.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("The request failed. Check the dev server logs.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workspace settings"
      subtitle="Budgets and plan labels. Quota percentages always come from the provider."
      width="max-w-[560px]"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[9.5px] text-faint">
            <Icon name="database" size={11} />
            Saved locally in .data/settings.json
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost !py-1.5 text-[10.5px]" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary !py-1.5 text-[10.5px]" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </>
      }
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-ember/20 bg-ember/[0.06] px-3 py-2 text-[10.5px] text-ember/90">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <span className="label text-[8px]">Monthly budget</span>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-faint">$</span>
            <input
              type="number"
              min={1}
              step={50}
              className="input num !pl-7"
              value={form.monthlyBudgetUsd}
              onChange={(event) =>
                setForm((current) => ({ ...current, monthlyBudgetUsd: Number(event.target.value) }))
              }
            />
          </div>
          <p className="mt-1.5 text-[9.5px] text-faint">Used for burn pacing and the month-end projection.</p>
        </div>

        <div className="h-px bg-white/[0.06]" />

        <div>
          <span className="label text-[8px]">Claude plan label</span>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {CLAUDE_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, claudePlan: plan.id }))}
                className={`rounded-lg border px-2 py-2 text-[10.5px] transition ${
                  form.claudePlan === plan.id
                    ? "border-signal/30 bg-signal/[0.07] text-signal"
                    : "border-white/[0.08] bg-white/[0.02] text-fog hover:text-ivory"
                }`}
              >
                {plan.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label text-[8px]">Codex plan label</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {CODEX_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, codexPlan: plan.id }))}
                className={`rounded-lg border px-2 py-2 text-[10.5px] transition ${
                  form.codexPlan === plan.id
                    ? "border-signal/30 bg-signal/[0.07] text-signal"
                    : "border-white/[0.08] bg-white/[0.02] text-fog hover:text-ivory"
                }`}
              >
                {plan.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label text-[8px]">Weekly token reference</span>
          <input
            type="number"
            min={1000}
            step={1000}
            className="input num mt-1.5"
            value={form.claudeWeeklyTokens}
            onChange={(event) =>
              setForm((current) => ({ ...current, claudeWeeklyTokens: Number(event.target.value) }))
            }
          />
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-faint">
            A reference ceiling for local estimates. Real weekly percentages come from Claude Code&apos;s statusline or the
            OAuth usage endpoint, never from this number.
          </p>
        </div>
      </div>
    </Modal>
  );
}
