import styled from "@emotion/styled";
import { IconChevronDown } from "@tabler/icons-react";

const Wrapper = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

const Select = styled.select`
  appearance: none;
  -webkit-appearance: none;
  padding: 8px 36px 8px 16px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
  font-family: "Space Grotesk", sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: rgba(168, 85, 247, 0.5);
  }

  &:focus-visible {
    outline: 2px solid #a855f7;
    outline-offset: 2px;
  }

  option {
    background: #1a0035;
    color: #fff;
  }
`;

const Chevron = styled(IconChevronDown)`
  position: absolute;
  right: 14px;
  pointer-events: none;
  color: #fff;
  opacity: 0.6;
`;

export default function WrappedSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <Wrapper>
      <Select
        aria-label={ariaLabel}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.id) === e.target.value);
          if (picked) onChange(picked.id);
        }}
      >
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </Select>
      <Chevron size={16} />
    </Wrapper>
  );
}
