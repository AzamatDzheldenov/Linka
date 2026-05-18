"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  ChevronDown,
  Eye,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  Languages,
  LogOut,
  User,
  X,
} from "lucide-react";
import type { Language } from "@/lib/i18n";
import { useI18n } from "@/providers/i18n-provider";
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
import { logoutAll } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";
import { AppBottomNav } from "@/components/ui/app-bottom-nav";

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
  requireGroupInviteApproval: false,
};

const LANGUAGE_MENU_GAP = 8;
const LANGUAGE_MENU_MARGIN = 12;

export default function SettingsPage() {
  const { language, setLanguage, t: ru } = useI18n();
  const router = useRouter();
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
  const [isLogoutAllConfirmOpen, setIsLogoutAllConfirmOpen] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
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
          setError(ru.settings.loadError);
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
      setNotice(ru.settings.profileSaved);
    } catch (error) {
      setError(
        getSettingsError(error, ru.settings.usernameTaken, ru.settings.saveError),
      );
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
      setNotice(ru.settings.avatarUpdated);
    } catch {
      setError(ru.settings.avatarUpdateError);
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
      setError(ru.settings.saveError);
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

  async function handleLogoutAll() {
    setError(null);
    setNotice(null);
    setIsLoggingOutAll(true);

    try {
      await logoutAll();
      router.replace("/login");
    } catch {
      setError(ru.settings.security.logoutAllError);
      setIsLoggingOutAll(false);
      setIsLogoutAllConfirmOpen(false);
    }
  }

  const fullName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") ||
      currentUser.username
    : ru.settings.sections.profile;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] pb-28 text-[var(--text-main)] lg:pb-0">
      <header className="sticky top-0 z-20 hidden border-b border-[var(--border-soft)] bg-[var(--panel-floating)]/90 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            aria-label={ru.settings.backToChats}
            className="ios-button flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            href="/chats"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{ru.settings.title}</h1>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {currentUser ? `@${currentUser.username}` : ru.settings.loading}
            </p>
          </div>
          {isSavingSettings ? (
            <span className="ml-auto text-sm text-[var(--text-muted)]">
              {ru.settings.saving}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-5 pt-[calc(0.85rem+env(safe-area-inset-top))] lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:py-5">
        <section className="space-y-4">
          <SettingsSection icon={<User size={19} />} title={ru.settings.sections.profile}>
            <form className="space-y-4" onSubmit={handleProfileSubmit}>
              <div className="flex items-center gap-4">
                <label
                  className={`group relative shrink-0 rounded-full ${
                    isUploadingAvatar ? "cursor-wait opacity-70" : "cursor-pointer"
                  }`}
                  title={ru.settings.updateAvatar}
                >
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={isUploadingAvatar}
                    onChange={handleAvatarChange}
                    type="file"
                  />
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-2xl font-semibold text-[var(--accent)] shadow-[inset_0_0_0_0.5px_var(--border-soft)]">
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
                  label={ru.settings.fields.firstName}
                  maxLength={64}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, firstName: value }))
                  }
                  required
                  value={profileForm.firstName}
                />
                <SettingsInput
                  label={ru.settings.fields.lastName}
                  maxLength={64}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, lastName: value }))
                  }
                  value={profileForm.lastName}
                />
              </div>
              <SettingsInput
                label={ru.settings.fields.username}
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
                  {ru.settings.fields.bio}
                </span>
                <textarea
                  className="ios-input min-h-24 w-full resize-none px-4 py-3 text-[15px] placeholder:text-[var(--text-soft)]"
                  maxLength={160}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  placeholder={ru.settings.fields.bioPlaceholder}
                  value={profileForm.bio}
                />
              </label>
              <button
                className="ios-button flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSavingProfile || isLoading}
                type="submit"
              >
                <Check size={18} />
                {isSavingProfile
                  ? ru.settings.actions.savingProfile
                  : ru.settings.actions.saveProfile}
              </button>
            </form>
          </SettingsSection>
        </section>

        <section className="space-y-4">
          <SettingsSection icon={<Palette size={19} />} title={ru.settings.sections.appearance}>
            <SegmentedControl
              label={ru.settings.appearance.theme}
              onChange={(value) => setTheme(value as ThemeMode)}
              options={[
                { icon: <Sun size={16} />, label: ru.settings.appearance.light, value: "light" },
                { icon: <Moon size={16} />, label: ru.settings.appearance.dark, value: "dark" },
                { icon: <Monitor size={16} />, label: ru.settings.appearance.system, value: "system" },
              ]}
              value={theme}
            />
            <SegmentedControl
              label={ru.settings.appearance.textSize}
              onChange={(value) => setTextSize(value as TextSizeMode)}
              options={[
                { label: ru.settings.appearance.small, value: "small" },
                { label: ru.settings.appearance.normal, value: "normal" },
                { label: ru.settings.appearance.large, value: "large" },
              ]}
              value={textSize}
            />
            <ToggleRow
              checked={compactMode}
              label={ru.settings.appearance.compactMode}
              onChange={setCompactMode}
            />
          </SettingsSection>

          <SettingsSection icon={<Languages size={19} />} title={ru.settings.sections.language}>
            <LanguageDropdown
              label={ru.settings.language.select}
              onChange={setLanguage}
              options={[
                { label: ru.settings.language.russian, value: "ru" },
                { label: ru.settings.language.uzbek, value: "uz" },
                { label: ru.settings.language.kyrgyz, value: "ky" },
              ]}
              value={language}
            />
          </SettingsSection>

          <SettingsSection icon={<Bell size={19} />} title={ru.settings.sections.notifications}>
            <ToggleRow
              checked={settings.pushEnabled}
              label={ru.settings.notifications.push}
              onChange={(value) => updateRemoteSetting("pushEnabled", value)}
            />
            <ToggleRow
              checked={settings.soundEnabled}
              label={ru.settings.notifications.sound}
              onChange={(value) => updateRemoteSetting("soundEnabled", value)}
            />
            <ToggleRow
              checked={settings.messagePreviewEnabled}
              label={ru.settings.notifications.messagePreview}
              onChange={(value) => updateRemoteSetting("messagePreviewEnabled", value)}
            />
          </SettingsSection>

          <SettingsSection icon={<Shield size={19} />} title={ru.settings.sections.privacy}>
            <ToggleRow
              checked={settings.allowSearchByUsername}
              label={ru.settings.privacy.searchable}
              onChange={(value) => updateRemoteSetting("allowSearchByUsername", value)}
            />
            <ToggleRow
              checked={settings.showOnlineStatus}
              icon={<Eye size={17} />}
              label={ru.settings.privacy.onlineStatus}
              onChange={(value) => updateRemoteSetting("showOnlineStatus", value)}
            />
            <ToggleRow
              checked={settings.showReadReceipts}
              label={ru.settings.privacy.readReceipts}
              onChange={(value) => updateRemoteSetting("showReadReceipts", value)}
            />
            <ToggleRow
              checked={settings.requireGroupInviteApproval}
              label={ru.settings.privacy.groupInviteApproval}
              onChange={(value) =>
                updateRemoteSetting("requireGroupInviteApproval", value)
              }
            />
          </SettingsSection>

          <SettingsSection icon={<Shield size={19} />} title={ru.settings.sections.security}>
            <ActionRow
              description={ru.settings.security.logoutAllHint}
              disabled={isLoggingOutAll}
              icon={<LogOut size={17} />}
              label={
                isLoggingOutAll
                  ? ru.settings.actions.loggingOutAll
                  : ru.settings.actions.logoutAll
              }
              onClick={() => setIsLogoutAllConfirmOpen(true)}
              tone="danger"
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
      {isLogoutAllConfirmOpen ? (
        <ConfirmModal
          cancelLabel={ru.settings.actions.logoutAllCancel}
          confirmLabel={
            isLoggingOutAll
              ? ru.settings.actions.loggingOutAll
              : ru.settings.actions.logoutAllConfirm
          }
          description={ru.settings.actions.logoutAllConfirmText}
          isConfirming={isLoggingOutAll}
          onCancel={() => setIsLogoutAllConfirmOpen(false)}
          onConfirm={handleLogoutAll}
          title={ru.settings.actions.logoutAllConfirmTitle}
        />
      ) : null}
      <AppBottomNav />
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
    <section className="ios-grouped">
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
        className="ios-input h-11 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
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
      <div className="grid rounded-[14px] border border-[var(--border-soft)] bg-[var(--input-bg)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              className={`flex h-9 items-center justify-center gap-1.5 rounded px-2 text-sm font-medium transition ${
                isSelected
                  ? "rounded-[11px] bg-[var(--accent)] text-white shadow-sm"
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

