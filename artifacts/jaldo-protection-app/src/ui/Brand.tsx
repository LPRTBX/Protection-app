/** The JALDO logo, light and dark. One definition shared by every surface. */
export function Logo() {
  const base = import.meta.env?.BASE_URL ?? "/";
  return (
    <picture>
      <source srcSet={`${base}brand/jaldo-logo-white.webp`} media="(prefers-color-scheme: dark)" />
      <img className="logo" src={`${base}brand/jaldo-logo-navy.webp`} alt="JALDO" width="96" height="28" />
    </picture>
  );
}
