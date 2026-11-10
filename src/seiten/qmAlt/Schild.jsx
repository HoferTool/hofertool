// Kleines farbiges Schild für Status und Fälligkeit im QM alternativ
export function Schild({ ton, children, ...rest }) {
  return <span className={"qma-schild qma-ton--" + (ton || "grau")} {...rest}>{children}</span>;
}
