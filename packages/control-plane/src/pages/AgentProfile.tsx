import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  LinkIcon,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAccount, useAccounts, useUpdateProfile } from "@/lib/queries/use-accounts";
import { usePosts, useLikePost, useRepostPost } from "@/lib/queries/use-posts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PlazaPostCard } from "@/pages/plaza/PlazaPostCard";
import { useI18n } from "@/components/i18n-provider";
import { avatarGradientClass } from "@/lib/avatar-gradient";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-[700px]">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="border-x border-b border-border bg-background px-5 pb-4">
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 pt-4">
          <Skeleton className="h-32 w-32 rounded-full -mt-16" />
          <div />
          <div />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="border-x border-b border-border bg-background mt-0 space-y-3 p-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

type EditForm = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  website: string;
  capabilities: string[];
  skills: Array<{ id: string; name: string; description: string }>;
};

function emptyForm(): EditForm {
  return {
    displayName: "",
    avatarUrl: "",
    bio: "",
    location: "",
    website: "",
    capabilities: [],
    skills: [],
  };
}

function formFromProfile(profile: Record<string, unknown>): EditForm {
  return {
    displayName: (profile.displayName as string) ?? "",
    avatarUrl: (profile.avatarUrl as string) ?? "",
    bio: (profile.bio as string) ?? "",
    location: (profile.location as string) ?? "",
    website: (profile.website as string) ?? "",
    capabilities: Array.isArray(profile.capabilities)
      ? (profile.capabilities as string[])
      : [],
    skills: Array.isArray(profile.skills)
      ? (profile.skills as Array<{ id: string; name: string; description?: string }>).map(
        (s) => ({ id: s.id, name: s.name, description: s.description ?? "" }),
      )
      : [],
  };
}

/** Build the PATCH payload — only send changed fields, send null to clear */
function buildPatch(
  form: EditForm,
  original: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const strFields = ["displayName", "avatarUrl", "bio", "location", "website"] as const;
  for (const key of strFields) {
    const newVal = form[key].trim();
    const origVal = ((original[key] as string) ?? "").trim();
    if (newVal !== origVal) {
      patch[key] = newVal || null;
    }
  }

  const origCaps = Array.isArray(original.capabilities)
    ? (original.capabilities as string[])
    : [];
  if (JSON.stringify(form.capabilities) !== JSON.stringify(origCaps)) {
    patch.capabilities = form.capabilities.length > 0 ? form.capabilities : null;
  }

  const origSkills = Array.isArray(original.skills)
    ? (original.skills as Array<{ id: string; name: string; description?: string }>)
    : [];
  const formSkillsClean = form.skills
    .filter((s) => s.name.trim())
    .map((s) => ({
      id: s.id || s.name.toLowerCase().replace(/\s+/g, "-"),
      name: s.name.trim(),
      ...(s.description.trim() ? { description: s.description.trim() } : {}),
    }));
  if (JSON.stringify(formSkillsClean) !== JSON.stringify(origSkills)) {
    patch.skills = formSkillsClean.length > 0 ? formSkillsClean : null;
  }

  return patch;
}

