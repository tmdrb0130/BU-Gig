const assets = import.meta.glob(
  [
    "/image/baekseok_gig_assets_20260930/webp/home/*.webp",
    "/image/baekseok_gig_assets_20260930/webp/brand/*.webp",
  ],
  { eager: true, query: "?url", import: "default" },
);
export const asset = (path) =>
  assets[`/image/baekseok_gig_assets_20260930/webp/${path}.webp`];
