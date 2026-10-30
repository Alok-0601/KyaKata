import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) { return <Icon {...props}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Icon>; }
export function CheckIcon(props: IconProps) { return <Icon {...props}><path d="m5 12 4.2 4.2L19 6.5" /></Icon>; }
export function ChevronDownIcon(props: IconProps) { return <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>; }
export function CopyIcon(props: IconProps) { return <Icon {...props}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></Icon>; }
export function FileTextIcon(props: IconProps) { return <Icon {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Icon>; }
export function InfoIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>; }
export function MicIcon(props: IconProps) { return <Icon {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></Icon>; }
export function PauseIcon(props: IconProps) { return <Icon {...props}><path d="M8 5v14M16 5v14" /></Icon>; }
export function PlayIcon(props: IconProps) { return <Icon {...props}><path d="m9 5 10 7-10 7Z" /></Icon>; }
export function ReplayIcon(props: IconProps) { return <Icon {...props}><path d="M20 11a8 8 0 1 0 1.2 4.2" /><path d="M20 4v7h-7" /></Icon>; }
export function ShieldCheckIcon(props: IconProps) { return <Icon {...props}><path d="M12 22s8-3.7 8-10V5l-8-3-8 3v7c0 6.3 8 10 8 10Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></Icon>; }
export function SparklesIcon(props: IconProps) { return <Icon {...props}><path d="m12 3-1.2 4.3L7 8.5l3.8 1.2L12 14l1.2-4.3L17 8.5l-3.8-1.2ZM5 15l-.7 2.3L2 18l2.3.7L5 21l.7-2.3L8 18l-2.3-.7ZM19 15l-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7Z" /></Icon>; }
export function UploadIcon(props: IconProps) { return <Icon {...props}><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></Icon>; }
export function VolumeIcon(props: IconProps) { return <Icon {...props}><path d="M4 10v4h4l5 4V6l-5 4Z" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /></Icon>; }
export function XIcon(props: IconProps) { return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>; }
