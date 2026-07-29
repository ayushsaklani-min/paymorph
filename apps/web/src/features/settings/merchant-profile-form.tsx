'use client';

import { useState } from 'react';

export function MerchantProfileForm({
  displayName,
  logoUrl,
  defaultAsset,
}: {
  displayName: string;
  logoUrl: string | null;
  defaultAsset: 'FXRP' | 'USDT0';
}) {
  const [status, setStatus] = useState<string>();

  async function save(formData: FormData) {
    setStatus('Saving…');
    const response = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: formData.get('displayName'),
        logoUrl: formData.get('logoUrl') || null,
        defaultAsset: formData.get('defaultAsset'),
      }),
    });
    const envelope = (await response.json()) as { error?: { message: string } };
    setStatus(response.ok ? 'Saved.' : (envelope.error?.message ?? 'Could not save.'));
  }

  return (
    <form
      action={(data) => void save(data)}
      className="mt-10 max-w-2xl space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
    >
      <label className="block text-sm text-[var(--muted)]">
        Display name
        <input
          className={inputClass}
          defaultValue={displayName}
          maxLength={80}
          name="displayName"
          required
        />
      </label>
      <label className="block text-sm text-[var(--muted)]">
        Logo URL
        <input className={inputClass} defaultValue={logoUrl ?? ''} name="logoUrl" type="url" />
      </label>
      <label className="block text-sm text-[var(--muted)]">
        Default settlement
        <select className={inputClass} defaultValue={defaultAsset} name="defaultAsset">
          <option value="FXRP">FXRP</option>
          <option value="USDT0">USDT0 when available</option>
        </select>
      </label>
      <div className="flex items-center gap-4">
        <button
          className="min-h-11 rounded-full bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)]"
          type="submit"
        >
          Save profile
        </button>
        {status ? (
          <p aria-live="polite" className="text-sm text-[var(--muted)]">
            {status}
          </p>
        ) : null}
      </div>
    </form>
  );
}

const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[#0a1119] px-3 py-2 text-[var(--ink)]';
