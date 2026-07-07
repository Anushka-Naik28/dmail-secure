"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

interface LogoProps {
    size?: number;
    className?: string;
    showText?: boolean;
    layout?: "horizontal" | "vertical";
}

export default function Logo({
    size = 100, // Base height
    className = "",
    showText = true,
    layout = "horizontal"
}: LogoProps) {
    const isVertical = layout === "vertical";
    const [theme, setTheme] = useState<"light" | "dark">("dark");
    const [cacheBuster, setCacheBuster] = useState("");

    useEffect(() => {
        setCacheBuster(`?v=${Date.now()}`); // Prevent hydration mismatch
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

    const scaleFactor = 3.5;
    const calculatedHeight = size * scaleFactor;
    const calculatedWidth = calculatedHeight * 1.5;

    return (
        <div
            className={`flex items-center ${className}`}
            style={{
                display: "flex",
                alignItems: "center",
                width: "fit-content"
            }}
        >
            <Image
                src={`/logo-combined-nobg.png${cacheBuster}`}
                alt="EtherX DMail Logo"
                width={calculatedWidth}
                height={calculatedHeight}
                priority
                unoptimized={true}
                className="object-contain"
                style={{
                    display: "block",
                    filter: theme === "dark" 
                        ? "brightness(1.2) contrast(1.1) drop-shadow(0 0 12px rgba(212, 175, 55, 0.6))"
                        : "brightness(0.95) contrast(1.2) drop-shadow(0 2px 8px rgba(184, 134, 11, 0.25))",
                }}
            />
        </div>
    )
}
