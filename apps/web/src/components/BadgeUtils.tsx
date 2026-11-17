import type { ChoiceColor, FieldType } from '@flaretable/shared';
import {
  Braces,
  Calculator,
  Calendar,
  CheckSquare,
  ChevronDownCircle,
  Globe,
  Hash,
  Link2,
  ListChecks,
  Mail,
  Paperclip,
  SearchCheck,
  Type,
} from 'lucide-react';

/**
 * Apple HIG 柔和通透语义色胶囊（低饱和度半透明背景 + 高对比清晰文字）
 */
export const CHOICE_COLOR_CLASSES: Record<ChoiceColor, string> = {
  slate: 'bg-[#8E8E93]/12 text-[#48484A] border-transparent',
  blue: 'bg-[#007AFF]/12 text-[#0062CC] border-transparent',
  indigo: 'bg-[#5856D6]/12 text-[#4543B5] border-transparent',
  emerald: 'bg-[#34C759]/14 text-[#1E823C] border-transparent',
  amber: 'bg-[#FF9500]/14 text-[#B25E00] border-transparent',
  rose: 'bg-[#FF3B30]/12 text-[#C8231C] border-transparent',
  purple: 'bg-[#AF52DE]/12 text-[#8635B3] border-transparent',
  cyan: 'bg-[#32ADE6]/14 text-[#0071A4] border-transparent',
};

export const CHOICE_GRADIENT_COVERS: Record<ChoiceColor, string> = {
  slate: 'from-[#F2F2F7] to-[#E5E5EA]',
  blue: 'from-[#EAF3FF] to-[#D6E8FF]',
  indigo: 'from-[#EEEEFF] to-[#DCDDFD]',
  emerald: 'from-[#E9F9EE] to-[#D1F2DC]',
  amber: 'from-[#FFF4E5] to-[#FFE4C2]',
  rose: 'from-[#FFEBEA] to-[#FFD6D3]',
  purple: 'from-[#F7ECFC] to-[#EAD3F8]',
  cyan: 'from-[#E8F6FC] to-[#CFEAF7]',
};

export function getChoiceBadgeClass(color?: ChoiceColor): string {
  return CHOICE_COLOR_CLASSES[color ?? 'slate'] ?? CHOICE_COLOR_CLASSES.slate;
}

export function FieldTypeIcon({
  type,
  className = 'w-3.5 h-3.5',
}: {
  type: FieldType;
  className?: string;
}) {
  const sw = 1.85;
  switch (type) {
    case 'text':
      return <Type className={className} strokeWidth={sw} />;
    case 'number':
      return <Hash className={className} strokeWidth={sw} />;
    case 'single_select':
      return <ChevronDownCircle className={className} strokeWidth={sw} />;
    case 'multi_select':
      return <ListChecks className={className} strokeWidth={sw} />;
    case 'date':
      return <Calendar className={className} strokeWidth={sw} />;
    case 'checkbox':
      return <CheckSquare className={className} strokeWidth={sw} />;
    case 'url':
      return <Globe className={className} strokeWidth={sw} />;
    case 'email':
      return <Mail className={className} strokeWidth={sw} />;
    case 'json':
      return <Braces className={className} strokeWidth={sw} />;
    case 'attachment':
      return <Paperclip className={className} strokeWidth={sw} />;
    case 'link':
      return <Link2 className={className} strokeWidth={sw} />;
    case 'lookup':
      return <SearchCheck className={className} strokeWidth={sw} />;
    case 'formula':
      return <Calculator className={className} strokeWidth={sw} />;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
