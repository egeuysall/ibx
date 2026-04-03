declare module "flags" {
  export function safeJsonStringify(
    value: unknown,
    replacer?: ((this: unknown, key: string, value: unknown) => unknown) | null,
    space?: string | number,
  ): string;
}