export default function AgentProfile() {
  const { t, formatDate } = useI18n();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const { data: account, isLoading: loadingProfile, isError: profileError } = useAccount(agentId);
  const { data: ownedAccounts } = useAccounts();
  const { data: postsData, isLoading: loadingPosts, fetchNextPage, hasNextPage, isFetchingNextPage } = usePosts(
    agentId ? { authorAccountId: agentId } : undefined,
  );
  const { mutate: likePost } = useLikePost();
  const { mutate: repostPost } = useRepostPost();
  const updateProfile = useUpdateProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm);
  const [capInput, setCapInput] = useState("");

  const allPosts = postsData?.pages.flat() ?? [];
  const isOwner = !!(ownedAccounts ?? []).find((a) => a.id === agentId);

  if (loadingProfile) {
    return <ProfileSkeleton />;
  }

  if (profileError || !account) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-danger">{t("agentProfile.profileNotFound")}</p>
        <Link to="/app/agents">
          <Button variant="outline" className="rounded-full">
            {t("agentProfile.back")}
          </Button>
        </Link>
      </div>
    );
  }

  const profile = account.profile as Record<string, unknown>;
  const displayName = (profile.displayName as string | undefined) || account.name;
  const avatarUrl = profile.avatarUrl as string | undefined;
  const bio = profile.bio as string | undefined;
  const location = profile.location as string | undefined;
  const website = profile.website as string | undefined;
  const capabilities = Array.isArray(profile.capabilities)
    ? (profile.capabilities as string[])
    : [];
  const skills = Array.isArray(profile.skills)
    ? (profile.skills as Array<{ id: string; name: string; description?: string }>)
    : [];

  function startEditing() {
    setEditForm(formFromProfile(profile));
    setCapInput("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setCapInput("");
  }

  function handleSave() {
    if (!agentId) return;
    const patch = buildPatch(editForm, profile);
    if (Object.keys(patch).length === 0) {
      setIsEditing(false);
      return;
    }
    updateProfile.mutate(
      { accountId: agentId, profile: patch },
      {
        onSuccess: () => {
          toast.success(t("agentProfile.profileUpdated"));
          setIsEditing(false);
        },
        onError: () => {
          toast.error(t("agentProfile.profileUpdateFailed"));
        },
      },
    );
  }

  function addCapability(value: string) {
    const trimmed = value.trim();
    if (!trimmed || editForm.capabilities.length >= 20) return;
    if (editForm.capabilities.includes(trimmed)) return;
    setEditForm((f) => ({ ...f, capabilities: [...f.capabilities, trimmed] }));
  }

  function removeCapability(index: number) {
    setEditForm((f) => ({
      ...f,
      capabilities: f.capabilities.filter((_, i) => i !== index),
    }));
  }

  function addSkill() {
    if (editForm.skills.length >= 50) return;
    setEditForm((f) => ({
      ...f,
      skills: [...f.skills, { id: "", name: "", description: "" }],
    }));
  }

  function updateSkill(index: number, field: "name" | "description", value: string) {
    setEditForm((f) => ({
      ...f,
      skills: f.skills.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      ),
    }));
  }

  function removeSkill(index: number) {
    setEditForm((f) => ({
      ...f,
      skills: f.skills.filter((_, i) => i !== index),
    }));
  }

  const editAvatarUrl = isEditing ? editForm.avatarUrl.trim() : undefined;
  const resolvedAvatarUrl = isEditing ? editAvatarUrl : avatarUrl;
  const resolvedDisplayName = isEditing
    ? editForm.displayName.trim() || account.name
    : displayName;

  return (
    <div className="mx-auto max-w-[700px]">
      {/* Banner */}
      <div className="relative h-48 bg-brand-gradient">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_80%,rgba(255,255,255,0.12),transparent_60%)]" />
      </div>

      {/* Profile header */}
      <div className="relative border-x border-b border-border bg-background px-5 pb-4">
        {/* Avatar row */}
        <div className="relative flex items-start justify-between">
          <div className="-mt-16">
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt={resolvedDisplayName}
                className="h-32 w-32 rounded-full border-4 border-background bg-muted object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`flex h-32 w-32 items-center justify-center rounded-full border-4 border-background ${avatarGradientClass(resolvedDisplayName)} text-3xl font-bold text-white`}>
                {initials(resolvedDisplayName)}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2">
            {isOwner && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-2"
                onClick={startEditing}
              >
                <Pencil className="h-4 w-4" />
                {t("agentProfile.editProfile")}
              </Button>
            )}
            {isEditing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={cancelEditing}
                  disabled={updateProfile.isPending}
                >
                  {t("agentProfile.cancelEdit")}
                </Button>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={handleSave}
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending
                    ? t("agentProfile.saving")
                    : t("agentProfile.saveProfile")}
                </Button>
              </>
            )}
            {!isEditing && (
              <Link to="/app/agents">
                <Button variant="outline" size="sm" className="rounded-full gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {t("agentProfile.back")}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-3 space-y-4">
            {/* Display Name */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.displayNameLabel")}
              </label>
              <Input
                value={editForm.displayName}
                onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                maxLength={50}
                placeholder={account.name}
              />
            </fieldset>

            {/* Avatar URL */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.avatarUrlLabel")}
              </label>
              <Input
                type="url"
                value={editForm.avatarUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, avatarUrl: e.target.value }))}
                placeholder="https://..."
              />
            </fieldset>

            {/* Bio */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.bioLabel")}
              </label>
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                maxLength={280}
                rows={3}
                className="surface-input w-full min-w-0 rounded-[var(--radius-sm)] border-transparent px-3 py-2 text-sm transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {editForm.bio.length}/280
              </p>
            </fieldset>

            {/* Location */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.locationLabel")}
              </label>
              <Input
                value={editForm.location}
                onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                maxLength={100}
              />
            </fieldset>

            {/* Website */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.websiteLabel")}
              </label>
              <Input
                type="url"
                value={editForm.website}
                onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
              />
            </fieldset>

            {/* Capabilities — tag input */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.capabilitiesLabel")}
              </label>
              {editForm.capabilities.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {editForm.capabilities.map((cap, i) => (
                    <span
                      key={i}
                      className="surface-chip inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium"
                    >
                      {cap}
                      <button
                        type="button"
                        onClick={() => removeCapability(i)}
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {editForm.capabilities.length < 20 && (
                <Input
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addCapability(capInput);
                      setCapInput("");
                    }
                  }}
                  placeholder={t("agentProfile.addCapability")}
                />
              )}
            </fieldset>

            {/* Skills — list editor */}
            <fieldset>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("agentProfile.skillsLabel")}
              </label>
              {editForm.skills.length > 0 && (
                <div className="mb-2 space-y-2">
                  {editForm.skills.map((skill, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={skill.name}
                        onChange={(e) => updateSkill(i, "name", e.target.value)}
                        placeholder={t("agentProfile.skillName")}
                        className="flex-1"
                      />
                      <Input
                        value={skill.description}
                        onChange={(e) => updateSkill(i, "description", e.target.value)}
                        placeholder={t("agentProfile.skillDescription")}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeSkill(i)}
                        className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editForm.skills.length < 50 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={addSkill}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("agentProfile.addSkill")}
                </Button>
              )}
            </fieldset>
          </div>
        ) : (
          <>
            {/* Name + handle */}
            <div className="mb-2 mt-3">
              <h1 className="text-heading-1 text-foreground">{displayName}</h1>
              <p className="text-caption text-muted-foreground">@{account.id.slice(0, 8)}</p>
            </div>

            {/* Bio */}
            {bio ? (
              <p className="text-body mb-3 text-foreground">{bio}</p>
            ) : (
              <p className="text-body mb-3 text-muted-foreground italic">{t("agentProfile.noBio")}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              {location && (
                <span className="text-caption flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {location}
                </span>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-caption flex items-center gap-1 text-brand hover:underline"
                >
                  <LinkIcon className="h-4 w-4" />
                  {website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span className="text-caption flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {t("agentProfile.joinedDate")} {formatDate(account.createdAt)}
              </span>
            </div>

            {/* Capabilities */}
            {capabilities.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("agentProfile.capabilities")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="surface-chip rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("agentProfile.skills")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <span
                      key={skill.id}
                      title={skill.description}
                      className="surface-chip rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium"
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Account type badge */}
            <div className="mt-3">
              <span className="surface-chip rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-tighter">
                {account.type}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Posts tab header */}
      <div className="border-x border-b border-border bg-background">
        <div className="flex justify-center border-b-2 border-[hsl(var(--color-brand))] py-3 text-sm font-semibold text-foreground">
          {t("agentProfile.posts")}
        </div>
      </div>

      {/* Posts feed */}
      <div className="border-x border-border bg-background">
        {loadingPosts ? (
          <div className="space-y-3 p-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : allPosts.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-10 w-10" />}
            title={t("agentProfile.noPosts")}
          />
        ) : (
          <>
            {allPosts.map((post) => (
              <PlazaPostCard
                key={post.id}
                post={post}
                onLike={(postId, liked) => likePost({ postId, liked })}
                onRepost={(postId, reposted) => repostPost({ postId, reposted })}
              />
            ))}
            {hasNextPage && (
              <div className="border-t border-border px-4 py-5">
                <Button
                  variant="ghost"
                  className="w-full rounded-full text-brand hover:bg-[hsl(var(--color-brand)/0.1)] hover:text-[hsl(var(--color-brand-emphasis))]"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? t("agentProfile.loadingProfile")
                    : t("agentProfile.showMorePosts")}
                </Button>
              </div>
            )}
            {!hasNextPage && allPosts.length > 0 && (
              <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
                {t("agentProfile.nothingMoreToShow")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
