import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const PlayButton = styled.button`
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 45px;
  width: 45px;
  border-radius: 24px;
  background-color: #f4f4f4;
  cursor: pointer;
  margin-left: 5px;
  margin-right: 5px;
`;

export const PreviousButton = styled.button`
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  width: 42px;
  border-radius: 24px;
  background-color: #fff;
  cursor: pointer;
`;

export const NextButton = styled.button`
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  width: 42px;
  border-radius: 24px;
  cursor: pointer;
  background-color: #fff;
`;

export const Controls = styled.div`
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  flex-direction: row;
`;

export const Button = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  cursor: pointer;
  border: none;
  background-color: #fff;
  ${(props) =>
    props.disabled &&
    css`
      opacity: 0.5;
      cursor: not-allowed;
    `}
`;

export const MainWrapper = styled.div`
  flex: 1;
  margin-left: 10px;
  margin-right: 10px;
`;

export const RightActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const ProgressbarContainer = styled.div`
  cursor: pointer;
`;

export const LikeButton = styled.button`
  border: none;
  background: none;
  cursor: pointer;
`;

export const styles = {
  Progressbar: {
    BarContainer: {
      style: {
        marginLeft: 0,
        marginRight: 0,
      },
    },
    BarProgress: {
      style: () => ({
        backgroundColor: "rgb(254, 9, 156)",
      }),
    },
    Bar: {
      style: () => ({
        backgroundColor: "rgba(177, 178, 181, 0.218)",
      }),
    },
  },
};
