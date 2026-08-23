import styled from "@emotion/styled";

export const Header = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 30px;
`;

export const HelpNote = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: -15px;
  margin-bottom: 30px;
  color: var(--color-text-muted);
  font-size: 14px;

  a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 600;
  }

  a:hover {
    opacity: 0.85;
  }
`;

export const Code = styled.div`
  background-color: #000;
  color: #fff;
  padding: 5px;
  display: inline-block;
  border-radius: 5px;
`;
