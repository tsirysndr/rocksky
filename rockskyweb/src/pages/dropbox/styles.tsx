import styled from "@emotion/styled";
import { Link } from "react-router";

export const Directory = styled(Link)`
  color: #000;
  margin-left: 10px;
  text-decoration: none;
  width: calc(100vw - 500px);
  max-width: calc(100vw - 500px);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  &:hover {
    text-decoration: underline;
  }
`;

export const AudioFile = styled.div`
  color: #000;
  margin-left: 10px;
  text-decoration: none;
  width: calc(100vw - 500px);
  max-width: calc(100vw - 500px);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`;

export const BackButton = styled.button`
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  width: 30px;
  left: 18vw;
  top: 0px;
  border-radius: 15px;
  background-color: #f7f7f8;
  margin-top: 100px;
  margin-bottom: 46px;
  position: fixed;
  z-index: 1;
  // media query for mobile
  @media (max-width: 1820px) {
    left: 10px;
  }
`;
