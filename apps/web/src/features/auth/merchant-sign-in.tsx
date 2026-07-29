'use client';

import { useState } from 'react';

type SignInState = 'idle' | 'requesting' | 'signing' | 'verifying' | 'error';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function MerchantSignIn() {
  const [state, setState] = useState<SignInState>('idle');
  const [error, setError] = useState<string>();

  async function signIn() {
    try {
      setError(undefined);
      setState('requesting');
      if (!window.ethereum) throw new Error('Install an EVM wallet to continue.');
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error('No wallet account was selected.');

      const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
      if (Number.parseInt(chainId, 16) !== 114) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x72' }],
        });
      }

      const nonceResponse = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const nonceEnvelope = (await nonceResponse.json()) as {
        data?: { nonceId: string; nonce: string; message: string };
        error?: { message: string };
      };
      if (!nonceResponse.ok || !nonceEnvelope.data) {
        throw new Error(nonceEnvelope.error?.message ?? 'Could not create sign-in challenge.');
      }

      setState('signing');
      const signature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [nonceEnvelope.data.message, walletAddress],
      })) as string;

      setState('verifying');
      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          nonceId: nonceEnvelope.data.nonceId,
          nonce: nonceEnvelope.data.nonce,
          signature,
        }),
      });
      const verifyEnvelope = (await verifyResponse.json()) as {
        error?: { message: string };
      };
      if (!verifyResponse.ok) {
        throw new Error(verifyEnvelope.error?.message ?? 'Wallet signature could not be verified.');
      }
      window.location.assign('/dashboard');
    } catch (caught) {
      setState('error');
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
    }
  }

  return (
    <div>
      <button
        className="min-h-11 w-full rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-ink)] disabled:opacity-60"
        disabled={state !== 'idle' && state !== 'error'}
        onClick={() => void signIn()}
        type="button"
      >
        {state === 'idle' || state === 'error' ? 'Connect Coston2 wallet' : 'Confirming wallet…'}
      </button>
      {error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
