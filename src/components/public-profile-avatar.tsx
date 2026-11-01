'use client';

import { Avatar, AvatarFallback, AvatarImage } from 'facehash';

export function PublicProfileAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  return (
    <Avatar className="size-11 rounded-sm border border-border bg-neutral-200 p-0.5 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
      <AvatarImage src={imageUrl} alt={`${name}'s profile picture`} />
      <AvatarFallback name={name} facehashProps={{ variant: 'solid', enableBlink: true, intensity3d: 'subtle' }} />
    </Avatar>
  );
}
