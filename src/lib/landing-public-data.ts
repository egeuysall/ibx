export type LandingDriveItem = {
  id: string;
  name: string;
  path: string;
  size: string;
  href: string;
};

type PublicFile = {
  id?: unknown;
  fileName?: unknown;
  folderPath?: unknown;
  size?: unknown;
  url?: unknown;
};

const PUBLIC_DATA_ORIGIN = "https://ibx.egeuysal.com";
const PUBLIC_USERNAME = "egeuysall";

function formatSize(bytes: number) {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1_000))} kb`
    : `${(bytes / 1_000_000).toFixed(1)} mb`;
}

export async function getPublicLandingFiles(): Promise<LandingDriveItem[]> {
  try {
    const response = await fetch(`${PUBLIC_DATA_ORIGIN}/api/public/files/${PUBLIC_USERNAME}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];
    const result = await response.json() as { files?: PublicFile[] };
    return (result.files ?? []).flatMap((file, index) => {
      if (typeof file.fileName !== "string" || typeof file.url !== "string" || typeof file.size !== "number") return [];
      const folderPath = Array.isArray(file.folderPath)
        ? file.folderPath.filter((part): part is string => typeof part === "string").join("/")
        : "";
      const path = `/${[folderPath, file.fileName].filter(Boolean).join("/")}`;
      return [{
        id: typeof file.id === "string" ? file.id : `public-${index}`,
        name: file.fileName,
        path,
        size: formatSize(file.size),
        href: file.url,
      }];
    }).slice(0, 10);
  } catch {
    return [];
  }
}

export function getIbxSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? PUBLIC_DATA_ORIGIN).replace(/\/+$/, "");
}
