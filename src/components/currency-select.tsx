import { ALL_CURRENCIES, COMMON_CURRENCIES } from '@/lib/money/currency';
import { Select } from './ui/input';

const common = new Set<string>(COMMON_CURRENCIES);

export function CurrencySelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <optgroup label="Common">
        {COMMON_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {ALL_CURRENCIES.filter((c) => !common.has(c)).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
