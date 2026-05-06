"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Camera, Check, Pencil } from "lucide-react";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import type { Messages } from "@/lib/i18n";
import { getMe, updateMe, uploadAvatar } from "@/lib/api/users";
import { useI18n } from "@/providers/i18n-provider";
import { useAuthStore } from "@/store/auth-store";

type ProfileForm = {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
  nameEmoji: string;
};

const NAME_SYMBOL_VALUES = [
  "",
  "✨",
  "🌙",
  "☀️",
  "⚡",
  "💎",
  "🪐",
  "🌿",
  "🔥",
  "🎧",
  "🖤",
  "🪽",
  "🧿",
  "🫧",
  "🌊",
  "🕊️",
] as const;

export default function ProfilePage() {
  const { t: ru } = useI18n();
  const currentUser = useAuthStore((state) => state.currentUser);
  const nameSymbols = getNameSymbols(ru);
  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    username: "",
    bio: "",
    nameEmoji: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(!currentUser);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      if (currentUser) {
        return;
      }

      setIsLoading(true);

      try {
        await getMe();
      } catch {
        if (isActive) {
          setError(ru.profile.loadError);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setForm(toProfileForm(currentUser));
  }, [currentUser]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const user = await updateMe({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
        nameEmoji: form.nameEmoji,
      });
      setForm(toProfileForm(user));
      setIsEditing(false);
    } catch (error) {
      setError(getProfileError(error, ru));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setIsUploadingAvatar(true);

    try {
      await uploadAvatar(file);
    } catch {
      setError(ru.profile.avatarUpdateError);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const fullName = currentUser
    ? [currentUser.firstName ?? "", currentUser.lastName ?? ""].filter(Boolean).join(" ") ||
      currentUser.username
    : ru.profile.title;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--panel-bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Link
            aria-label={ru.profile.backToChats}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            href="/chats"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{ru.profile.title}</h1>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {currentUser ? `@${currentUser.username}` : ru.profile.loading}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 py-5">
        <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-xl shadow-black/10">
          <div className="flex flex-col items-center px-5 pb-6 pt-7 text-center">
            <label
              className={`group relative rounded-full outline-none ${
                isUploadingAvatar ? "cursor-wait opacity-70" : "cursor-pointer"
              }`}
              title={ru.profile.updateAvatar}
            >
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={isUploadingAvatar}
                onChange={handleAvatarChange}
                type="file"
              />
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-4xl font-semibold text-[var(--accent)]">
                {currentUser?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={resolveUploadUrl(currentUser.avatarUrl)}
                  />
                ) : (
                  fullName.slice(0, 1).toUpperCase()
                )}
              </div>
              <span className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-elevated)] text-[var(--accent)] shadow-lg transition group-hover:bg-[var(--hover-soft)]">
                <Camera size={18} />
              </span>
            </label>

            <h2 className="mt-4 max-w-full truncate text-2xl font-semibold">
              {isLoading
                ? ru.profile.loading
                : formatNameWithEmoji(fullName, currentUser?.nameEmoji)}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {currentUser ? `@${currentUser.username}` : ""}
            </p>
            {currentUser?.bio ? (
              <p className="mt-4 max-w-xl whitespace-pre-wrap break-words text-[15px] leading-6 text-[var(--text-main)]">
                {currentUser.bio}
              </p>
            ) : (
              <p className="mt-4 text-[15px] text-[var(--text-muted)]">
                {ru.profile.emptyBio}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--border-soft)] px-5 py-4">
            {isEditing ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <ProfileInput
                  label={ru.profile.firstName}
                  maxLength={64}
                  onChange={(value) => setForm((current) => ({ ...current, firstName: value }))}
                  required
                  value={form.firstName}
                />
                <ProfileInput
                  label={ru.profile.lastName}
                  maxLength={64}
                  onChange={(value) => setForm((current) => ({ ...current, lastName: value }))}
                  value={form.lastName}
                />
                <ProfileInput
                  label="Username"
                  maxLength={20}
                  minLength={3}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      username: value.toLowerCase().replace(/\s/g, ""),
                    }))
                  }
                  pattern="[a-z0-9_]{3,20}"
                  required
                  value={form.username}
                />
                <NameSymbolPicker
                  onChange={(value) =>
                    setForm((current) => ({ ...current, nameEmoji: value }))
                  }
                  symbols={nameSymbols}
                  value={form.nameEmoji}
                />
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
                    {ru.profile.bio}
                  </span>
                  <textarea
                    className="min-h-28 w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 py-3 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                    maxLength={160}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, bio: event.target.value }))
                    }
                    placeholder={ru.profile.bioPlaceholder}
                    value={form.bio}
                  />
                </label>

                {error ? <ProfileError>{error}</ProfileError> : null}

                <div className="flex gap-2">
                  <button
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isSaving}
                    type="submit"
                  >
                    <Check size={18} />
                    {isSaving ? ru.profile.saving : ru.profile.save}
                  </button>
                  <button
                    className="h-11 rounded-md px-4 text-[15px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
                    disabled={isSaving}
                    onClick={() => {
                      if (currentUser) {
                        setForm(toProfileForm(currentUser));
                      }
                      setIsEditing(false);
                    }}
                    type="button"
                  >
                    {ru.profile.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {error ? <ProfileError>{error}</ProfileError> : null}
                <button
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--input-bg)] px-4 text-[15px] font-semibold text-[var(--accent)] transition hover:bg-[var(--hover-soft)]"
                  disabled={!currentUser}
                  onClick={() => setIsEditing(true)}
                  type="button"
                >
                  <Pencil size={18} />
                  {ru.profile.edit}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ProfileInput({
  label,
  maxLength,
  minLength,
  onChange,
  pattern,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  maxLength: number;
  minLength?: number;
  onChange: (value: string) => void;
  pattern?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
        {label}
      </span>
      <input
        className="h-11 w-full rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
        maxLength={maxLength}
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        pattern={pattern}
        placeholder={placeholder}
        required={required}
        type="text"
        value={value}
      />
    </label>
  );
}

