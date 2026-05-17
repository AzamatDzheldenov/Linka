"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LinkaBrand, LinkaIcon } from "@/components/linka-brand";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { t as ru } from "@/lib/i18n";
import { useI18n } from "@/providers/i18n-provider";

export default function LoginPage() {
  useI18n();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ identifier, password });
      router.replace("/chats");
    } catch (error) {
      setError(getLoginError(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-10 text-[var(--text-main)]">
      <LinkaBrand
        className="absolute left-4 top-4 sm:left-6 sm:top-6"
        iconSize={38}
        priority
        textClassName="text-[var(--text-main)]"
      />
      <section className="ios-grouped w-full max-w-[420px] px-6 py-7 sm:px-8 sm:py-8">
        <div className="mb-7 text-center">
          <LinkaIcon
            className="mx-auto mb-4 shadow-lg shadow-[#2aabee]/20"
            priority
            size={56}
          />
          <h1 className="text-2xl font-semibold tracking-normal text-[var(--text-main)]">
            {ru.auth.loginTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {ru.auth.loginSubtitle}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.identifier}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={ru.auth.identifierPlaceholder}
              autoComplete="username"
              disabled={isLoading}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.password}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={ru.auth.passwordPlaceholder}
              autoComplete="current-password"
              disabled={isLoading}
              required
            />
          </label>

          {error ? (
            <div className="rounded-[14px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <button
            className="ios-button mt-2 flex h-12 w-full items-center justify-center rounded-full bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? ru.auth.signingIn : ru.auth.signIn}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          {ru.auth.noAccount}{" "}
          <Link
            className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
            href="/register"
          >
            {ru.auth.registerLink}
          </Link>
        </p>
      </section>
    </main>
  );
}

function getLoginError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return ru.auth.errors.tooManyAttempts;
    }

    if (error.status === 401) {
      return ru.auth.errors.invalidCredentials;
    }

    return ru.auth.errors.loginFailed;
  }

  return ru.auth.errors.loginFailed;
}
