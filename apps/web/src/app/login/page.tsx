"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { ru } from "@/lib/i18n/ru";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
      router.replace("/chats");
    } catch (error) {
      setError(getLoginError(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e1621] px-4 py-10 text-[#f5f8fb]">
      <section className="w-full max-w-[420px] rounded-lg border border-white/5 bg-[#17212b] px-6 py-7 shadow-2xl shadow-black/30 sm:px-8 sm:py-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#2aabee] text-2xl font-semibold text-white shadow-lg shadow-[#2aabee]/20">
            L
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-white">
            {ru.auth.loginTitle}
          </h1>
          <p className="mt-2 text-sm text-[#8fa3b5]">
            {ru.auth.loginSubtitle}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#b7c5d2]">
              {ru.auth.email}
            </span>
            <input
              className="h-12 w-full rounded-md border border-white/5 bg-[#242f3d] px-4 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={ru.auth.emailPlaceholder}
              autoComplete="email"
              disabled={isLoading}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#b7c5d2]">
              {ru.auth.password}
            </span>
            <input
              className="h-12 w-full rounded-md border border-white/5 bg-[#242f3d] px-4 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
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
            <div className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            className="mt-2 flex h-12 w-full items-center justify-center rounded-md bg-[#2aabee] px-4 text-[15px] font-semibold text-white transition hover:bg-[#239bd8] focus:outline-none focus:ring-2 focus:ring-[#2aabee]/35 disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? ru.auth.signingIn : ru.auth.signIn}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8fa3b5]">
          {ru.auth.noAccount}{" "}
          <Link
            className="font-medium text-[#2aabee] transition hover:text-[#55c2f2]"
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
    if (error.status === 401) {
      return ru.auth.errors.invalidCredentials;
    }

    return ru.auth.errors.loginFailed;
  }

  return ru.auth.errors.loginFailed;
}