function LanguageDropdown({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Language) => void;
  options: Array<{ label: string; value: Language }>;
  value: Language;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    maxHeight: number;
    placement: "top" | "bottom";
    top: number;
    width: number;
  } | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    window.visualViewport?.addEventListener("resize", updateMenuPosition);
    window.visualViewport?.addEventListener("scroll", updateMenuPosition);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.visualViewport?.removeEventListener("resize", updateMenuPosition);
      window.visualViewport?.removeEventListener("scroll", updateMenuPosition);
    };
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !menuPosition) {
      return;
    }

    window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
  }, [activeIndex, isOpen, menuPosition]);

  function openDropdown(nextIndex = selectedIndex) {
    setActiveIndex(nextIndex);
    setIsOpen(true);
  }

  function closeDropdown() {
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  function selectOption(index: number) {
    const option = options[index];

    if (!option) {
      return;
    }

    onChange(option.value);
    closeDropdown();
  }

  function moveActive(delta: number) {
    const nextIndex = (activeIndex + delta + options.length) % options.length;
    setActiveIndex(nextIndex);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const menuHeight = options.length * 44 + 8;
    const safeTop = LANGUAGE_MENU_MARGIN;
    const safeBottom = viewportHeight - LANGUAGE_MENU_MARGIN;
    const availableWidth = viewportWidth - LANGUAGE_MENU_MARGIN * 2;
    const width = Math.min(rect.width, availableWidth);
    const left = Math.min(
      Math.max(rect.left, LANGUAGE_MENU_MARGIN),
      viewportWidth - width - LANGUAGE_MENU_MARGIN,
    );
    const spaceBelow = safeBottom - rect.bottom - LANGUAGE_MENU_GAP;
    const spaceAbove = rect.top - safeTop - LANGUAGE_MENU_GAP;
    const placement =
      spaceBelow < menuHeight && spaceAbove > spaceBelow ? "top" : "bottom";
    const unclampedTop =
      placement === "top"
        ? rect.top - LANGUAGE_MENU_GAP - menuHeight
        : rect.bottom + LANGUAGE_MENU_GAP;
    const top = Math.min(
      Math.max(unclampedTop, safeTop),
      Math.max(safeTop, safeBottom - menuHeight),
    );

    setMenuPosition({
      left,
      maxHeight: Math.max(96, safeBottom - safeTop),
      placement,
      top,
      width,
    });
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (isOpen) {
        moveActive(1);
      } else {
        openDropdown((selectedIndex + 1) % options.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (isOpen) {
        moveActive(-1);
      } else {
        openDropdown((selectedIndex - 1 + options.length) % options.length);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        selectOption(activeIndex);
      } else {
        openDropdown();
      }
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeDropdown();
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
    }
  }

  const menu =
    isPortalReady && isOpen
      ? createPortal(
          <AnimatePresence>
            {menuPosition ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="ios-glass fixed z-[100] overflow-y-auto rounded-[20px] p-1"
                exit={{
                  opacity: 0,
                  scale: 0.98,
                  y: menuPosition.placement === "top" ? 6 : -6,
                }}
                initial={{
                  opacity: 0,
                  scale: 0.98,
                  y: menuPosition.placement === "top" ? 6 : -6,
                }}
                ref={menuRef}
                role="listbox"
                style={{
                  left: menuPosition.left,
                  maxHeight: menuPosition.maxHeight,
                  top: menuPosition.top,
                  transformOrigin:
                    menuPosition.placement === "top"
                      ? "bottom center"
                      : "top center",
                  width: menuPosition.width,
                }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                {options.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      aria-selected={isSelected}
                      className={`flex h-11 w-full items-center gap-3 rounded-[15px] px-3 text-left text-[15px] transition focus-visible:outline-none ${
                        isSelected
                          ? "bg-[var(--active-soft)] text-[var(--accent)]"
                          : "text-[var(--text-main)]"
                      } ${
                        isActive
                          ? "bg-[var(--hover-soft)]"
                          : "hover:bg-[var(--hover-soft)]"
                      }`}
                      key={option.value}
                      onClick={() => selectOption(index)}
                      onKeyDown={handleOptionKeyDown}
                      onMouseEnter={() => setActiveIndex(index)}
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {option.label}
                      </span>
                      {isSelected ? <Check size={18} /> : null}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">{label}</p>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="ios-button flex h-12 w-full items-center gap-3 rounded-[16px] border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 text-left transition hover:bg-[var(--hover-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text-main)]">
          {selectedOption.label}
        </span>
        <ChevronDown
          className={`shrink-0 text-[var(--text-muted)] transition ${
            isOpen ? "rotate-180" : ""
          }`}
          size={18}
        />
      </button>
      {menu}
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
      className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-1 text-left transition hover:bg-[var(--hover-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
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
          checked ? "bg-[var(--accent)]" : "bg-[var(--input-bg)] shadow-[inset_0_0_0_0.5px_var(--border-soft)]"
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

function ActionRow({
  description,
  disabled = false,
  icon,
  label,
  onClick,
  tone = "default",
}: {
  description?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] px-1 text-left transition hover:bg-[var(--hover-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 disabled:cursor-wait disabled:opacity-70 ${
        tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-main)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--input-bg)]">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm font-normal text-[var(--text-muted)]">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function ConfirmModal({
  cancelLabel,
  confirmLabel,
  description,
  isConfirming,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isConfirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <section className="ios-glass w-full max-w-sm overflow-hidden rounded-[24px]">
        <header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3">
          <h2 className="min-w-0 flex-1 text-[16px] font-semibold">{title}</h2>
          <button
            aria-label={cancelLabel}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] disabled:opacity-50"
            disabled={isConfirming}
            onClick={onCancel}
            type="button"
          >
            <X size={19} />
          </button>
        </header>
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm leading-6 text-[var(--text-muted)]">{description}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="h-10 rounded-md border border-[var(--border-soft)] px-4 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--hover-soft)] disabled:opacity-50"
              disabled={isConfirming}
              onClick={onCancel}
              type="button"
            >
              {cancelLabel}
            </button>
            <button
              className="h-10 rounded-md bg-[var(--danger)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
              disabled={isConfirming}
              onClick={onConfirm}
              type="button"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
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

function getSettingsError(
  error: unknown,
  usernameTakenMessage: string,
  fallbackMessage: string,
) {
  if (error instanceof ApiError && error.status === 409) {
    return usernameTakenMessage;
  }

  return fallbackMessage;
}
