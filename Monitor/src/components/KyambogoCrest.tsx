// Kyambogo University crest — inline SVG fallback used when no official
// logo file is present. The official logo takes precedence: drop it at
// public/kyambogo-logo.png and it is picked up automatically (see Navbar).

export function KyambogoCrest({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Kyambogo University crest"
    >
      {/* shield */}
      <path
        d="M16 1.5 L28.5 5.5 V15.2 C28.5 22.6 23.2 27.6 16 30.5 C8.8 27.6 3.5 22.6 3.5 15.2 V5.5 Z"
        fill="#1B5EA9"
      />
      <path
        d="M16 4.1 L25.9 7.4 V15.2 C25.9 21 21.4 25.1 16 27.6 C10.6 25.1 6.1 21 6.1 15.2 V7.4 Z"
        fill="#ffffff"
      />
      {/* torch — flame */}
      <path d="M16 5.8 C13.4 9.4 12.2 11.6 12.2 13.7 C12.2 15.9 13.9 17.5 16 17.5 C18.1 17.5 19.8 15.9 19.8 13.7 C19.8 11.6 18.6 9.4 16 5.8 Z" fill="#F8B13A" />
      {/* torch — handle */}
      <path d="M15.2 17.8 H16.8 L16.6 22.8 H15.4 Z" fill="#F8B13A" />
      {/* torch — base */}
      <rect x="14.2" y="22.8" width="3.6" height="1.8" rx="0.9" fill="#F8B13A" />
      {/* open book */}
      <path
        d="M6.9 20.4 C6.9 20.4 11.3 20.8 16 22.6 C20.7 20.8 25.1 20.4 25.1 20.4 V26.8 C25.1 26.8 20.7 27.2 16 29 C11.3 27.2 6.9 26.8 6.9 26.8 Z"
        fill="#1B5EA9"
        opacity="0.9"
      />
      <path d="M16 22.6 V29" stroke="#ffffff" strokeWidth="0.9" />
    </svg>
  );
}
