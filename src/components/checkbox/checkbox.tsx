import styled from "@emotion/styled";

type TCheckboxProps = {
  label: string;
  checked?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const CheckboxComponent = styled.input`
  appearance: none;
  -webkit-appearance: none;
  width: 2.4rem;
  height: 2.4rem;
  border: 0.2rem solid #6d6d6d;
  border-radius: 0.4rem;
  outline: none;
  cursor: pointer;
  background-color: #32383b;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
  margin-right: 1rem;

  &:checked {
    background-color: #8b0000;
    border-color: #6d6d6d;
  }

  &:checked::after {
    content: "✓";
    display: flex;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    font-size: 1.6rem;
    font-weight: bold;
  }

  &:hover {
    background-color: #8b0000;
  }
`;

export const Checkbox = ({ label, checked, onChange }: TCheckboxProps) => {
  return (
    <CheckboxWrapper>
      <CheckboxComponent
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
      <label>{label}</label>
    </CheckboxWrapper>
  );
};
