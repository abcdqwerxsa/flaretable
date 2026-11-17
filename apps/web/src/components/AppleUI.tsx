import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * Apple HIG 触感圆角复选框（替代浏览器原生方框）
 */
export function IOSCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="inline-flex items-center gap-2 group focus:outline-none cursor-pointer"
    >
      <span
        className={`w-[17px] h-[17px] rounded-[6px] flex items-center justify-center transition-all ios-press ${
          checked
            ? 'bg-[#007AFF] border border-[#007AFF] text-white shadow-[0_1px_4px_rgba(0,122,255,0.3)]'
            : 'bg-white border-[1.5px] border-black/20 group-hover:border-[#007AFF]/60'
        }`}
      >
        {checked && <Check className="w-3 h-3" strokeWidth={2.8} />}
      </span>
      {label && <span className="text-[13px] text-[#1D1D1F]">{label}</span>}
    </button>
  );
}

/**
 * iPadOS 原生绿色滑动开关 (UISwitch)
 */
export function IOSSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-[#34C759]' : 'bg-[#787880]/25'
      }`}
    >
      <span
        className={`inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.2)] transition-transform duration-200 ${
          checked ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

type SquircleTone = 'blue' | 'green' | 'indigo' | 'orange' | 'purple' | 'slate';

const SQUIRCLE_TONES: Record<SquircleTone, string> = {
  blue: 'bg-gradient-to-b from-[#2E94FF] to-[#007AFF] text-white shadow-[0_2px_6px_rgba(0,122,255,0.28)]',
  green: 'bg-gradient-to-b from-[#4CD964] to-[#34C759] text-white shadow-[0_2px_6px_rgba(52,199,89,0.28)]',
  indigo: 'bg-gradient-to-b from-[#7370FF] to-[#5856D6] text-white shadow-[0_2px_6px_rgba(88,86,214,0.28)]',
  orange: 'bg-gradient-to-b from-[#FFAA33] to-[#FF9500] text-white shadow-[0_2px_6px_rgba(255,149,0,0.28)]',
  purple: 'bg-gradient-to-b from-[#C66DF2] to-[#AF52DE] text-white shadow-[0_2px_6px_rgba(175,82,222,0.28)]',
  slate: 'bg-[#767680]/12 text-[#1D1D1F]',
};

/**
 * iPadOS 圆角矩形彩色图标容器
 */
export function IOSSquircleIcon({
  tone = 'blue',
  size = 'md',
  children,
}: {
  tone?: SquircleTone;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const sizeClass =
    size === 'sm'
      ? 'w-6 h-6 rounded-[7px]'
      : size === 'lg'
        ? 'w-10 h-10 rounded-[12px]'
        : 'w-7 h-7 rounded-[8px]';
  return (
    <div className={`${sizeClass} flex items-center justify-center shrink-0 ${SQUIRCLE_TONES[tone]}`}>
      {children}
    </div>
  );
}

/**
 * iPadOS Sheet / 抽屉顶部拖拽条
 */
export function IOSSheetGrabber() {
  return (
    <div className="w-full flex justify-center pt-2 pb-0.5 shrink-0">
      <div className="w-9 h-1 rounded-full bg-black/15" />
    </div>
  );
}
