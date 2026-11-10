import { AppError } from "../../../domain/error.js";
import { normalizeContact, sanitizeAnalytics, splitName } from "../domain/rules.js";
import type { Profile, Settings } from "../domain/ports.js";
import { AuthCore } from "./core.js";

/**
 * The signed-in user's own profile, onboarding answers and preferences.
 *
 * The reads create the default row when a user has none yet, so a freshly registered account
 * always answers with something rather than a 404.
 */
export class AuthProfile {
  constructor(private readonly core: AuthCore) {}

  async getMe(id: string) {
    return this.core.run(async (repo) => ({
      user: await this.core.current(repo, id),
      profile: await this.core.ensureProfile(repo, id),
    }));
  }
  async updateMe(
    id: string,
    data: {
      full_name?: string | null;
      first_name?: string;
      last_name?: string | null;
      middle_name?: string | null;
      phone?: string | null;
      email?: string | null;
      gender?: Profile["gender"];
      birth_date?: string | null;
      city?: string | null;
      injuries?: string | null;
    },
  ) {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      const profile = await this.core.ensureProfile(repo, id);
      if ("phone" in data && data.phone !== user.phone) {
        if (user.phone_verified)
          throw new AppError("conflict", "Verified phone is changed via the contact change flow");
        await this.core.available(repo, data.phone ?? null, user.id);
        user.phone = data.phone ?? null;
        user.phone_verified = false;
      }
      if ("email" in data) {
        const email = data.email ? normalizeContact(data.email) : null;
        if (email !== user.email) {
          if (user.email_verified)
            throw new AppError("conflict", "Verified email is changed via the contact change flow");
          if (!email) throw new AppError("validation_error", "Email cannot be removed");
          await this.core.available(repo, email, id);
          user.email = email;
        }
      }
      if (data.full_name != null) Object.assign(profile, splitName(data.full_name));
      for (const field of ["first_name", "last_name", "middle_name"] as const)
        if (field in data) Object.assign(profile, { [field]: data[field]?.trim() || null });
      if (
        data.full_name != null ||
        ["first_name", "last_name", "middle_name"].some((f) => f in data)
      ) {
        if (!profile.first_name) throw new AppError("validation_error", "First name is required");
        profile.full_name = [profile.last_name, profile.first_name, profile.middle_name]
          .filter(Boolean)
          .join(" ");
      }
      for (const field of ["gender", "birth_date", "city", "injuries"] as const) {
        if (field in data) Object.assign(profile, { [field]: data[field] ?? null });
      }
      await repo.saveUser(user);
      await repo.saveProfile(id, profile);
      return { user, profile };
    });
  }
  async completeOnboarding(
    id: string,
    data: {
      gender: NonNullable<Profile["gender"]>;
      birth_date: string;
      weight: number;
      height: number;
      clients_per_month?: number | null;
    },
  ) {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      const profile = await this.core.ensureProfile(repo, id);
      profile.gender = data.gender;
      profile.birth_date = data.birth_date;
      profile.clients_per_month = data.clients_per_month ?? null;
      await repo.saveProfile(id, profile);
      await repo.saveOnboardingMeasurement(
        id,
        this.core.now().toISOString().slice(0, 10),
        data.height,
        data.weight,
      );
      return { user, profile };
    });
  }
  async getSettings(id: string): Promise<Settings> {
    return this.core.run(async (repo) => {
      await this.core.current(repo, id);
      return this.core.ensureSettings(repo, id);
    });
  }
  async updateSettings(
    id: string,
    data: {
      theme?: string | null;
      notifications_enabled?: boolean | null;
      analytics_config?: Record<string, unknown> | null;
    },
  ): Promise<Settings> {
    return this.core.run(async (repo) => {
      await this.core.current(repo, id);
      const settings = await this.core.ensureSettings(repo, id);
      for (const field of ["theme", "notifications_enabled"] as const) {
        if (field in data) {
          if (data[field] == null)
            throw new AppError("validation_error", `${field} cannot be null`);
          Object.assign(settings, { [field]: data[field] });
        }
      }
      if ("analytics_config" in data)
        settings.analytics_config =
          data.analytics_config == null ? null : sanitizeAnalytics(data.analytics_config);
      await repo.saveSettings(id, settings);
      return settings;
    });
  }
}
