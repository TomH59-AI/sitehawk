const ICON_URL = "https://media.base44.com/images/public/69dd277f9504047a559d5834/ae3d929ef_SiteHawk_Icon_512.png";

export default function HawkIcon({ size = 32, className = "" }) {
  return (
    <img
      src={ICON_URL}
      width={size}
      height={size}
      alt="SiteHawk"
      className={`rounded-xl ${className}`}
      style={{ objectFit: "contain" }}
    />
  );
}