function NameSymbolPicker({
  onChange,
  symbols,
  value,
}: {
  onChange: (value: string) => void;
  symbols: Array<{ value: string; label: string; hint: string; legend?: string }>;
  value: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
        {symbols[0]?.legend}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {symbols.map((symbol) => {
          const isSelected = value === symbol.value;

          return (
            <button
              className={`flex min-h-14 items-center gap-2 rounded-md border px-3 text-left transition ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--active-soft)]"
                  : "border-[var(--border-soft)] bg-[var(--input-bg)] hover:bg-[var(--hover-soft)]"
              }`}
              key={symbol.label}
              onClick={() => onChange(symbol.value)}
              type="button"
            >
              <span className="w-7 text-center text-xl">{symbol.value || "∅"}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--text-main)]">
                  {symbol.label}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {symbol.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProfileError({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-[var(--danger)]">
      {children}
    </div>
  );
}

function resolveUploadUrl(url: string) {
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
}

function getProfileError(error: unknown, ru: Messages) {
  if (error instanceof ApiError && error.status === 409) {
    return ru.profile.usernameTaken;
  }

  return ru.profile.saveError;
}

function toProfileForm(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  bio?: string | null;
  nameEmoji?: string | null;
}) {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    username: user.username ?? "",
    bio: user.bio ?? "",
    nameEmoji: NAME_SYMBOL_VALUES.some((symbol) => symbol === user.nameEmoji)
      ? user.nameEmoji ?? ""
      : "",
  };
}

function formatNameWithEmoji(name: string, nameEmoji?: string | null) {
  return [nameEmoji, name].filter(Boolean).join(" ");
}

function getNameSymbols(ru: Messages) {
  return [
    {
      value: "",
      label: ru.profile.symbols.none,
      hint: ru.profile.symbols.minimal,
      legend: ru.profile.nameSymbol,
    },
    { value: "✨", label: ru.profile.symbols.sparkle, hint: ru.profile.symbols.creative },
    { value: "🌙", label: ru.profile.symbols.moon, hint: ru.profile.symbols.calm },
    { value: "☀️", label: ru.profile.symbols.sun, hint: ru.profile.symbols.open },
    { value: "⚡", label: ru.profile.symbols.lightning, hint: ru.profile.symbols.energetic },
    { value: "💎", label: ru.profile.symbols.crystal, hint: ru.profile.symbols.stylish },
    { value: "🪐", label: ru.profile.symbols.orbit, hint: ru.profile.symbols.dreamer },
    { value: "🌿", label: ru.profile.symbols.leaf, hint: ru.profile.symbols.soft },
    { value: "🔥", label: ru.profile.symbols.fire, hint: ru.profile.symbols.brave },
    { value: "🎧", label: ru.profile.symbols.sound, hint: ru.profile.symbols.musical },
    { value: "🖤", label: ru.profile.symbols.graphite, hint: ru.profile.symbols.concise },
    { value: "🪽", label: ru.profile.symbols.wing, hint: ru.profile.symbols.light },
    { value: "🧿", label: ru.profile.symbols.amulet, hint: ru.profile.symbols.mysterious },
    { value: "🫧", label: ru.profile.symbols.bubble, hint: ru.profile.symbols.airy },
    { value: "🌊", label: ru.profile.symbols.wave, hint: ru.profile.symbols.flexible },
    { value: "🕊️", label: ru.profile.symbols.peace, hint: ru.profile.symbols.warm },
  ];
}
