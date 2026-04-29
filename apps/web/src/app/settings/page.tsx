"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  Eye,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { TextSizeMode, useAppearance } from "@/providers/appearance-provider";
import { ThemeMode, useTheme } from "@/providers/theme-provider";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import {
  UserSettings,
  getMe,
  getUserSettings,
  updateMe,
  updateUserSettings,
  uploadAvatar,
} from "@/lib/api/users";
import { useAuthStore } from "@/store/auth-store";

type ProfileForm = {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
};

const defaultSettings: Omit<UserSettings, "id" | "userId" | "createdAt" | "updatedAt"> = {
  showOnlineStatus: true,
  showReadReceipts: true,
  allowSearchByUsername: true,
  messagePreviewEnabled: true,
  pushEnabled: false,
  soundEnabled: true,
};

export default function SettingsPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const { theme, setTheme } = useTheme();
  const { compactMode, setCompactMode, setTextSize, textSize } = useAppearance();
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    username: "",
    bio: "",
  });
  const [settings, setSettings] = useState(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const [user, remoteSettings] = await Promise.all([
          currentUser ? Promise.resolve(currentUser) : getMe(),
          getUserSettings(),
        ]);

        if (isActive) {
          setProfileForm(toProfileForm(user));
          setSettings(remoteSettings);
        }
      } catch {
        if (isActive) {
          setError("Не удалось загрузить настройки.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setProfileForm(toProfileForm(currentUser));
    }
  }, [currentUser]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSavingProfile(true);

    try {
      const user = await updateMe({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        username: profileForm.username.trim(),
        bio: profileForm.bio.trim(),
      });
      setProfileForm(toProfileForm(user));
      setNotice("Профиль сохранен.");
    } catch (error) {
      setError(getSettingsError(error));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsUploadingAvatar(true);

    try {
      await uploadAvatar(file);
      setNotice("Аватар обновлен.");
    } catch {
      setError("Не удалось обновить аватар.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function saveRemoteSettings(nextSettings: typeof defaultSettings) {
    setSettings(nextSettings);
    setIsSavingSettings(true);
    setError(null);

    try {
      const savedSettings = await updateUserSettings(nextSettings);
      setSettings(savedSettings);
    } catch {
      setError("Не удалось сохранить настройки.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  function updateRemoteSetting<K extends keyof typeof defaultSettings>(
    key: K,
    value: (typeof defaultSettings)[K],
  ) {
    void saveRemoteSettings({ ...settings, [key]: value });
  }

  const fullName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") ||
      currentUser.username
    : "Профиль";

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-soft)] bg-[var(--panel-bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            aria-label="Назад к чатам"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            href="/chats"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Настройки</h1>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {currentUser ? `@${currentUser.username}` : "Загрузка..."}
            </p>
          </div>
          {isSavingSettings ? (
            <span className="ml-auto text-sm text-[var(--text-muted)]">
              Сохраняем...
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <section className="space-y-4">
          <SettingsSection icon={<User size={19} />} title="Профиль">
            <form className="space-y-4" onSubmit={handleProfileSubmit}>
              <div className="flex items-center gap-4">
                <label
                  className={`group relative shrink-0 rounded-full ${
                    isUploadingAvatar ? "cursor-wait opacity-70" : "cursor-pointer"
                  }`}
                  title="Обновить аватар"
                >
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={isUploadingAvatar}
                    onChange={handleAvatarChange}
                    type="file"
                  />
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-2xl font-semibold text-[var(--accent)]">
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
                  <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-elevated)] text-[var(--accent)] shadow-lg transition group-hover:bg-[var(--hover-soft)]">
                    <Camera size={16} />
                  </span>
                </label>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{fullName}</p>
                  <p className="truncate text-sm text-[var(--text-muted)]">
                    {currentUser ? `@${currentUser.username}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsInput
                  label="Имя"
                  maxLength={64}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, firstName: value }))
                  }
                  required
                  value={profileForm.firstName}
                />
                <SettingsInput
                  label="Фамилия"
                  maxLength={64}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, lastName: value }))
                  }
                  value={profileForm.lastName}
                />
              </div>
              <SettingsInput
                label="Username"
                maxLength={20}
                minLength={3}
                onChange={(value) =>
                  setProfileForm((current) => ({
                    ...current,
                    username: value.toLowerCase().replace(/\s/g, ""),
                  }))
                }
                pattern="[a-z0-9_]{3,20}"
                required
                value={profileForm.username}
              />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
                  Bio
                </span>
                <textarea
                  className="min-h-24 w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 py-3 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
                  maxLength={160}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  placeholder="Пара строк о себе"
                  value={profileForm.bio}
                />
              </label>
              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSavingProfile || isLoading}
                type="submit"
              >
                <Check size={18} />
                {isSavingProfile ? "Сохранение..." : "Сохранить профиль"}
              </button>
            </form>
          </SettingsSection>
        </section>

        <section className="space-y-4">
          <SettingsSection icon={<Palette size={19} />} title="Внешний вид">
            <SegmentedControl
              label="Тема"
              onChange={(value) => setTheme(value as ThemeMode)}
              options={[
                { icon: <Sun size={16} />, label: "Light", value: "light" },
                { icon: <Moon size={16} />, label: "Dark", value: "dark" },
                { icon: <Monitor size={16} />, label: "System", value: "system" },
              ]}
              value={theme}
            />
            <SegmentedControl
              label="Размер текста"
              onChange={(value) => setTextSize(value as TextSizeMode)}
              options={[
                { label: "Small", value: "small" },
                { label: "Normal", value: "normal" },
                { label: "Large", value: "large" },
              ]}
              value={textSize}
            />
            <ToggleRow
              checked={compactMode}
              label="Compact mode"
              onChange={setCompactMode}
            />
          </SettingsSection>

          <SettingsSection icon={<Bell size={19} />} title="Уведомления">
            <ToggleRow
              checked={settings.pushEnabled}
              label="Push notifications"
              onChange={(value) => updateRemoteSetting("pushEnabled", value)}
            />
            <ToggleRow
              checked={settings.soundEnabled}
              label="Sound"
              onChange={(value) => updateRemoteSetting("soundEnabled", value)}
            />
            <ToggleRow
              checked={settings.messagePreviewEnabled}
              label="Message preview"
              onChange={(value) => updateRemoteSetting("messagePreviewEnabled", value)}
            />
          </SettingsSection>

          <SettingsSection icon={<Shield size={19} />} title="Приватность">
            <ToggleRow
              checked={settings.allowSearchByUsername}
              label="Меня можно найти по username"
              onChange={(value) => updateRemoteSetting("allowSearchByUsername", value)}
            />
            <ToggleRow
              checked={settings.showOnlineStatus}
              icon={<Eye size={17} />}
              label="Показывать online статус"
              onChange={(value) => updateRemoteSetting("showOnlineStatus", value)}
            />
            <ToggleRow
              checked={settings.showReadReceipts}
              label="Показывать read receipts"
              onChange={(value) => updateRemoteSetting("showReadReceipts", value)}
            />
          </SettingsSection>

          {notice ? (
            <p className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SettingsSection({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-xl shadow-black/10">
      <header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--accent)]">
          {icon}
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </header>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

function SettingsInput({
  label,
  maxLength,
  minLength,
  onChange,
  pattern,
  required = false,
  value,
}: {
  label: string;
  maxLength: number;
  minLength?: number;
  onChange: (value: string) => void;
  pattern?: string;
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
        required={required}
        type="text"
        value={value}
      />
    </label>
  );
}

function SegmentedControl({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ icon?: React.ReactNode; label: string; value: string }>;
  value: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">{label}</p>
      <div className="grid rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              className={`flex h-9 items-center justify-center gap-1.5 rounded px-2 text-sm font-medium transition ${
                isSelected
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
              }`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon?: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className="flex min-h-12 w-full items-center gap-3 rounded-md px-1 text-left transition hover:bg-[var(--hover-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
      onClick={() => onChange(!checked)}
      type="button"
    >
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--text-muted)]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-[15px] font-medium">{label}</span>
      <span
        className={`relative h-7 w-12 rounded-full transition ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--input-bg)]"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

function toProfileForm(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  bio?: string | null;
}) {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    username: user.username ?? "",
    bio: user.bio ?? "",
  };
}

function resolveUploadUrl(url: string) {
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
}

function getSettingsError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return "Username уже занят.";
  }

  return "Не удалось сохранить настройки.";
}
