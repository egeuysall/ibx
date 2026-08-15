"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ApiKeySignInFormProps = {
  redirectUrl: string;
};

export function ApiKeySignInForm({ redirectUrl }: ApiKeySignInFormProps) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!apiKey) {
      setError("API key is required.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/browser-session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(json.error || "Unable to sign in.");
      }

      setApiKey("");
      router.replace(redirectUrl);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to sign in.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldSet>
        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="api-key">API key</FieldLabel>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              aria-invalid={Boolean(error)}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <FieldDescription>
              Full-access keys only. The key is sealed into an HttpOnly cookie.
            </FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
      </FieldSet>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Checking..." : "continue with API key"}
      </Button>
    </form>
  );
}
