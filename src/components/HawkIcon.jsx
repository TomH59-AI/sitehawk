const ICON_URL = "https://media.base44.com/images/public/69dd277f9504047a559d5834/8441edcc4_logo-skyhawk.png";

export default function HawkIcon({ size = 32, className = "" }) {
  return (
    <img
      src={ICON_URL}
      width={size}
      height={size}
      alt="SiteHawk" className="opacity-100 rounded-xl drop-shadow-[0_0_8px_rgba(225,29,72,0.6)]"

      style={{ objectFit: "contain" }} />);


}