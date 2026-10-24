import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, request) => {
  void auth;
  void request;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // These are dynamic attachment routes, not public static assets.
    "/((?!_next/)[^/]+/[^/]+\\.(?:png|jpe?g|gif|webp|pdf|md|txt|mp3|m4a|wav|ogg|mp4|m4v|mov|webm|ogv))",
    "/__clerk/:path*",
  ],
};
