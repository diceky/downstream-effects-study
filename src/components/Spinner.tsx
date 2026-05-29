interface Props {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export default function Spinner({ size = 16, color = "currentColor", style }: Props) {
  return (
    <span
      className="spinner"
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 8)),
        borderColor: `${color} transparent ${color} ${color}`,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
