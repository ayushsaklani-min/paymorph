'use client';

import { useRef, useState, type FormEvent } from 'react';
import { API_KEY_SCOPE_OPTIONS, type ApiKeyListItem, type ApiKeyScope } from './api-key-types';

interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  secret: string;
  createdAt: string;
}

interface ApiEnvelope<T> {
  data: T | null;
  error: { message?: string } | null;
}

const DEFAULT_SCOPES: ApiKeyScope[] = ['invoices:read', 'invoices:write'];

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyListItem[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState('Store backend');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_SCOPES);
  const [created, setCreated] = useState<CreatedApiKey>();
  const [copyStatus, setCopyStatus] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string>();
  const [revokingId, setRevokingId] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [revokeError, setRevokeError] = useState<string>();
  const createRequest = useRef<{ body: string; key: string } | undefined>(undefined);
  const revokeKeys = useRef<Record<string, string>>({});

  function toggleScope(scope: ApiKeyScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
    createRequest.current = undefined;
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = JSON.stringify({ name: name.trim(), scopes });
    if (!name.trim() || scopes.length === 0) return;

    try {
      setPending(true);
      setCreateError(undefined);
      setCopyStatus(undefined);
      if (createRequest.current?.body !== body) {
        createRequest.current = { body, key: crypto.randomUUID() };
      }
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': createRequest.current.key,
        },
        body,
      });
      const envelope = (await response.json()) as ApiEnvelope<CreatedApiKey>;
      if (!response.ok || !envelope.data) {
        throw new Error(envelope.error?.message ?? 'API key could not be created.');
      }

      const next = envelope.data;
      setCreated(next);
      setKeys((current) => [
        {
          id: next.id,
          name: next.name,
          prefix: next.prefix,
          scopes: next.scopes,
          status: 'ACTIVE',
          createdAt: next.createdAt,
          lastUsedAt: null,
          expiresAt: null,
        },
        ...current.filter((key) => key.id !== next.id),
      ]);
      setName('Store backend');
      setScopes(DEFAULT_SCOPES);
      createRequest.current = undefined;
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'API key could not be created.');
    } finally {
      setPending(false);
    }
  }

  async function copySecret() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Copy was blocked. Select and copy the key manually.');
    }
  }

  async function revokeKey(id: string) {
    try {
      setRevokingId(id);
      setRevokeError(undefined);
      revokeKeys.current[id] ??= crypto.randomUUID();
      const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}/revoke`, {
        method: 'POST',
        headers: { 'idempotency-key': revokeKeys.current[id] },
      });
      const envelope = (await response.json()) as ApiEnvelope<{ id: string; status: 'REVOKED' }>;
      if (!response.ok || !envelope.data) {
        throw new Error(envelope.error?.message ?? 'API key could not be revoked.');
      }
      setKeys((current) =>
        current.map((key) => (key.id === id ? { ...key, status: 'REVOKED' } : key)),
      );
      setCreated((current) => (current?.id === id ? undefined : current));
      setConfirmingId(undefined);
      delete revokeKeys.current[id];
    } catch (caught) {
      setRevokeError(caught instanceof Error ? caught.message : 'API key could not be revoked.');
    } finally {
      setRevokingId(undefined);
    }
  }

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="pm-panel h-fit rounded-2xl p-6 sm:p-7" aria-labelledby="create-key-title">
        <p className="pm-kicker">Server access</p>
        <h2 className="pm-display mt-3 text-2xl" id="create-key-title">
          Create an API key
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Grant only the permissions this integration needs. Keys are for trusted server code and
          must never be placed in a browser bundle.
        </p>

        <form className="mt-6 space-y-6" onSubmit={(event) => void createKey(event)}>
          <label className="block text-sm font-medium text-[var(--muted-strong)]">
            Key name
            <input
              className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-deep)] px-4 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
                createRequest.current = undefined;
              }}
              required
              value={name}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-[var(--muted-strong)]">Permissions</legend>
            <div className="mt-3 space-y-2.5">
              {API_KEY_SCOPE_OPTIONS.map((option) => (
                <label
                  className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] bg-white/45 p-3.5 transition hover:border-[var(--line-strong)]"
                  key={option.value}
                >
                  <input
                    checked={scopes.includes(option.value)}
                    className="mt-1 size-4 accent-[var(--accent-strong)]"
                    onChange={() => toggleScope(option.value)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {createError ? (
            <p className="rounded-xl bg-red-950/8 px-4 py-3 text-sm text-red-800" role="alert">
              {createError}
            </p>
          ) : null}

          {created ? (
            <p className="text-xs leading-5 text-[var(--muted)]">
              Copy or dismiss the current one-time secret before creating another key.
            </p>
          ) : null}

          <button
            className="pm-button pm-button-primary min-h-12 w-full rounded-xl px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || !!created || !name.trim() || scopes.length === 0}
            type="submit"
          >
            {pending ? 'Creating secure key…' : 'Create API key'}
          </button>
        </form>
      </section>

      <section aria-labelledby="issued-keys-title">
        {created ? (
          <div className="mb-5 border border-[var(--accent)]/30 bg-[var(--accent)]/[0.08] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="pm-kicker">Created successfully</p>
                <h2 className="pm-display mt-2 text-2xl">Copy this key now</h2>
              </div>
              <button
                className="text-sm text-[var(--muted)] underline"
                onClick={() => {
                  setCreated(undefined);
                  setCopyStatus(undefined);
                }}
                type="button"
              >
                Dismiss
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
              This is the only time PayMorph will display the secret. Store it in your server&apos;s
              secret manager or environment configuration.
            </p>
            <textarea
              aria-label="New API key secret"
              className="pm-data mt-4 min-h-24 w-full resize-none break-all border border-[var(--line)] bg-white/70 p-3 text-xs text-[var(--ink)] outline-none"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={created.secret}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="pm-button pm-button-primary min-h-10 rounded-xl px-4 text-sm font-semibold"
                onClick={() => void copySecret()}
                type="button"
              >
                Copy secret
              </button>
              {copyStatus ? (
                <span aria-live="polite" className="text-sm text-[var(--muted)]">
                  {copyStatus}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="pm-panel rounded-2xl p-6 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="pm-kicker">Credentials</p>
              <h2 className="pm-display mt-3 text-2xl" id="issued-keys-title">
                Issued keys
              </h2>
            </div>
            <span className="pm-data text-xs text-[var(--muted)]">
              {keys.filter((key) => key.status === 'ACTIVE').length} active
            </span>
          </div>

          {revokeError ? (
            <p className="mt-5 rounded-xl bg-red-950/8 px-4 py-3 text-sm text-red-800" role="alert">
              {revokeError}
            </p>
          ) : null}

          {keys.length ? (
            <ul className="mt-5 space-y-3">
              {keys.map((key) => (
                <li className="border border-[var(--line)] bg-white/40 p-4" key={key.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--ink)]">{key.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                            key.status === 'ACTIVE'
                              ? 'bg-emerald-700/10 text-emerald-800'
                              : 'bg-black/5 text-[var(--muted)]'
                          }`}
                        >
                          {key.status}
                        </span>
                      </div>
                      <p className="pm-data mt-2 text-xs text-[var(--muted-strong)]">
                        {key.prefix}…
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {key.scopes.map((scope) => (
                          <span
                            className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]"
                            key={scope}
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-[var(--muted)]">
                        Created {formatUtcDate(key.createdAt)}
                        {key.lastUsedAt
                          ? ` · Last used ${formatUtcDate(key.lastUsedAt)}`
                          : ' · Never used'}
                        {key.expiresAt ? ` · Expires ${formatUtcDate(key.expiresAt)}` : ''}
                      </p>
                    </div>

                    {key.status === 'ACTIVE' ? (
                      confirmingId === key.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="rounded-xl border border-red-800/25 bg-red-950/5 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                            disabled={revokingId === key.id}
                            onClick={() => void revokeKey(key.id)}
                            type="button"
                          >
                            {revokingId === key.id ? 'Revoking…' : 'Confirm revoke'}
                          </button>
                          <button
                            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
                            disabled={revokingId === key.id}
                            onClick={() => setConfirmingId(undefined)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-red-800/25 hover:text-red-800"
                          onClick={() => setConfirmingId(key.id)}
                          type="button"
                        >
                          Revoke
                        </button>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
              No API keys issued. Create a least-privilege key for your first server integration.
            </div>
          )}
        </div>

        <div className="mt-5 border border-[var(--line)] bg-[var(--surface-deep)] p-5">
          <p className="text-sm font-semibold text-[var(--ink)]">Server example</p>
          <pre className="pm-data mt-3 overflow-x-auto text-xs leading-6 text-[var(--muted-strong)]">{`curl -H "Authorization: Bearer pm_test_..." \\
  "$PAYMORPH_URL/api/v1/invoices"`}</pre>
        </div>
      </section>
    </div>
  );
}

function formatUtcDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
