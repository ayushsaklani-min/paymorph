'use client';
import { useEffect } from 'react';
export function PaymentLinkAnalytics({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `paymorph:link-view:${slug}`;
    let eventKey = localStorage.getItem(key);
    if (!eventKey) {
      eventKey = crypto.randomUUID();
      localStorage.setItem(key, eventKey);
    }
    void fetch(`/api/public/payment-links/${slug}/analytics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'VIEW', eventKey }),
    });
  }, [slug]);
  return null;
}
