"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LinkaBrand, LinkaIcon } from "@/components/linka-brand";
import { checkUsernameAvailability, register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { t as ru } from "@/lib/i18n";
import { useI18n } from "@/providers/i18n-provider";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export default function RegisterPage() {
  useI18n();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "invalid" | "checking" | "available" | "taken" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const normalizedUsername = username.trim().toLowerCase();
  const isUsernameReady = usernameStatus === "available";

  useEffect(() => {
    if (!normalizedUsername) {
      setUsernameStatus("idle");
      return;
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setUsernameStatus("invalid");
      return;
    }

    let isActive = true;
    setUsernameStatus("checking");

    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(normalizedUsername);

        if (isActive) {
          setUsernameStatus(result.available ? "available" : "taken");
        }
      } catch {
        if (isActive) {
          setUsernameStatus("error");
        }
      }
    }, 350);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedUsername]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(ru.auth.errors.passwordsDoNotMatch);
      return;
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError(ru.auth.errors.invalidUsername);
      return;
    }

    if (!isUsernameReady) {
      setError(
        usernameStatus === "taken"
          ? ru.auth.errors.usernameTaken
          : ru.auth.errors.usernameCheckRequired,
      );
      return;
    }

    setIsLoading(true);

    try {
      await register({
        firstName,
        lastName,
        username: normalizedUsername,
        email,
        password,
      });
      router.replace("/chats");
    } catch (error) {
      setError(getRegisterError(error));
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
            {ru.auth.registerTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {ru.auth.registerSubtitle}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.firstName}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder={ru.auth.firstNamePlaceholder}
              autoComplete="given-name"
              disabled={isLoading}
              maxLength={64}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.lastName}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder={ru.auth.optionalPlaceholder}
              autoComplete="family-name"
              disabled={isLoading}
              maxLength={64}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.username}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="text"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))
              }
              placeholder={ru.auth.usernamePlaceholder}
              autoComplete="username"
              disabled={isLoading}
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              required
            />
            <p
              className={`mt-2 text-xs ${
                usernameStatus === "available"
                  ? "text-emerald-300"
                  : usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "text-red-200"
                    : "text-[var(--text-muted)]"
              }`}
            >
              {getUsernameHint(usernameStatus)}
            </p>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.email}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
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
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.password}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={ru.auth.passwordHint}
              autoComplete="new-password"
              disabled={isLoading}
              minLength={8}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.auth.confirmPassword}
            </span>
            <input
              className="ios-input h-12 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={ru.auth.confirmPasswordPlaceholder}
              autoComplete="new-password"
              disabled={isLoading}
              minLength={8}
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
            disabled={isLoading || !isUsernameReady}
          >
            {isLoading ? ru.auth.creatingAccount : ru.auth.createAccount}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          {ru.auth.alreadyHaveAccount}{" "}
          <Link
            className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
            href="/login"
          >
            {ru.auth.loginLink}
          </Link>
        </p>
      </section>
    </main>
  );
}

function getUsernameHint(
  status: "idle" | "invalid" | "checking" | "available" | "taken" | "error",
) {
  if (status === "idle") {
    return ru.auth.usernameHints.idle;
  }

  if (status === "invalid") {
    return ru.auth.errors.invalidUsername;
  }

  if (status === "checking") {
    return ru.auth.usernameHints.checking;
  }

  if (status === "available") {
    return ru.auth.usernameHints.available;
  }

  if (status === "taken") {
    return ru.auth.errors.usernameTaken;
  }

  return ru.auth.usernameHints.error;
}

function getRegisterError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return ru.auth.errors.tooManyAttempts;
    }

    if (error.status === 409) {
      return ru.auth.errors.userExists;
    }

    return ru.auth.errors.registerFailed;
  }

  return ru.auth.errors.registerFailed;
}
