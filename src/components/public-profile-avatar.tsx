'use client';

import { Facehash } from 'facehash';

export function PublicProfileAvatar({ name }: { name: string }) {
  return (
    <div className="rounded-sm border border-border bg-neutral-200 p-0.5 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <Facehash name={name} size={40} variant="solid" enableBlink intensity3d="subtle" />
    </div>
  );
}
