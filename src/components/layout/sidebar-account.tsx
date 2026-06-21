"use client";

import { UserButton, useUser } from "@clerk/nextjs";

export function SidebarAccount() {
  const { isLoaded, user } = useUser();
  const displayName =
    user?.fullName || user?.username || user?.firstName || "account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div
      data-sidebar-account
      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: "size-7",
          },
        }}
      />
      <div
        data-sidebar-account-details
        className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"
      >
        <p className="truncate text-xs font-medium">
          {isLoaded ? displayName : "loading"}
        </p>
        {email ? (
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {email}
          </p>
        ) : null}
      </div>
    </div>
  );
}
