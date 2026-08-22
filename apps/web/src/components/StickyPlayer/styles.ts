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
  background-color: var(--color-play-button);
  cursor: pointer;
  margin-left: 5px;
  margin-right: 5px;

  /* Same glass circle as the fullscreen player's embedded bar. */
  .dark & {
    background-color: rgba(255, 255, 255, 0.15);
  }
`;

export const PreviousButton = styled.button`
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  width: 42px;
  border-radius: 24px;
  background-color: var(--color-background);
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
  background-color: var(--color-background);
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
  background-color: transparent;
  outline: none;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background-color: transparent;
  }

  &:focus-visible {
    outline: none;
  }

  ${(props) =>
    props.disabled &&
    css`
      opacity: 0.5;
      background-color: transparent;
      cursor: not-allowed;
    `}
`;

export const MainWrapper = styled.div`
  width: clamp(220px, 30vw, 380px);
  margin-left: 10px;
  margin-right: 10px;
`;

/* Left and right columns share the same flex-basis so the controls +
   progress bar group in between stays exactly centered regardless of how
   long the track title or how many right-side actions there are. */
export const LeftSection = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
`;

export const RightActions = styled.div`
  flex: 1 1 0;
  display: flex;
  justify-content: flex-end;
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
