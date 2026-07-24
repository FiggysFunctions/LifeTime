// A little burst of colour when you finish something — the immediate reward
// that makes ticking things off feel good. Silent, self-contained, and
// skipped entirely when the device asks for reduced motion.
export function celebrate(originX?: number, originY?: number) {
  if (
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;

  const colors = ["#0f9d8f", "#f0b03f", "#f4808b", "#67aef5", "#82c46f", "#a78bfa"];
  const x = originX ?? window.innerWidth / 2;
  const y = originY ?? window.innerHeight * 0.38;

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:120;overflow:hidden";
  document.body.appendChild(box);

  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 7;
    p.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
      `background:${colors[i % colors.length]};border-radius:${Math.random() < 0.5 ? "50%" : "2px"};`;
    box.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 180;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 80; // slight upward bias
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${dx}px, ${dy + 340}px) rotate(${Math.random() * 720 - 360}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1100 + Math.random() * 700,
        easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
        fill: "forwards",
      }
    );
  }
  setTimeout(() => box.remove(), 2000);
}
