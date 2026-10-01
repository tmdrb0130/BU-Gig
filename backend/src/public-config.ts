import { Config } from "./config";
import { demand } from "./shared";
export function publicConfig(config: Config) {
  const termsUrl = process.env.TERMS_URL || null,
    privacyUrl = process.env.PRIVACY_URL || null;
  const termsVersion = process.env.TERMS_VERSION || "development",
    privacyVersion = process.env.PRIVACY_VERSION || "development";
  const registrationEnabled =
    !config.production ||
    !!(
      termsUrl?.startsWith("https://") &&
      privacyUrl?.startsWith("https://") &&
      process.env.TERMS_VERSION &&
      process.env.PRIVACY_VERSION
    );
  return {
    termsUrl,
    privacyUrl,
    termsVersion,
    privacyVersion,
    registrationEnabled,
    mailMode: config.production ? "smtp" : config.mail,
    oauthProviders: registrationEnabled
      ? ["kakao", "naver"].filter(
          (p) =>
            process.env[p.toUpperCase() + "_CLIENT_ID"] &&
            (p !== "naver" || process.env.NAVER_CLIENT_SECRET),
        )
      : [],
  };
}
export function validateConsents(
  config: Config,
  consents: { type: string; version: string }[],
) {
  const p = publicConfig(config);
  demand(p.registrationEnabled, "REGISTRATION_NOT_READY", 503);
  if (config.production)
    for (const c of consents)
      demand(
        c.version === (c.type === "TERMS" ? p.termsVersion : p.privacyVersion),
        "CONSENT_VERSION_CHANGED",
        409,
      );
}
