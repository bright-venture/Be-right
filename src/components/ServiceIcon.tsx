// Hand-drawn style stroke icons per service category.
export function ServiceIcon({
  id,
  className = "h-8 w-8",
}: {
  id: string;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "plumbing":
      return (
        <svg {...common}>
          <path d="M6 8h8v6l-4 2v6" />
          <path d="M14 8V5h6" />
          <path d="M10 22c0 3-2 4-2 6a3 3 0 0 0 6 0c0-2-2-3-2-6" />
          <path d="M22 20c2 1 4 3 4 5a3.5 3.5 0 0 1-7 0c0-2 1.5-4 3-5z" />
        </svg>
      );
    case "electrical":
      return (
        <svg {...common}>
          <path d="M18 3 8 18h6l-2 11 12-16h-7l3-10z" />
        </svg>
      );
    case "ac":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="26" height="10" rx="3" />
          <path d="M3 12h26" />
          <circle cx="24" cy="9" r="1" fill="currentColor" />
          <path d="M8 21c0 2-2 2-2 4M14 21c0 2-2 2-2 4M20 21c0 2-2 2-2 4M26 21c0 2-2 2-2 4" />
        </svg>
      );
    case "carpentry":
      return (
        <svg {...common}>
          <path d="M5 27 19 13l4 4L9 31z" />
          <path d="m19 13 3-3c2-2 5-2 7 0l-6 6z" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "painting":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="18" height="9" rx="2" />
          <path d="M22 9h4v6h-9v4" />
          <rect x="14" y="19" width="6" height="9" rx="1.5" />
        </svg>
      );
    case "cleaning":
      return (
        <svg {...common}>
          <path d="m16 3 1.7 4.8L22 9.5l-4.3 1.7L16 16l-1.7-4.8L10 9.5l4.3-1.7z" />
          <path d="m24 17 1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1z" />
          <path d="m8 19 .9 2.4 2.4.9-2.4.9L8 25.6l-.9-2.4-2.4-.9 2.4-.9z" />
        </svg>
      );
    case "porter":
      return (
        <svg {...common}>
          <path d="M4 12 16 5l12 7-12 7z" />
          <path d="M4 12v9l12 7v-9" />
          <path d="M28 12v9l-12 7" />
          <path d="m10 8.5 12 7" />
        </svg>
      );
    case "valet":
      return (
        <svg {...common}>
          <circle cx="16" cy="18" r="9" />
          <path d="M16 9V5M12 5h8" />
          <path d="M12 14h4l3 4-3 4h-4z" />
        </svg>
      );
    case "security":
      return (
        <svg {...common}>
          <path d="M16 3 6 7v8c0 7 4.5 11.5 10 14 5.5-2.5 10-7 10-14V7z" />
          <path d="m11.5 16 3 3 6-6" />
        </svg>
      );
    case "landscaping":
      return (
        <svg {...common}>
          {/* stylized tree with ground line */}
          <path d="M16 27v-8" />
          <path d="M16 19c-4.5 0-8-3.5-8-8 0-4 3-7 8-7s8 3 8 7c0 4.5-3.5 8-8 8z" />
          <path d="M16 8v11M11.5 11l4.5 4.5M20.5 11 16 15.5" />
          <path d="M5 27h22" />
          <path d="M8 23c1-1.5 2-1.5 3 0M21 23c1-1.5 2-1.5 3 0" />
        </svg>
      );
    case "appliance":
      return (
        <svg {...common}>
          <rect x="7" y="3" width="18" height="26" rx="3" />
          <circle cx="16" cy="17" r="6" />
          <circle cx="16" cy="17" r="2" />
          <path d="M11 7h4M20 7h1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="12" />
        </svg>
      );
  }
}
