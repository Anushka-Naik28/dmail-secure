import { useEffect, useState } from "react"
import Image from "next/image"

interface LogoProps {
    size?: number;
    className?: string;
    showText?: boolean;
    layout?: "horizontal" | "vertical";
}

export default function Logo({ 
    size = 32, 
    className = "", 
    showText = true,
    layout = "horizontal" 
}: LogoProps) {
    const isVertical = layout === "vertical";
    const [theme, setTheme] = useState<"light" | "dark">("dark");

    useEffect(() => {
        const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark" || "dark";
        setTheme(currentTheme);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "data-theme") {
                    const newTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark" || "dark";
                    setTheme(newTheme);
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const isDark = theme === "dark";

    return (
        <div className={`flex ${isVertical ? "flex-col" : "items-center"} gap-3 ${className}`} style={{
            display: "flex",
            flexDirection: isVertical ? "column" : "row",
            alignItems: "center",
            width: "fit-content"
        }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "none" }}>
                <Image
                    src="/logo-gold-final.png"
                    alt="ETHREX DMail Logo"
                    width={size}
                    height={size}
                    priority
                    className="object-contain"
                    style={{
                        background: "none",
                        filter: "drop-shadow(0 0 8px rgba(212,160,23,0.3))",
                        transition: "all 0.3s ease",
                        display: "block"
                    }}
                />
            </div>

            {showText && (
                <div style={{
                    display: "flex",
                    flexDirection: isVertical ? "column" : "row",
                    alignItems: isVertical ? "center" : "baseline",
                    gap: isVertical ? "2px" : "8px",
                    marginLeft: isVertical ? "0" : "4px",
                    textAlign: isVertical ? "center" : "left",
                    whiteSpace: "nowrap"
                }}>
                    <span style={{
                        fontFamily: "'Cinzel', serif",
                        fontWeight: "800",
                        fontSize: isVertical ? `${size * 0.45}px` : `${size * 0.45}px`,
                        letterSpacing: "1px",
                        background: "linear-gradient(135deg, var(--gold-light) 0%, var(--gold-mid) 50%, var(--gold-rich) 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        textShadow: isDark ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
                        textTransform: "uppercase",
                        lineHeight: 1,
                        transition: "all 0.3s ease",
                        display: "inline-block"
                    }}>
                        ETHREX
                    </span>
                    <span style={{
                        fontFamily: "'Cinzel', serif",
                        fontWeight: "800",
                        fontSize: isVertical ? `${size * 0.45}px` : `${size * 0.45}px`,
                        letterSpacing: isVertical ? "4px" : "1.5px",
                        background: "linear-gradient(135deg, var(--gold-light) 0%, var(--gold-mid) 50%, var(--gold-rich) 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        textShadow: isDark ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
                        textTransform: "uppercase",
                        lineHeight: 1,
                        transition: "all 0.3s ease",
                        display: "inline-block"
                    }}>
                        DMAIL
                    </span>
                </div>
            )}
        </div>
    )
}