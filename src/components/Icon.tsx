interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export default function Icon({ name, size = 18, style, className }: IconProps) {
  return (
    <span
      className={`material-icons${className ? " " + className : ""}`}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
