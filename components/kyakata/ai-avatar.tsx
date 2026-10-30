export type AIAvatarState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface Props {
  state: AIAvatarState;
  className?: string;
}

const LABELS: Record<AIAvatarState, string> = {
  idle: "KyaKata assistant is ready",
  listening: "KyaKata assistant is listening",
  thinking: "KyaKata assistant is analyzing your documents",
  speaking: "KyaKata assistant is speaking",
  error: "KyaKata assistant needs attention",
};

/**
 * A compact, presentational avatar. Its state is supplied by the parent so it
 * never owns a second source of truth for microphone, request, or audio state.
 */
export function AIAvatar({ state, className = "" }: Props) {
  return (
    <div
      className={`ai-avatar ai-avatar--${state} ${className}`}
      role="img"
      aria-label={LABELS[state]}
    >
      <span className="ai-avatar__halo" aria-hidden="true" />
      <svg className="ai-avatar__art" viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="avatar-face" x1="16" y1="11" x2="64" y2="70" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="0.56" stopColor="#F0FCF9" />
            <stop offset="1" stopColor="#C9EEE7" />
          </linearGradient>
          <linearGradient id="avatar-rim" x1="15" y1="14" x2="66" y2="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8CE2D4" />
            <stop offset="1" stopColor="#168B80" />
          </linearGradient>
          <radialGradient id="avatar-cheek" cx="0" cy="0" r="1" gradientTransform="translate(40 48) rotate(90) scale(22)">
            <stop stopColor="#FFFFFF" stopOpacity="0.72" />
            <stop offset="1" stopColor="#E1F7F2" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="40" cy="40" r="34" fill="url(#avatar-rim)" opacity="0.2" />
        <circle cx="40" cy="40" r="29" fill="url(#avatar-face)" />
        <circle cx="40" cy="40" r="29" stroke="url(#avatar-rim)" strokeWidth="1.25" />
        <ellipse cx="40" cy="47" rx="21" ry="17" fill="url(#avatar-cheek)" />
        <path className="ai-avatar__shine" d="M26 23.5c4.2-5.2 10.1-7.8 17.6-7.8" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.86" />
        <g className="ai-avatar__eyes" fill="#163B4A">
          <circle cx="30.5" cy="36" r="3.25" />
          <circle cx="49.5" cy="36" r="3.25" />
        </g>
        <g className="ai-avatar__eye-shine" fill="white">
          <circle cx="31.6" cy="34.8" r="0.85" />
          <circle cx="50.6" cy="34.8" r="0.85" />
        </g>
        <path className="ai-avatar__mouth ai-avatar__mouth--smile" d="M33 47.5c1.8 2.8 4.2 4.2 7 4.2s5.2-1.4 7-4.2" stroke="#168B80" strokeWidth="2.25" strokeLinecap="round" />
        <ellipse className="ai-avatar__mouth ai-avatar__mouth--talk" cx="40" cy="49" rx="4.7" ry="2.8" fill="#168B80" />
        <g className="ai-avatar__thinking" stroke="#168B80" strokeLinecap="round">
          <path d="M58 23.5h5" strokeWidth="2.5" />
          <path d="M60.5 21v5" strokeWidth="2.5" />
          <circle cx="61.5" cy="33.5" r="1.45" fill="#168B80" stroke="none" />
          <circle cx="65.5" cy="38.5" r="1" fill="#168B80" stroke="none" />
        </g>
        <path className="ai-avatar__error" d="m36.7 35.4 6.6 6.6m0-6.6-6.6 6.6M40 20.5l11.8 20.4a2.6 2.6 0 0 1-2.25 3.9h-19.1a2.6 2.6 0 0 1-2.25-3.9L40 20.5Z" stroke="#C56A55" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{LABELS[state]}</span>
    </div>
  );
}
