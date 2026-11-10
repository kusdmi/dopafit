import { useEffect, useState } from 'react';

import { fetchPrivatePhoto } from '../api/fetch-private-photo';

interface Props {
  url: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'sync' | 'async' | 'auto';
}

export function PrivatePhoto({ url, alt, className, loading, decoding }: Props) {
  const [loaded, setLoaded] = useState<{ source: string; objectUrl: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let created: string | null = null;
    void fetchPrivatePhoto(url, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        created = URL.createObjectURL(blob);
        setLoaded({ source: url, objectUrl: created });
      })
      .catch(() => {
        // The visible alt text remains if the image is unavailable offline or access is revoked.
      });
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return <img src={loaded?.source === url ? loaded.objectUrl : undefined} alt={alt} className={className} loading={loading} decoding={decoding} />;
}
